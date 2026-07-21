<?php
/**
 * Ok.station — Runner de catálogo del proveedor EXEL DEL NORTE (CLI, sin dependencias).
 * ---------------------------------------------------------------------------------
 * Baja el catálogo de Exel, filtra SOLO papelería, y hace un UPSERT masivo a la
 * tabla `products`. Segunda parte (Fase 3) la enriquece con Icecat.
 *
 * Uso:
 *   php backend/tools/exel-sync.php                 # jala de la API de Exel (.env)
 *   php backend/tools/exel-sync.php --dry-run       # no escribe, solo reporta
 *   php backend/tools/exel-sync.php --file=feed.json# lee de un archivo local (pruebas)
 *   php backend/tools/exel-sync.php --limit=100     # procesa a lo más N productos
 *   php backend/tools/exel-sync.php --solo-precios  # refresco LIGERO: precio+stock, SIN
 *                                                   # imágenes (para el cron por HORA; ver
 *                                                   # deploy/actualizar-precios.sh)
 *
 * Requiere en backend/.env:
 *   EXEL_API_BASE=https://api01.exeldelnorte.com.mx   (opcional; este es el default)
 *   EXEL_API_KEY=...                                  (obligatorio salvo con --file)
 *   EXEL_WAREHOUSE=4                                  (opcional; default 4)
 *   DATABASE_* (las mismas que usa el resto del backend)
 *
 * Solo CLI: hace un UPSERT masivo sobre `products` y pega a la API de Exel.
 * Por HTTP quedaría expuesto (el vhost no bloquea backend/tools/).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

/* ── Filtro de papelería: lista blanca por categoria_nombre de Exel ──
   Decisión de negocio (junta 2026-07-14): "Papelería + impresión".
   Todas las subcategorías de estas categorías se importan; el resto se descarta.
   La lista es ADITIVA a propósito: agregar una categoría que Exel no tenga no rompe
   nada (simplemente no hace match), y cubre el día que sí la traiga. TODAS deben ser
   de papelería: lo que no esté aquí (cómputo, accesorios…) NO entra a la tienda. */
const PAPELERIA_CATS = [
    'Oficina y Escolar',
    'Papel',
    'Consumibles',
    'Impresión y Multifuncionales',
    'Digitalización de Documentos',
    'Adhesivos y Cintas',
    'Archivo y Carpetas',
    'Engrapado y Perforado',
    'Escritura y Corrección',
    'Cuadernos y Libretas',
    'Etiquetas y Rotulación',
    'Calculadoras',
    'Arte y Manualidades',
];

/* ── Arranque: config + conexión + ShopCatalog (para el margen) ── */
$CONFIG = require __DIR__ . '/../api/config.php';
$d = $CONFIG['db'];
try {
    $PDO = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    fwrite(STDERR, "✗ No se pudo conectar a la BD. Revisa DATABASE_* en backend/.env\n  {$e->getMessage()}\n");
    exit(1);
}
/** Shim de db() para poder reusar ShopCatalog::margin() sin arrastrar _bootstrap. */
function db(): PDO { global $PDO; return $PDO; }
require __DIR__ . '/../api/lib/ShopCatalog.php';

/* ── Args ── */
$args    = array_slice($argv, 1);
$dryRun  = in_array('--dry-run', $args, true);
/* Censo detallado por SUBCATEGORÍA. Las categorías de Exel son muy amplias y mezclan:
   "Impresión y Multifuncionales" trae videocámaras y computadoras de escritorio, y
   "Consumibles" trae ruteadores. Filtrar por categoría deja entrar cómputo a una tienda
   que debe ser de papelería, así que primero hay que VER las subcategorías reales. */
$subcats = in_array('--subcats', $args, true);
if ($subcats) $dryRun = true;   // nunca escribe
/* Salta la salvaguarda de "feed incompleto" (ver más abajo). Úsalo solo cuando SABES
   que el catálogo se encogió de verdad (p. ej. Exel depuró su línea). */
$force   = in_array('--force', $args, true);
/* Refresco LIGERO (cron por hora): actualiza precio, stock y visibilidad, pero se salta
   las imágenes (fetch + reemplazo de /imagenes) e Icecat es un runner aparte que aquí no
   se toca. Deja el catálogo fresco en minutos, sin la churn de fotos ni carga de más a
   Exel. El pipeline completo (con fotos) sigue corriendo de noche. */
$soloPrecios = in_array('--solo-precios', $args, true);
$file   = null;
$limit  = 0;
foreach ($args as $a) {
    if (str_starts_with($a, '--file='))  $file  = substr($a, 7);
    if (str_starts_with($a, '--limit=')) $limit = max(0, (int) substr($a, 8));
}

$warehouse = (string) env('EXEL_WAREHOUSE', '4');
$margin    = ShopCatalog::margin();                 // reusa la lógica del 30% (settings.shop_margin)
$runStamp  = date('Y-m-d H:i:s');

echo "── Exel sync ──  " . ($dryRun ? "[DRY-RUN] " : "") . ($soloPrecios ? "[SOLO-PRECIOS] " : "") . "almacén={$warehouse}  margen={$margin}\n";

/* ── 1. Obtener el catálogo (API o archivo local) ── */
$raw = $file ? read_feed_file($file) : fetch_from_api();
echo "  Recibidos: " . count($raw) . " productos del origen\n";

/* ── 2. Filtrar SOLO papelería + normalizar ── */
$whitelist = array_map('norm', PAPELERIA_CATS);
$rows = [];
$descartados = 0;
$ofertas = 0;      // productos que Exel marca en oferta (alimenta "Ofertas del día")
/* Censo de las categorías REALES que manda Exel, para el informe del --dry-run.
   Nuestra lista blanca se escribió a mano SIN ver el catálogo real: si los nombres no
   empatan, esto se importaría vacío y sin saber por qué. Aquí queda a la vista. */
$censo = [];
foreach ($raw as $p) {
    $cat = (string) ($p['categoria_nombre'] ?? '');
    $pasa = in_array(norm($cat), $whitelist, true);
    $k = $cat === '' ? '(sin categoría)' : $cat;
    if (!isset($censo[$k])) $censo[$k] = ['n' => 0, 'pasa' => $pasa, 'subs' => []];
    $censo[$k]['n']++;
    $sub = trim((string) ($p['subcategoria_nombre'] ?? ''));
    if ($sub !== '') {
        $censo[$k]['subs'][$sub] = ($censo[$k]['subs'][$sub] ?? 0) + 1;
        /* Ejemplos de nombre: hay subcategorías cuyo nombre no dice qué son
           ("Marcas", "Resinas", "Ribbon"). Sin ver un producto real no se puede
           decidir si son papelería. */
        if (count($censo[$k]['ej'][$sub] ?? []) < 3) {
            $censo[$k]['ej'][$sub][] = mb_strimwidth(trim((string) ($p['nombre'] ?? '')), 0, 64, '…');
        }
    }

    if (!$pasa) { $descartados++; continue; }

    $cost = (float) ($p['precio'] ?? 0);

    /* "Tipo" del producto. Se usa `familia_nombre` y NO `subcategoria_nombre`: las
       subcategorías de Exel están mal etiquetadas de forma sistemática (los tóners
       salen como "Ruteador", los tambores como "Marcas", los marcadores como
       "Ribbon"), así que el cliente vería un filtro sin sentido. La familia sí
       describe el producto: TONERS, MARCADORES, TINTAS, CARPETAS, CUADERNO.
       Si un producto no trae familia, se cae a la subcategoría para no perder el dato. */
    $familia = trim((string) ($p['familia_nombre'] ?? ''));
    $tipo    = $familia !== '' ? $familia : trim((string) ($p['subcategoria_nombre'] ?? ''));

    /* Ofertas REALES del proveedor: Exel marca `oferta` y manda el precio de lista en
       `precio_sin_oferta`. `precio` ya viene con el descuento aplicado, así que ese es
       el costo. old_price se guarda con el margen puesto, igual que `price`, para que
       la tienda tache un precio comparable. Si Exel no marca oferta se deja en NULL: el
       UPSERT de abajo NO pisa un old_price puesto a mano desde el panel. */
    $enOferta   = !empty($p['oferta']);
    $sinOferta  = (float) ($p['precio_sin_oferta'] ?? 0);
    $oldPrice   = ($enOferta && $sinOferta > $cost) ? round($sinOferta * $margin, 2) : null;
    if ($oldPrice !== null) $ofertas++;

    $rows[] = [
        'supplier'       => 'exel',
        'supplier_ref'   => trim((string) ($p['referencia'] ?? '')),
        'supplier_id'    => (string) ($p['id'] ?? ''),
        'sku'            => trim((string) ($p['sku'] ?? '')),
        'barcode'        => trim((string) ($p['codigo_barras'] ?? '')),
        'sat_code'       => trim((string) ($p['codigo_sat'] ?? '')),
        'name'           => trim((string) ($p['nombre'] ?? '')),
        'description'    => $p['descripcion_extendida'] ?? null,
        'brand'          => trim((string) ($p['marca_nombre'] ?? '')),
        'category'       => trim($cat),
        'subcategory'    => $tipo,
        'currency'       => (string) ($p['moneda'] ?? 'MXN'),
        'cost'           => $cost,
        'price'          => round($cost * $margin, 2),   // = ShopCatalog::baseFor($cost), sin IVA
        'old_price'      => $oldPrice,
        'stock'          => (int) ($p['stock'] ?? 0),
        'warehouse_id'   => $warehouse,
        'last_synced_at' => $runStamp,
    ];
    if ($limit && count($rows) >= $limit) break;
}
echo "  Papelería: " . count($rows) . " a importar  ·  descartados (no papelería): {$descartados}\n";

/* El informe va ANTES de rendirse: si la lista blanca no empata con los nombres reales
   de Exel, "no hay nada que importar" no dice NADA. Esto sí dice qué mandó Exel. */
if ($dryRun || !$rows) {
    uasort($censo, fn($a, $b) => $b['n'] <=> $a['n']);
    echo "\n── Categorías que manda EXEL (así se llaman de su lado) ──\n";
    $entran = $fuera = 0;
    foreach ($censo as $nombre => $c) {
        $marca = $c['pasa'] ? '✓ ENTRA ' : '· fuera ';
        $c['pasa'] ? $entran += $c['n'] : $fuera += $c['n'];
        $subs = array_slice(array_keys($c['subs']), 0, 4);
        echo sprintf("  %s %-42s %5d  %s\n", $marca, mb_strimwidth($nombre, 0, 42, '…'), $c['n'],
            $subs ? '(' . implode(', ', $subs) . (count($c['subs']) > 4 ? '…' : '') . ')' : '');
    }
    echo "  ──\n  Entran: {$entran}   ·   Se quedan fuera: {$fuera}   ·   Categorías distintas: " . count($censo) . "\n";

    /* --subcats: el desglose que hace falta para armar la lista blanca fina. Solo de
       las categorías que HOY entran: son las que hay que depurar. */
    if ($subcats) {
        echo "\n── Subcategorías de las categorías que ENTRAN ──\n";
        echo "   (revisa una por una: lo que NO sea papelería hay que sacarlo)\n";
        foreach ($censo as $nombre => $c) {
            if (!$c['pasa']) continue;
            arsort($c['subs']);
            echo "\n  " . $nombre . "  (" . $c['n'] . " productos, " . count($c['subs']) . " subcategorías)\n";
            foreach ($c['subs'] as $s => $n) {
                echo sprintf("      %6d  %s\n", $n, $s);
                foreach (($c['ej'][$s] ?? []) as $ej) echo "                · " . $ej . "\n";
            }
        }
        echo "\n  Total de subcategorías a revisar: " .
             array_sum(array_map(fn($c) => $c['pasa'] ? count($c['subs']) : 0, $censo)) . "\n";
        exit(0);
    }
    if (!$rows) {
        echo "\n  ⚠ NO entró NI UN producto. La lista blanca PAPELERIA_CATS (arriba en este\n";
        echo "    archivo) no empata con los nombres de Exel. Copia de la columna de arriba\n";
        echo "    los que SÍ sean de papelería y ponlos en esa lista.\n";
        exit(1);
    }
}
if ($dryRun) {
    echo "\n  [DRY-RUN] No se escribió nada. Ejemplo de fila que se importaría:\n";
    echo "    " . json_encode($rows[0], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
    exit(0);
}

/* ── 3. UPSERT masivo (por chunks) ── */
$cols = ['supplier','supplier_ref','supplier_id','sku','barcode','sat_code','name','description',
         'brand','category','subcategory','currency','cost','price','old_price','stock','warehouse_id','last_synced_at'];
// prev_cost = cost (el VIEJO, antes de pisarlo) → base para la regla del 3%.
/* ── SALVAGUARDA: no vaciar la tienda por un feed incompleto ──
   El paso 4 apaga TODO lo que no vino en esta corrida. Si Exel responde a medias
   (corte de red, su API degradada, una categoría que ese día no manda), eso deja la
   tienda vacía de golpe, en silencio y de madrugada. Antes de escribir nada se
   compara lo que llegó contra lo que hay publicado: si el feed trae mucho menos, se
   aborta SIN tocar la visibilidad y se sale con código 1 para que el cron lo reporte.
   El catálogo anterior se queda intacto, que es lo correcto: mejor un día con precios
   viejos que una tienda sin productos. */
const FEED_MINIMO = 0.70;   // el feed debe traer al menos el 70% de lo que hay activo
$activosAntes = (int) $PDO->query(
    "SELECT COUNT(*) FROM products WHERE supplier='exel' AND is_active = 1"
)->fetchColumn();
if (!$force && $activosAntes > 0 && count($rows) < $activosAntes * FEED_MINIMO) {
    $pct = round(count($rows) / $activosAntes * 100);
    fwrite(STDERR,
        "\n✗ ABORTADO: el feed trae " . count($rows) . " productos de papelería, " .
        "solo el {$pct}% de los {$activosAntes} que hay publicados.\n" .
        "  Se esperaba al menos el " . (int) (FEED_MINIMO * 100) . "%. NO se escribió nada y el\n" .
        "  catálogo sigue como estaba.\n" .
        "  Revisa la API de Exel. Si el catálogo de verdad se encogió, repite con --force.\n");
    exit(1);
}

/* prev_cost = snapshot del costo ANTERIOR (base de la "regla del 3%"). Solo lo mueve el
   sync NOCTURNO: si el refresco por hora lo pisara, "cambió >3% desde ayer" se volvería
   "desde hace una hora" y ocultaría la deriva del día. En --solo-precios no se toca. */
$updates = $soloPrecios ? [] : ['prev_cost = cost'];
foreach ($cols as $c) {
    if ($c === 'supplier' || $c === 'supplier_ref') continue;
    /* `description` NO se pisa con un valor vacío: Exel casi nunca manda
       `descripcion_extendida`, y quien la llena es Icecat (ProductEnricher). Sin esto,
       cada corrida del runner BORRABA la ficha que Icecat ya había traído y la tienda
       se quedaba sin descripción. Si Exel SÍ manda descripción, esa manda. */
    if ($c === 'description') {
        $updates[] = "description = IF(VALUES(description) IS NULL OR VALUES(description) = '', description, VALUES(description))";
    } elseif ($c === 'old_price') {
        /* Solo se pisa cuando Exel manda una oferta REAL. Si Exel no trae oferta
           (NULL) se conserva lo que haya: así una promoción puesta a mano desde el
           panel sobrevive al sync nocturno, que es como estaba pensado en la
           migración 0031. */
        $updates[] = "old_price = IF(VALUES(old_price) IS NULL, old_price, VALUES(old_price))";
    } else {
        $updates[] = "$c = VALUES($c)";
    }
}
$onDup = implode(",\n  ", $updates);

$ph = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';
$chunkSize = 500;
$total = 0;
foreach (array_chunk($rows, $chunkSize) as $chunk) {
    $sql = 'INSERT INTO products (' . implode(',', $cols) . ") VALUES\n"
         . implode(",\n", array_fill(0, count($chunk), $ph))
         . "\nON DUPLICATE KEY UPDATE\n  " . $onDup;
    $params = [];
    foreach ($chunk as $r) { foreach ($cols as $c) { $params[] = $r[$c]; } }
    $PDO->prepare($sql)->execute($params);
    $total += count($chunk);
    echo "  · upsert " . $total . "/" . count($rows) . "\n";
}

/* ── 4. Visibilidad: publicar con stock, ocultar sin stock y los descontinuados ── */
// En feed y con stock → activo; en feed sin stock → oculto.
$st = $PDO->prepare("UPDATE products SET is_active = IF(stock > 0, 1, 0)
                     WHERE supplier='exel' AND last_synced_at = ?");
$st->execute([$runStamp]);
$tocados = $st->rowCount();
// Ya no vienen en el feed (descontinuados) → ocultar.
$st = $PDO->prepare("UPDATE products SET is_active = 0
                     WHERE supplier='exel' AND (last_synced_at IS NULL OR last_synced_at < ?)");
$st->execute([$runStamp]);
$descont = $st->rowCount();

/* ── 4a-bis. "Avísame cuando llegue": productos que RECUPERARON existencia ──
   Corre en el sync completo Y en el --solo-precios (cada hora), así el cliente se
   entera pronto. Best-effort: un fallo de correo no detiene el sync. */
try {
    $alertas = $PDO->query(
        "SELECT a.id, a.email, p.name, p.id AS pid, p.stock
           FROM stock_alerts a JOIN products p ON p.id = a.product_id
          WHERE a.notified_at IS NULL AND p.is_active = 1 AND p.stock > 0
          LIMIT 500"
    )->fetchAll();
    if ($alertas) {
        require_once __DIR__ . '/../api/lib/Mail.php';
        $marca = $PDO->prepare('UPDATE stock_alerts SET notified_at = NOW() WHERE id = ?');
        $avisados = 0;
        foreach ($alertas as $al) {
            $nombre = (string) $al['name'];
            $url = 'https://okstation.mx/producto/' . (int) $al['pid'];
            $html = '<p>¡Buenas noticias! 🎉</p>'
                  . '<p><b>' . htmlspecialchars($nombre, ENT_QUOTES, 'UTF-8') . '</b> ya está disponible otra vez en la tienda de Ok.station'
                  . ' (' . (int) $al['stock'] . ' en existencia).</p>'
                  . '<p><a href="' . $url . '">Ver el producto y comprarlo →</a></p>'
                  . '<p style="color:#667085;font-size:13px">Te llegó este aviso porque lo pediste en la página del producto. Es un aviso único.</p>';
            try {
                if (Mail::sendHtml((string) $al['email'], 'Ya llegó: ' . $nombre . ' · Ok.station', $html,
                                   $nombre . ' ya está disponible: ' . $url)) {
                    $marca->execute([(int) $al['id']]);
                    $avisados++;
                }
            } catch (Throwable $e) { /* siguiente; se reintenta en la próxima corrida */ }
        }
        echo "  Avisos 'ya llegó' enviados: {$avisados} de " . count($alertas) . "\n";
    }
} catch (Throwable $e) {
    /* La tabla puede no existir aún (migración 0035 sin correr): no es fatal. */
}

/* ── 4b. IMÁGENES de Exel ──
   Exel las expone en /imagenes (ojo: responde HTTP 201 y la clave es `DATA` en
   MAYÚSCULAS, distinto de /productos que usa `datos`). Se guardan con source='exel'.
   Las imágenes del PROVEEDOR mandan: son la foto del producto que de verdad vas a
   vender. Icecat solo rellena después los que se queden sin ninguna, y su runner
   nunca toca las de Exel (ProductEnricher borra e inserta solo source='icecat').

   No se descarga nada aquí: se guarda la URL y la tienda ya la sirve
   (COALESCE(stored_path, url)), así las fotos aparecen al terminar el sync. Bajarlas
   al servidor es opcional y va aparte, con download-product-images.php. */
$imgTotal = $imgProds = 0;
if (!$file && !$soloPrecios) {   // con --file no hay API; en --solo-precios las fotos se dejan al sync nocturno
    $mapa = fetch_images_from_api();
    echo "  Imágenes de Exel: " . count($mapa) . " referencias con foto\n";

    if ($mapa) {
        /* Qué producto es cada referencia (solo los que acabamos de sincronizar). */
        $mios = $PDO->prepare("SELECT id, supplier_ref FROM products WHERE supplier='exel' AND last_synced_at = ?");
        $mios->execute([$runStamp]);
        $porRef = [];
        foreach ($mios->fetchAll() as $r) { $porRef[(string) $r['supplier_ref']] = (int) $r['id']; }

        /* Se conserva la copia local ya descargada de cada URL: si no, volver a
           sincronizar dejaría la tienda sirviendo el CDN de Exel hasta que alguien
           corriera otra vez el descargador. */
        $previas = [];
        foreach ($PDO->query("SELECT product_id, url, stored_path FROM product_images
                               WHERE source='exel' AND stored_path IS NOT NULL AND stored_path <> ''")->fetchAll() as $r) {
            $previas[$r['product_id'] . '|' . $r['url']] = $r['stored_path'];
        }

        $filas = [];
        foreach ($mapa as $ref => $urls) {
            if (!isset($porRef[$ref])) continue;          // esa referencia no es de papelería
            $pid = $porRef[$ref];
            $orden = 0;
            foreach ($urls as $u) {
                $u = trim((string) $u);
                if ($u === '' || !preg_match('~^https?://~i', $u)) continue;
                $filas[] = [$pid, $u, $previas[$pid . '|' . $u] ?? null, 'exel', $orden, $orden === 0 ? 1 : 0];
                $orden++;
            }
            if ($orden > 0) $imgProds++;
        }

        if ($filas) {
            $PDO->beginTransaction();
            try {
                /* Se reemplazan SOLO las de Exel de los productos que traen foto ahora. */
                $ids = array_values(array_unique(array_column($filas, 0)));
                foreach (array_chunk($ids, 500) as $lote) {
                    $PDO->prepare("DELETE FROM product_images WHERE source='exel' AND product_id IN ("
                        . implode(',', array_fill(0, count($lote), '?')) . ")")->execute($lote);
                }
                $ph6 = '(?,?,?,?,?,?)';
                foreach (array_chunk($filas, 500) as $lote) {
                    $sql = "INSERT INTO product_images (product_id, url, stored_path, source, sort_order, is_primary) VALUES "
                         . implode(',', array_fill(0, count($lote), $ph6));
                    $args = []; foreach ($lote as $f) foreach ($f as $v) $args[] = $v;
                    $PDO->prepare($sql)->execute($args);
                    $imgTotal += count($lote);
                    echo "  · imágenes " . $imgTotal . "/" . count($filas) . "\n";
                }
                $PDO->commit();
            } catch (Throwable $e) {
                $PDO->rollBack();
                fwrite(STDERR, "  ⚠ No se pudieron guardar las imágenes: " . $e->getMessage() . "\n");
                fwrite(STDERR, "    El catálogo quedó bien; solo faltan las fotos.\n");
                $imgTotal = $imgProds = 0;
            }
        }
    }
}

/* ── 5. Regla del 3%: cuántos costos se movieron > 3% respecto a la corrida anterior ── */
$cambios = (int) $PDO->query(
    "SELECT COUNT(*) FROM products
      WHERE supplier='exel' AND prev_cost > 0 AND ABS(cost - prev_cost) / prev_cost > 0.03"
)->fetchColumn();

/* Cuántos quedan SIN foto: es lo que tendría que rellenar Icecat después. */
$sinFoto = (int) $PDO->query(
    "SELECT COUNT(*) FROM products p
      WHERE p.supplier='exel' AND p.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)"
)->fetchColumn();

echo "── Listo ──\n";
echo "  Upsert:        {$total}\n";
echo "  Con stock:     activos; sin stock ocultos (tocados: {$tocados})\n";
echo "  Descontinuados ocultados: {$descont}\n";
echo "  Costos con cambio > 3%:   {$cambios}\n";
echo "  Ofertas del proveedor:    {$ofertas}\n";
if ($soloPrecios) {
    echo "  Imágenes:                 (omitidas — refresco solo precio/stock)\n";
} else {
    echo "  Imágenes de Exel:         {$imgTotal} en {$imgProds} producto(s)\n";
    echo "  Activos AÚN sin foto:     {$sinFoto}" . ($sinFoto > 0 ? "  → para eso corre icecat-enrich.php" : "") . "\n";
}

/* ═══════════════════ Helpers ═══════════════════ */

/** Normaliza un nombre de categoría para comparar (trim + minúsculas). */
function norm(string $s): string {
    return mb_strtolower(trim($s), 'UTF-8');
}

/** Trae el catálogo desde la API de Exel. Envelope: {resultado, mensaje, datos:[...]}. */
function fetch_from_api(): array {
    $base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
    $key  = (string) env('EXEL_API_KEY', '');
    if ($key === '') {
        fwrite(STDERR, "✗ Falta EXEL_API_KEY en backend/.env (o usa --file para pruebas).\n");
        exit(1);
    }
    $ch = curl_init("$base/productos");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_HTTPHEADER     => ['Authorization: ' . $key],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) { fwrite(STDERR, "✗ Error de red con Exel: " . curl_error($ch) . "\n"); exit(1); }
    curl_close($ch);
    if ($code !== 200) { fwrite(STDERR, "✗ Exel respondió HTTP {$code}.\n"); exit(1); }

    $json = json_decode($resp, true);
    if (!is_array($json) || empty($json['resultado'])) {
        fwrite(STDERR, "✗ Respuesta inesperada de Exel: " . substr((string) $resp, 0, 200) . "\n");
        exit(1);
    }
    return $json['datos'] ?? [];
}

/**
 * Imágenes del proveedor: GET /imagenes → ['referencia' => ['url', 'url', …]].
 *
 * OJO con dos rarezas de ese endpoint, distintas de /productos:
 *   · responde HTTP 201 (no 200)
 *   · la clave es 'DATA' en MAYÚSCULAS (no 'datos')
 * Si Exel las unifica algún día, aquí se aceptan las dos formas.
 *
 * Un fallo aquí NO aborta el sync: el catálogo ya quedó bien y lo único que falta
 * son las fotos. Devuelve [] y el runner lo reporta.
 */
function fetch_images_from_api(): array {
    $base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
    $key  = (string) env('EXEL_API_KEY', '');
    if ($key === '') return [];

    $ch = curl_init("$base/imagenes");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_HTTPHEADER     => ['Authorization: ' . $key],
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($resp === false)               { fwrite(STDERR, "  ⚠ Sin imágenes: error de red ({$err}).\n"); return []; }
    if ($code < 200 || $code >= 300)   { fwrite(STDERR, "  ⚠ Sin imágenes: /imagenes respondió HTTP {$code}.\n"); return []; }

    $json = json_decode((string) $resp, true);
    if (!is_array($json)) { fwrite(STDERR, "  ⚠ Sin imágenes: respuesta no es JSON.\n"); return []; }
    $lista = $json['DATA'] ?? $json['datos'] ?? $json['data'] ?? [];
    if (!is_array($lista)) return [];

    $out = [];
    foreach ($lista as $r) {
        $ref = trim((string) ($r['referencia'] ?? ''));
        if ($ref === '') continue;
        $urls = $r['imagenes'] ?? [];
        if (is_string($urls)) $urls = [$urls];          // por si mandan una sola
        if (!is_array($urls) || !$urls) continue;
        $out[$ref] = array_values(array_filter(array_map('strval', $urls), fn($u) => trim($u) !== ''));
    }
    return $out;
}

/** Lee un feed local: acepta {datos:[...]}, un arreglo JSON, o JSONL (una línea por producto). */
function read_feed_file(string $path): array {
    if (!is_file($path)) { fwrite(STDERR, "✗ No existe el archivo: {$path}\n"); exit(1); }
    $txt = file_get_contents($path);
    $json = json_decode($txt, true);
    if (is_array($json)) {
        if (isset($json['datos']) && is_array($json['datos'])) return $json['datos'];
        if (array_is_list($json)) return $json;
    }
    // JSONL: una línea = un objeto JSON.
    $out = [];
    foreach (preg_split('/\r?\n/', (string) $txt) as $line) {
        $line = trim($line);
        if ($line === '') continue;
        $o = json_decode($line, true);
        if (is_array($o)) $out[] = $o;
    }
    if (!$out) { fwrite(STDERR, "✗ No pude interpretar el feed {$path} (ni JSON ni JSONL).\n"); exit(1); }
    return $out;
}

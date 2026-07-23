<?php
/**
 * Trae las fotos de NEXTEP desde el fabricante — mide primero, importa después
 * =============================================================================
 * NEXTEP es la marca con más huecos del catálogo: 131 de 264 productos sin foto.
 * Su API pública devuelve la foto por CLAVE (NE-xxx), que es el número de parte,
 * así que el emparejamiento es exacto: o es ese producto o la API responde 404.
 * No existe el riesgo de publicar la variante equivocada.
 *
 * POR OMISIÓN NO ESCRIBE NADA. Primero enseña cuántos productos de OK.station
 * cruzan de verdad con el catálogo de NEXTEP, porque eso es lo único que decide
 * si esto sirve: si sus claves no están en el campo `sku`, no cruza ninguno y no
 * hay nada que hacer. Medir cuesta un minuto; construir a ciegas ya costó un día
 * esta semana.
 *
 * Uso:
 *   php backend/tools/nextep-fotos.php             # solo mide
 *   php backend/tools/nextep-fotos.php --aplicar   # descarga y guarda las fotos
 *   php backend/tools/nextep-fotos.php --aplicar --limite=20   # de a poco
 */

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Solo CLI.\n"); }

$CONFIG = require __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib/Nextep.php';
require_once __DIR__ . '/../api/lib/ImagenSegura.php';
require_once __DIR__ . '/../api/lib/EnrichLog.php';
require_once __DIR__ . '/../api/lib/CatalogoAlcance.php';

$args    = array_slice($argv, 1);
$aplicar = in_array('--aplicar', $args, true);
$limite  = 0;
foreach ($args as $a) if (str_starts_with($a, '--limite=')) $limite = max(1, (int) substr($a, 9));

$d = $CONFIG['db'];
$pdo = new PDO(
    "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
    $d['user'], $d['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

echo "══ Fotos de NEXTEP (desde el fabricante) ══\n";
echo $aplicar ? "MODO APLICAR — se van a descargar y guardar fotos.\n\n" : "MODO CONSULTA — no se escribe nada.\n\n";

/* ── 1. Espejo del catálogo de NEXTEP ─────────────────────────────────────── */
echo "Bajando el catálogo de NEXTEP…\n";
$catalogo = Nextep::catalogo();
if (!$catalogo) {
    fwrite(STDERR, "✗ No se pudo leer el catálogo de NEXTEP. Puede que su API haya cambiado\n"
                 . "  (es interna y no documentada) o que el servidor no tenga salida a internet.\n");
    exit(1);
}
echo "  " . count($catalogo) . " productos en su catálogo.\n\n";

/* ── 2. Los nuestros que no tienen foto ───────────────────────────────────── */
$alc = alcance_sql('products');
$st = $pdo->prepare(
    "SELECT id, name, sku, supplier_ref, brand
       FROM products
      WHERE supplier='exel' AND is_active = 1
        AND brand LIKE '%NEXTEP%'
        {$alc['sql']}
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = products.id)
      ORDER BY name"
);
$st->execute($alc['params']);
$nuestros = $st->fetchAll();

echo "Productos NEXTEP nuestros SIN foto: " . count($nuestros) . "\n";
if (!$nuestros) { echo "\n✔ Nada que hacer.\n"; exit(0); }

/* ── 3. El cruce: ¿cuántos encuentran su clave? ───────────────────────────── */
$cruzan = [];
$sinClave = $noEstan = 0;
foreach ($nuestros as $p) {
    /* Se prueba el sku y, si no, la referencia del proveedor: no sabemos de
       antemano en cuál de los dos guardó Exel la clave del fabricante. */
    $clave = '';
    foreach ([(string) $p['sku'], (string) $p['supplier_ref']] as $c) {
        if (Nextep::claveValida($c)) { $clave = Nextep::normalizarClave($c); break; }
    }
    if ($clave === '')             { $sinClave++; continue; }
    if (!isset($catalogo[$clave])) { $noEstan++;  continue; }
    $cruzan[] = $p + ['clave' => $clave, 'url' => $catalogo[$clave][0]];
}

$n = count($nuestros);
$pc = fn(int $x) => sprintf('%d (%d%%)', $x, (int) round($x * 100 / $n));
echo "  Con clave NE-xxx y NEXTEP la tiene : " . $pc(count($cruzan)) . "   ← estos se visten SOLOS (exacto)\n";
echo "  Con clave pero NEXTEP no la tiene  : " . $pc($noEstan) . "\n";
echo "  Sin clave con forma NE-xxx         : " . $pc($sinClave) . "\n";

/* De los que NO cruzan por clave, ¿cuántos empatan por NOMBRE con el catálogo de
   NEXTEP? Esos NO se pueden vestir solos (el nombre puede confundir la variante),
   pero SÍ aparecen como candidatas en el panel para elegir con un clic. Aquí solo
   se cuentan, para que el número esté a la vista y no sea una sorpresa. */
$idsCruzan = array_column($cruzan, 'id');
$porNombre = 0;
foreach ($nuestros as $q) {
    if (in_array($q['id'], $idsCruzan, true)) continue;
    if (Nextep::porNombre((string) $q['name'], 1)) $porNombre++;
}
echo "  ── de los que NO cruzan por clave, empatan por NOMBRE: " . $pc($porNombre) . "\n";
echo "     (esos aparecen como candidatas en el panel — se eligen con un clic,\n";
echo "      NO se visten solos porque el nombre puede confundir la variante)\n";

if (!$cruzan) {
    echo "\n   ➤ Ninguno cruza. Sus claves no están en `sku` ni en `supplier_ref` con el\n";
    echo "     formato NE-xxx que usa NEXTEP. Revisa qué guarda Exel en esos campos:\n";
    echo "       SELECT sku, supplier_ref, name FROM products WHERE brand LIKE '%NEXTEP%' LIMIT 5;\n";
    exit(0);
}

echo "\n  Ejemplos de lo que se traería:\n";
foreach (array_slice($cruzan, 0, 5) as $c) {
    printf("    %-9s %-34s %s\n", $c['clave'], mb_strimwidth((string) $c['name'], 0, 34, '…'),
        mb_strimwidth(basename($c['url']), 0, 44, '…'));
}

if (!$aplicar) {
    echo "\n   Para traerlas:  php backend/tools/nextep-fotos.php --aplicar\n";
    echo "   (descarga cada foto a nuestro servidor y la deja como principal)\n";
    exit(0);
}

/* ── 4. Descargar y guardar ───────────────────────────────────────────────── */
echo "\n── Descargando ──\n";
$aHacer = $limite ? array_slice($cruzan, 0, $limite) : $cruzan;
$ok = $mal = 0;

foreach ($aHacer as $c) {
    /* elegidaPorPersona = false: aquí NO hay nadie mirando, así que sí se exige la
       lista blanca de dominios. nextep.com.mx está en ella por ser el fabricante,
       que es una fuente autorizada según la regla del negocio. */
    [$data, $motivo] = ImagenSegura::descargar($c['url']);
    if ($data === null) {
        printf("  ✗ %-9s %s\n", $c['clave'], $motivo);
        EnrichLog::registrar($pdo, (int) $c['id'], 'fabricante:nextep', 'error', ['detail' => $motivo]);
        $mal++;
        continue;
    }
    /* validarBytes devuelve [meta|null, motivo], donde meta trae ext/mime/w/h —
       no una tupla de tres. Se sigue la misma forma que usa image-set.php, que es
       el código que ya estaba probado. */
    [$meta, $motivo2] = ImagenSegura::validarBytes($data);
    if ($meta === null) {
        printf("  ✗ %-9s %s\n", $c['clave'], $motivo2);
        EnrichLog::registrar($pdo, (int) $c['id'], 'fabricante:nextep', 'rechazado', ['detail' => $motivo2]);
        $mal++;
        continue;
    }

    try {
        $ruta = ImagenSegura::guardar((int) $c['id'], $data, $meta['ext']);
        $pdo->prepare(
            'INSERT INTO product_images (product_id, url, stored_path, source, sort_order, is_primary)
             VALUES (?, ?, ?, ?, 0, 1)'
        )->execute([(int) $c['id'], $c['url'], $ruta, 'fabricante:nextep']);

        EnrichLog::registrar($pdo, (int) $c['id'], 'fabricante:nextep', 'ok', [
            'fields' => 'imagen', 'source_url' => $c['url'], 'match_key' => $c['clave'], 'confidence' => 100,
        ]);
        printf("  ✓ %-9s %s\n", $c['clave'], mb_strimwidth((string) $c['name'], 0, 46, '…'));
        $ok++;
    } catch (Throwable $e) {
        printf("  ✗ %-9s al guardar: %s\n", $c['clave'], $e->getMessage());
        $mal++;
    }
    usleep(250000);   // no atropellar su servidor
}

echo "\n✔ Listo: {$ok} fotos guardadas" . ($mal ? ", {$mal} fallaron" : '') . ".\n";
$quedan = (int) $pdo->query(
    "SELECT COUNT(*) FROM products p WHERE p.supplier='exel' AND p.is_active=1
       AND p.brand LIKE '%NEXTEP%'
       AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id=p.id)"
)->fetchColumn();
echo "  Productos NEXTEP que siguen sin foto: {$quedan}\n";
echo "\n  Falta purgar la caché:  bash deploy/publicar.sh\n";

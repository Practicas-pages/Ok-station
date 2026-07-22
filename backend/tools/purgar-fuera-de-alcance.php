<?php
/**
 * Borra de la base los productos que quedaron FUERA del alcance del catálogo
 * =============================================================================
 * Distinto de aplicar-alcance.php, y la diferencia importa:
 *   · aplicar-alcance.php los APAGA (is_active = 0). Reversible, no pierde nada.
 *   · esto los BORRA. No hay vuelta atrás sin volver a sincronizar con Exel.
 *
 * Se hizo porque tener 2,714 productos apagados ensuciaba el panel: los conteos
 * decían "5,609 productos, 343 sin fotos" y alguien podía ponerse a buscarle
 * fotos a mercancía que ya no se vende.
 *
 * QUÉ SE RESPETA:
 *   · Los productos que aparecen en algún PEDIDO no se borran nunca, aunque estén
 *     fuera de alcance. shop_order_items guarda una copia del nombre y el precio y
 *     no tiene llave foránea, así que borrarlos no rompería el historial — pero sí
 *     dejaría al panel sin poder abrir la ficha del producto que alguien compró.
 *     Se quedan apagados, que es suficiente.
 *   · Las imágenes y la bitácora se van con el producto (ON DELETE CASCADE), que
 *     es lo correcto: sin producto no tienen a quién pertenecer.
 *   · Los archivos ya descargados en assets/img/products/{id}/ se borran también,
 *     si no quedan ocupando disco para siempre sin que nadie sepa de quién eran.
 *
 * Uso:
 *   php backend/tools/purgar-fuera-de-alcance.php              # solo muestra
 *   php backend/tools/purgar-fuera-de-alcance.php --borrar     # ejecuta
 */

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Solo CLI.\n"); }

$CONFIG = require __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib/CatalogoAlcance.php';

$borrar = in_array('--borrar', array_slice($argv, 1), true);

$d = $CONFIG['db'];
$pdo = new PDO(
    "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
    $d['user'], $d['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$cats = categorias_permitidas();
echo "══ Purga de productos fuera de alcance ══\n";
echo "Se CONSERVAN las categorías: " . implode(' · ', $cats) . "\n";
echo $borrar ? "MODO BORRAR — esto no se puede deshacer.\n\n" : "MODO CONSULTA — no se va a borrar nada.\n\n";

$in  = implode(',', array_fill(0, count($cats), '?'));

/* Candidatos: fuera de alcance Y sin aparecer en ningún pedido. */
$sqlCand = "SELECT p.id, p.name, p.category
              FROM products p
             WHERE p.supplier = 'exel'
               AND p.category NOT IN ({$in})
               AND NOT EXISTS (SELECT 1 FROM shop_order_items oi WHERE oi.product_id = p.id)";
$st = $pdo->prepare($sqlCand);
$st->execute($cats);
$cand = $st->fetchAll();

/* Los que SÍ se venden alguna vez: se informan aparte para que quede claro que no
   es un olvido, es una decisión. */
$stV = $pdo->prepare(
    "SELECT COUNT(*) FROM products p
      WHERE p.supplier='exel' AND p.category NOT IN ({$in})
        AND EXISTS (SELECT 1 FROM shop_order_items oi WHERE oi.product_id = p.id)"
);
$stV->execute($cats);
$vendidos = (int) $stV->fetchColumn();

$porCat = [];
foreach ($cand as $c) {
    $k = $c['category'] === '' ? '(sin categoría)' : $c['category'];
    $porCat[$k] = ($porCat[$k] ?? 0) + 1;
}
arsort($porCat);
printf("   %-44s %8s\n", 'CATEGORÍA A BORRAR', 'productos');
echo '   ' . str_repeat('─', 54) . "\n";
foreach ($porCat as $k => $n) printf("   %-44s %8d\n", $k, $n);
echo '   ' . str_repeat('─', 54) . "\n";
printf("   %-44s %8d\n", 'TOTAL A BORRAR', count($cand));
if ($vendidos > 0) {
    echo "\n   {$vendidos} producto(s) fuera de alcance SE CONSERVAN porque aparecen en\n";
    echo "   pedidos. Quedan apagados; borrarlos dejaría al panel sin poder abrir la\n";
    echo "   ficha de algo que un cliente compró.\n";
}

if (!$cand) { echo "\n✔ No hay nada que borrar.\n"; exit(0); }
if (!$borrar) {
    echo "\n   Para borrarlos:  php backend/tools/purgar-fuera-de-alcance.php --borrar\n";
    echo "   (Antes de eso conviene tener respaldo de la base. Se puede recuperar\n";
    echo "    volviendo a ampliar la lista blanca y sincronizando con Exel, pero se\n";
    echo "    perderían las fotos e info que se hubieran agregado a mano.)\n";
    exit(0);
}

/* ── Borrado ──────────────────────────────────────────────────────────────── */
$webRoot = dirname(__DIR__, 2);
$ids = array_column($cand, 'id');
$archivos = 0;

/* Primero los archivos: si algo falla después, sobra un directorio vacío — mucho
   menos grave que borrar el registro y dejar los archivos huérfanos sin dueño. */
foreach ($ids as $id) {
    $dir = $webRoot . '/assets/img/products/' . (int) $id;
    if (!is_dir($dir)) continue;
    foreach ((array) glob($dir . '/*') as $f) { if (is_file($f)) { @unlink($f); $archivos++; } }
    @rmdir($dir);
}

$pdo->beginTransaction();
try {
    /* Por lotes: un DELETE de miles de renglones con CASCADE puede tardar y dejar
       la tabla bloqueada mientras la tienda atiende clientes. */
    $borrados = 0;
    foreach (array_chunk($ids, 500) as $lote) {
        $ph = implode(',', array_fill(0, count($lote), '?'));
        $q  = $pdo->prepare("DELETE FROM products WHERE id IN ({$ph})");
        $q->execute($lote);
        $borrados += $q->rowCount();
        echo "  · borrados {$borrados}/" . count($ids) . "\n";
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "\n✗ Falló y se revirtió el borrado: " . $e->getMessage() . "\n");
    exit(1);
}

$quedan = (int) $pdo->query("SELECT COUNT(*) FROM products WHERE supplier='exel'")->fetchColumn();
echo "\n✔ Borrados {$borrados} productos y {$archivos} archivo(s) de imagen.\n";
echo "  Quedan {$quedan} productos en el catálogo.\n";
echo "\n  Falta purgar la caché:  bash deploy/publicar.sh\n";

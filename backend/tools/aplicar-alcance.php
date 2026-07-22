<?php
/**
 * Aplica el ALCANCE del catálogo a lo que ya está en la base — sin llamar a Exel
 * =============================================================================
 * El filtro de categorías vive en exel-sync.php, pero ese script necesita bajar el
 * catálogo completo de Exel, y la cuota diaria de peticiones se agota. Esto deja el
 * cambio de alcance detenido esperando a mañana sin ninguna razón de fondo: la
 * categoría de los ~5,500 productos YA está guardada en `products.category`. Decidir
 * cuáles se publican es una decisión local que no requiere red.
 *
 * Efecto secundario útil: al dejar los activos en su número final, la siguiente
 * corrida del sync ya no dispara la salvaguarda del 70% y NO hace falta --force.
 *
 * QUÉ NO HACE, a propósito:
 *   · No borra un solo renglón. Solo mueve is_active. Las fotos, las descripciones,
 *     el enriquecimiento de Icecat y el histórico de pedidos quedan intactos.
 *   · No enciende nada que esté sin existencias: respeta la regla del sync
 *     (is_active = 1 solo si stock > 0), para no publicar lo que no se puede vender.
 *   · No escribe nada sin --aplicar. Por omisión solo enseña lo que haría.
 *
 * Uso:
 *   php backend/tools/aplicar-alcance.php              # solo muestra (no escribe)
 *   php backend/tools/aplicar-alcance.php --aplicar    # ejecuta
 *   php backend/tools/aplicar-alcance.php --revertir   # vuelve a publicar TODO
 *                                                        lo que tenga existencias
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

$CONFIG = require __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib/CatalogoAlcance.php';

$args     = array_slice($argv, 1);
$aplicar  = in_array('--aplicar', $args, true);
$revertir = in_array('--revertir', $args, true);

$d = $CONFIG['db'];
$pdo = new PDO(
    "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
    $d['user'], $d['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$cats = categorias_permitidas();
echo "══ Alcance del catálogo ══\n";
echo "Categorías que SÍ se publican: " . implode(' · ', $cats) . "\n";
echo ($aplicar || $revertir) ? "" : "MODO CONSULTA — no se va a escribir nada.\n";
echo "\n";

/* ── Foto del antes: se decide en PHP, con la misma función que usa el sync ──
   Se podría armar un WHERE con la lista, pero entonces la comparación de nombres la
   haría MySQL (con su propio collation) y el sync la haría PHP. Ante un nombre con
   acentos o mayúsculas raras podrían diferir, y ahí es donde nacen los estados
   imposibles de explicar. Mejor una sola cabeza decidiendo. */
$filas = $pdo->query(
    "SELECT COALESCE(NULLIF(category,''),'(sin categoría)') AS cat,
            SUM(is_active = 1) AS activos,
            SUM(stock > 0)     AS con_stock,
            COUNT(*)           AS total
       FROM products WHERE supplier='exel'
      GROUP BY cat ORDER BY total DESC"
)->fetchAll();

$aApagar = $aEncender = 0;
printf("   %-42s %8s %8s %8s   %s\n", 'CATEGORÍA', 'total', 'activos', 'c/stock', 'acción');
echo '   ' . str_repeat('─', 82) . "\n";
foreach ($filas as $f) {
    $entra = categoria_permitida($f['cat']);
    $act   = (int) $f['activos'];
    $stk   = (int) $f['con_stock'];
    if ($revertir) {
        $accion = $stk > $act ? 'ENCENDER ' . ($stk - $act) : '—';
        $aEncender += max(0, $stk - $act);
    } elseif ($entra) {
        $accion = '✓ se queda';
    } else {
        $accion = $act > 0 ? 'APAGAR ' . $act : '(ya apagada)';
        $aApagar += $act;
    }
    printf("   %-42s %8d %8d %8d   %s\n", $f['cat'], (int) $f['total'], $act, $stk, $accion);
}

$activosAntes = (int) $pdo->query("SELECT COUNT(*) FROM products WHERE supplier='exel' AND is_active=1")->fetchColumn();
echo "\n   Activos ahora: {$activosAntes}\n";

if ($revertir) {
    echo "   Se van a ENCENDER {$aEncender} productos (todos los que tengan existencias).\n";
} else {
    echo "   Se van a APAGAR {$aApagar} productos  →  quedarían " . ($activosAntes - $aApagar) . " visibles.\n";
}

if (!$aplicar && !$revertir) {
    echo "\n   Para aplicarlo:  php backend/tools/aplicar-alcance.php --aplicar\n";
    echo "   (apaga, NO borra: is_active=0. Se revierte con --revertir.)\n";
    exit(0);
}
/* --revertir escribe de una vez, sin pedir --aplicar además. Es a propósito: es el
   camino de vuelta y enciende productos, que es la dirección segura. Si algo salió
   mal en la tienda, uno quiere deshacerlo rápido y no recordando una segunda bandera. */

/* ── Escritura ────────────────────────────────────────────────────────────────
   Se hace en UNA transacción: si algo truena a la mitad, la tienda no se queda con
   medio catálogo apagado. */
$pdo->beginTransaction();
try {
    if ($revertir) {
        /* Revertir = volver al criterio de "publicado si hay existencias", sin mirar
           la categoría. Es justo lo que hacía el sync antes de angostar el alcance. */
        $st = $pdo->prepare("UPDATE products SET is_active = 1
                              WHERE supplier='exel' AND stock > 0 AND is_active = 0");
        $st->execute();
        $n = $st->rowCount();
        $pdo->commit();
        echo "\n✔ Revertido: {$n} productos vuelven a publicarse.\n";
        echo "  OJO: el próximo sync los volverá a apagar mientras EXEL_CATEGORIAS /\n";
        echo "  PAPELERIA_CATS sigan limitados. Para revertir de verdad hay que ampliar\n";
        echo "  también la lista blanca en backend/api/lib/CatalogoAlcance.php o en el .env.\n";
        exit(0);
    }

    /* Apagar SOLO lo que está fuera del alcance. Se recorre por categoría en vez de
       un WHERE gigante para que la decisión la siga tomando categoria_permitida(). */
    $upd = $pdo->prepare("UPDATE products SET is_active = 0
                           WHERE supplier='exel' AND is_active = 1
                             AND COALESCE(NULLIF(category,''),'(sin categoría)') = ?");
    $apagados = 0;
    foreach ($filas as $f) {
        if (categoria_permitida($f['cat'])) continue;
        $upd->execute([$f['cat']]);
        $apagados += $upd->rowCount();
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "\n✗ Falló y se revirtió TODO: " . $e->getMessage() . "\n");
    exit(1);
}

$activosDespues = (int) $pdo->query("SELECT COUNT(*) FROM products WHERE supplier='exel' AND is_active=1")->fetchColumn();
echo "\n✔ Listo: {$apagados} productos apagados. Visibles ahora: {$activosDespues}\n";
echo "  No se borró nada: siguen en la base con is_active=0, con sus fotos y su\n";
echo "  enriquecimiento. Vuelven solos si se amplía la lista blanca.\n";
echo "\n  Falta purgar la caché para que el cambio se vea:\n";
echo "    bash deploy/publicar.sh\n";

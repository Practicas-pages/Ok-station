<?php
/**
 * GET /backend/api/admin/image-rescue-report.php
 * Historial persistente del tercer filtro de fotografías.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/CatalogoAlcance.php';
only_method('GET');

require_permission('shop.view');
$estado = trim((string) ($_GET['status'] ?? ''));
$permitidos = ['', 'ok', 'sin_datos', 'revision', 'error'];
if (!in_array($estado, $permitidos, true)) {
    fail('Estado de resultado no válido.', 422);
}

$alcance = alcance_sql('p');
$where = "pe.source = 'rescate:nextep' {$alcance['sql']}";
$params = $alcance['params'];
if ($estado !== '') {
    $where .= ' AND pe.status = :rescue_status';
    $params[':rescue_status'] = $estado;
}

try {
    $st = db()->prepare(
        "SELECT p.id, p.name, p.brand, p.sku, p.supplier_ref,
                pe.status, pe.detail, pe.source_url, pe.match_key,
                pe.confidence, pe.tried_at,
                (SELECT COALESCE(NULLIF(pi.stored_path,''), pi.url)
                   FROM product_images pi
                  WHERE pi.product_id = p.id
                  ORDER BY pi.is_primary DESC, pi.sort_order, pi.id
                  LIMIT 1) AS thumb
           FROM product_enrichment pe
           JOIN products p ON p.id = pe.product_id
          WHERE {$where}
          ORDER BY pe.tried_at DESC, p.name
          LIMIT 500"
    );
    $st->execute($params);
    $resultados = $st->fetchAll(PDO::FETCH_ASSOC);

    $st = db()->prepare(
        "SELECT pe.status, COUNT(*) AS total
           FROM product_enrichment pe
           JOIN products p ON p.id = pe.product_id
          WHERE pe.source = 'rescate:nextep' {$alcance['sql']}
          GROUP BY pe.status"
    );
    $st->execute($alcance['params']);
    $conteos = ['ok' => 0, 'sin_datos' => 0, 'revision' => 0, 'error' => 0];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $fila) {
        if (isset($conteos[$fila['status']])) $conteos[$fila['status']] = (int) $fila['total'];
    }
} catch (Throwable $e) {
    /* Si la migración de bitácora aún no llegó al servidor, el panel sigue vivo y
       explica el motivo en vez de responder con un fatal 500. */
    respond([
        'ok' => true,
        'results' => [],
        'counts' => ['ok' => 0, 'sin_datos' => 0, 'revision' => 0, 'error' => 0],
        'notice' => 'Aún no hay una ejecución registrada del buscador de fotografías.',
    ]);
}

respond(['ok' => true, 'results' => $resultados, 'counts' => $conteos]);

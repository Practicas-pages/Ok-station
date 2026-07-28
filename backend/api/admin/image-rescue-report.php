<?php
/**
 * GET /backend/api/admin/image-rescue-report.php
 * Cola e historial persistente del tercer filtro de fotografías.
 *
 * El rescate automático exacto solo puede publicar NEXTEP; el selector humano
 * funciona con cualquier marca. Por eso este reporte no se limita a
 * `rescate:nextep`: incluye todos los productos que siguen sin foto y todas las
 * decisiones tomadas desde el selector. Así "Por revisar" representa el trabajo
 * real pendiente del catálogo, no únicamente lo que alcanzó a revisar NEXTEP.
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
$latestLog = "(SELECT pe2.id
                 FROM product_enrichment pe2
                WHERE pe2.product_id = p.id
                  AND (pe2.source = 'rescate:nextep'
                       OR pe2.source = 'manual'
                       OR pe2.source LIKE 'panel:%')
                ORDER BY pe2.tried_at DESC, pe2.id DESC
                LIMIT 1)";
$hasImage = "EXISTS (SELECT 1 FROM product_images px WHERE px.product_id = p.id)";
$statusSql = "CASE
                WHEN {$hasImage} THEN 'ok'
                WHEN pe.status IN ('sin_datos','revision','error') THEN pe.status
                ELSE 'revision'
              END";
$baseWhere = "1=1 {$alcance['sql']}
              AND (pe.id IS NOT NULL OR NOT {$hasImage})";
$where = $baseWhere;
$params = $alcance['params'];
if ($estado !== '') {
    $where .= " AND ({$statusSql}) = :rescue_status";
    $params[':rescue_status'] = $estado;
}

try {
    $st = db()->prepare(
        "SELECT p.id, p.name, p.brand, p.sku, p.supplier_ref,
                {$statusSql} AS status,
                COALESCE(pe.detail,
                    'Pendiente de abrir y confirmar una fotografía en el panel.') AS detail,
                pe.source, pe.source_url, pe.match_key,
                pe.confidence, COALESCE(pe.tried_at, p.last_synced_at) AS tried_at,
                (SELECT COALESCE(NULLIF(pi.stored_path,''), pi.url)
                   FROM product_images pi
                  WHERE pi.product_id = p.id
                  ORDER BY pi.is_primary DESC, pi.sort_order, pi.id
                  LIMIT 1) AS thumb
           FROM products p
           LEFT JOIN product_enrichment pe ON pe.id = {$latestLog}
          WHERE {$where}
          ORDER BY FIELD({$statusSql}, 'revision', 'error', 'sin_datos', 'ok'),
                   COALESCE(pe.tried_at, p.last_synced_at) DESC, p.name
          LIMIT 500"
    );
    $st->execute($params);
    $resultados = $st->fetchAll(PDO::FETCH_ASSOC);

    $st = db()->prepare(
        "SELECT {$statusSql} AS status,
                COUNT(*) AS total
           FROM products p
           LEFT JOIN product_enrichment pe ON pe.id = {$latestLog}
          WHERE {$baseWhere}
          GROUP BY 1"
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

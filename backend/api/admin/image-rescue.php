<?php
/**
 * POST /backend/api/admin/image-rescue.php
 * Ejecuta un lote pequeño del tercer filtro automático de imágenes.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/CatalogoAlcance.php';
require __DIR__ . '/../lib/Nextep.php';
require __DIR__ . '/../lib/BuscadorMarca.php';
require __DIR__ . '/../lib/ImagenSegura.php';
require __DIR__ . '/../lib/EnrichLog.php';
require __DIR__ . '/../lib/RescateImagenes.php';
only_method('POST');

$user = require_permission('shop.update_status');
$input = body();
$limit = max(1, min(25, (int) ($input['limit'] ?? 10)));
$resultado = RescateImagenes::procesar(db(), $limit);

log_activity((int) $user['id'], 'shop.update_status', 'product_images', null, [
    'action' => 'image_rescue',
    'processed' => $resultado['procesados'],
    'rescued' => $resultado['rescatados'],
]);

respond(['ok' => true, 'resultado' => $resultado]);

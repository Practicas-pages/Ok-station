<?php
/**
 * GET /backend/api/admin/shop-pricing.php — desglose de PRECIOS y MARGEN de la tienda.
 * Herramienta de auditoría/prueba: muestra, por producto, costo → margen (30%) →
 * base sin IVA → precio con IVA 8% (BC) y 16% (nacional). Requiere permiso shop.view.
 * Sirve para verificar que el margen y el IVA se aplican correctamente.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/ShopCatalog.php';
only_method('GET');

require_permission('shop.view');

$rows = [];
foreach (array_keys(ShopCatalog::PRODUCTS) as $id) {
    $rows[] = ShopCatalog::pricingFor((int) $id);
}

respond([
    'ok'      => true,
    'margin'  => ShopCatalog::margin(),
    'margin_pct' => round((ShopCatalog::margin() - 1) * 100, 1),
    'note'    => 'Precio = costo × margen + IVA. IVA 8% = Baja California; 16% = resto del país.',
    'products' => $rows,
]);

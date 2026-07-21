<?php
/** GET /backend/api/shop/get.php?id=## — detalle de una compra de tienda.
 *  El dueño ve la suya; el staff con permiso shop.view ve cualquiera. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
$id   = (int) ($_GET['id'] ?? 0);

$order = ShopOrder::find($id);
if (!$order) fail('Pedido no encontrado.', 404);

$isOwner = ((int) $order['user_id'] === (int) $user['id']);
$isStaff = user_has_permission((int) $user['id'], 'shop.view');
if (!$isOwner && !$isStaff) fail('No autorizado.', 403);

$order['items'] = ShopOrder::items($id);

/* Foto de cada renglón, para el detalle (panel y "Mis compras"). Los renglones son
   el SNAPSHOT de la compra y no guardan imagen; se toma la principal del catálogo
   ACTUAL en una sola consulta (mismo patrón que ShopProduct::related). Si el
   producto ya no existe o no tiene foto, el campo va vacío y la vista pinta su
   cajita gris: nunca truena. */
if ($order['items']) {
    $ids = array_column($order['items'], 'product_id');
    $in  = implode(',', array_fill(0, count($ids), '?'));
    try {
        $sti = db()->prepare(
            "SELECT product_id, COALESCE(stored_path, url) AS src
               FROM product_images WHERE is_primary = 1 AND product_id IN ($in)"
        );
        $sti->execute($ids);
        $img = [];
        foreach ($sti->fetchAll() as $r) { $img[(int) $r['product_id']] = (string) $r['src']; }
        foreach ($order['items'] as &$it) { $it['image'] = $img[(int) $it['product_id']] ?? ''; }
        unset($it);
    } catch (Throwable $e) { /* sin tabla de imágenes aún: el detalle sale sin fotos */ }
}

/* Solo administrador/directivo (o el dueño) ven importes; a empleado se le ocultan. */
$canSeeMoney = $isOwner || user_has_role((int) $user['id'], ['administrador', 'directivo']);
if (!$canSeeMoney) {
    foreach (['subtotal', 'tax', 'ship_cost', 'total', 'payment_amount'] as $m) { unset($order[$m]); }
    foreach ($order['items'] as &$it) { unset($it['unit_price'], $it['line_total']); }
    unset($it);
}

respond(['ok' => true, 'order' => $order]);

<?php
/** POST /backend/api/shop/create.php — crea un pedido de la TIENDA (e-commerce). Requiere sesión.
 *  SEGURIDAD: el precio se toma del catálogo del SERVIDOR (ShopCatalog); se ignora
 *  cualquier monto/precio que mande el navegador. El costo de envío también es del servidor.
 *  Body: { items:[{id,qty}], ship_mode:'retiro'|'envio', ship_address?, contact_phone, comments? }
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Pricing.php';
require __DIR__ . '/../lib/ShopCatalog.php';
require __DIR__ . '/../lib/Geo.php';
require __DIR__ . '/../lib/Addresses.php';   // ESTADOS: lista válida para el IVA
only_method('POST');

$user  = current_user();
$b     = body();
$items = $b['items'] ?? [];
$shipMode = (($b['ship_mode'] ?? 'retiro') === 'envio') ? 'envio' : 'retiro';
$shipAddress = trim((string) ($b['ship_address'] ?? ''));
$state = trim((string) ($b['state'] ?? ''));
$comments = trim((string) ($b['comments'] ?? ''));
/* Teléfono: se NORMALIZA a 10 dígitos pelones (móvil mexicano). El navegador ya
   solo deja teclear eso, pero esto es el API: cualquiera puede mandar otra cosa,
   así que la regla de verdad vive aquí. Se guarda limpio para que las trabajadoras
   puedan marcar/pegar en WhatsApp sin formatos raros. */
$phone = preg_replace('/\D/', '', (string) ($b['contact_phone'] ?? ''));
if (strlen($phone) === 12 && substr($phone, 0, 2) === '52') $phone = substr($phone, 2);  // vino con lada +52

if (!is_array($items) || count($items) === 0) fail('Tu carrito está vacío.');
if (count($items) > 50) fail('Demasiados productos en un solo pedido (máximo 50).');
if (mb_strlen($comments) > 1000) fail('Los comentarios son demasiado largos.');
if (strlen($phone) !== 10) fail('Ingresa un teléfono válido (10 dígitos) para poder contactarte.');
if ($shipMode === 'envio' && mb_strlen($shipAddress) < 10) fail('Ingresa la dirección de envío completa.');
if (mb_strlen($shipAddress) > 400) fail('La dirección es demasiado larga.');
/* El ESTADO decide la tasa de IVA (8% frontera vs 16% nacional), así que es un dato
   FISCAL, no cosmético. Se valida contra la MISMA lista que usa la libreta de
   direcciones (Addresses::ESTADOS) por dos razones:
     1. Sin tope, un estado largo revienta `ship_state VARCHAR(60)` y el pedido
        muere con un 500 opaco ("No se pudo crear el pedido").
     2. Con envío y estado vacío se caía al 8% de frontera para TODO el país.
        Ahora el estado es obligatorio cuando hay envío. */
if ($shipMode === 'envio' && !in_array($state, Addresses::ESTADOS, true)) {
    fail('Selecciona el estado de entrega para calcular el IVA correcto.');
}

/* IVA por GEOLOCALIZACIÓN (autoritativo en el servidor):
   - RECOGER en tienda = Tijuana (Baja California) → 8%.
   - ENVÍO = según el ESTADO de entrega (BC 8% / resto del país 16%).
   ShopCatalog::resolve() devuelve la base SIN IVA; aquí se le aplica el IVA del destino. */
$ivaRate = ($shipMode === 'envio') ? Geo::ivaForState($state) : 0.08;

/* Resolver cada ítem contra el catálogo del SERVIDOR (precio autoritativo).
   resolve() usa el catálogo REAL (products) y, si el id no está, el demo hardcodeado. */
$resolved  = [];
$sinStock  = [];    // productos del catálogo real que ya no alcanzan → "se nos acabó"
$totalIncl = 0.0;   // total con el IVA del destino ya aplicado
foreach ($items as $it) {
    $pid = (int) ($it['id'] ?? 0);
    $qty = max(1, min(999, (int) ($it['qty'] ?? 1)));
    $p = ShopCatalog::resolve($pid);
    if (!$p) continue;   // id inexistente → se ignora (no se confía en el cliente)
    // Validación de stock (solo catálogo real; el demo no lleva inventario).
    // NOTA: valida contra el stock del último sync; la revalidación EN VIVO contra Exel
    // (POST productos por almacenes) se añadirá cuando esté la API key.
    if ($p['stock'] !== null && $p['stock'] < $qty) { $sinStock[] = $p['name']; continue; }
    $unit = round($p['base'] * (1 + $ivaRate), 2);   // base sin IVA → IVA del destino
    $line = round($unit * $qty, 2);
    $totalIncl += $line;
    $resolved[] = ['id' => $pid, 'sku' => $p['sku'], 'name' => $p['name'], 'unit' => $unit, 'qty' => $qty, 'line' => $line];
}
if ($sinStock) {
    fail('Ya no hay suficiente inventario de: ' . implode(', ', $sinStock) . '. Actualiza tu carrito y vuelve a intentar.', 409, ['out_of_stock' => $sinStock]);
}
if (!$resolved) fail('No pudimos identificar los productos de tu carrito.', 422);

$shipCost = ($shipMode === 'envio') ? round((float) ShopCatalog::SHIP_COST, 2) : 0.0;
$totalIncl = round($totalIncl, 2);
$subtotal  = round($totalIncl / (1 + $ivaRate), 2);   // base sin IVA
$tax       = round($totalIncl - $subtotal, 2);        // IVA desglosado (a la tasa del destino)
$total     = round($totalIncl + $shipCost, 2);        // IVA incluido + envío
$ivaState  = ($shipMode === 'envio') ? $state : 'Baja California';   // ya validado contra ESTADOS

$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO shop_orders (user_id, code, ship_mode, ship_cost, ship_address, ship_state, subtotal, tax, iva_rate, total, contact_phone, comments)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            (int) $user['id'], 'TMP', $shipMode, $shipCost,
            $shipMode === 'envio' ? $shipAddress : null,
            $ivaState,
            $subtotal, $tax, $ivaRate, $total, $phone,
            $comments !== '' ? $comments : null,
        ]);
    $shopId = (int) $pdo->lastInsertId();
    $code = 'TDA-' . date('Y') . '-' . str_pad((string) $shopId, 6, '0', STR_PAD_LEFT);

    $ins = $pdo->prepare('INSERT INTO shop_order_items (shop_order_id, product_id, product_sku, product_name, unit_price, qty, line_total)
                          VALUES (?,?,?,?,?,?,?)');
    foreach ($resolved as $r) {
        $ins->execute([$shopId, $r['id'], $r['sku'], $r['name'], $r['unit'], $r['qty'], $r['line']]);
    }
    $pdo->prepare('UPDATE shop_orders SET code=? WHERE id=?')->execute([$code, $shopId]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el pedido.', 500);
}

log_activity((int) $user['id'], 'shop.create', 'shop_orders', $shopId);
try {
    db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
        ->execute([(int) $user['id'], 'shop', 'Pedido recibido', 'Recibimos tu pedido de la tienda ' . $code . '.']);
} catch (Throwable $e) { /* best-effort */ }

/* Correo al CLIENTE (a su Gmail): "recibimos tu compra". Best-effort. */
try {
    require_once __DIR__ . '/../lib/Mail.php';
    require_once __DIR__ . '/../lib/Emails.php';
    $to = (string) ($user['email'] ?? '');
    if ($to !== '') {
        $mailItems = array_map(function ($r) { return ['name' => $r['name'], 'qty' => $r['qty'], 'line' => $r['line']]; }, $resolved);
        $html = Emails::tiendaPedidoHtml([
            'name' => (string) ($user['full_name'] ?? ''),
            'code' => $code, 'items' => $mailItems,
            'subtotal' => $subtotal, 'tax' => $tax, 'ship' => $shipCost, 'total' => $total, 'shipMode' => $shipMode,
        ]);
        Mail::sendHtml($to, 'Recibimos tu compra ' . $code . ' · Ok.station', $html,
            'Recibimos tu pedido de la tienda ' . $code . '. ¡Gracias!');
    }
} catch (Throwable $e) { error_log('[shop.notify-client] ' . $e->getMessage()); }

/* Aviso al NEGOCIO. Best-effort. */
try {
    global $CONFIG;
    require_once __DIR__ . '/../lib/Mail.php';
    $bizTo = (string) ($CONFIG['business_email'] ?? 'station@okdock.mx');
    if ($bizTo !== '') {
        $bizHtml = '<p>Nueva <b>compra en la tienda</b> de Ok.station.</p>'
            . '<p><b>Folio:</b> ' . htmlspecialchars($code, ENT_QUOTES, 'UTF-8') . '<br>'
            . '<b>Cliente:</b> ' . htmlspecialchars((string) ($user['email'] ?? 'cliente'), ENT_QUOTES, 'UTF-8') . '<br>'
            . '<b>Teléfono:</b> ' . htmlspecialchars((string) $phone, ENT_QUOTES, 'UTF-8') . '<br>'
            . '<b>Entrega:</b> ' . ($shipMode === 'envio' ? 'Envío a domicilio' : 'Recoge en tienda') . '<br>'
            . '<b>Total:</b> $' . number_format((float) $total, 2) . ' MXN</p>'
            . '<p>Entra al panel de Ok.station para gestionarlo.</p>';
        Mail::sendHtml($bizTo, 'Nueva compra ' . $code . ' · Ok.station', $bizHtml, 'Nueva compra ' . $code . '.');
    }
} catch (Throwable $e) { error_log('[shop.notify-business] ' . $e->getMessage()); }

$order = ShopOrder::find($shopId);
$order['items'] = ShopOrder::items($shopId);
respond(['ok' => true, 'order' => $order], 201);

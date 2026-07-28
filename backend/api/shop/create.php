<?php
/** POST /backend/api/shop/create.php — crea un pedido de la TIENDA (e-commerce). Requiere sesión.
 *  SEGURIDAD: el precio se toma del catálogo del SERVIDOR (ShopCatalog); se ignora
 *  cualquier monto/precio que mande el navegador. El costo de envío también es del servidor.
 *  Body: { items:[{id,qty,seen_unit?}], ship_mode:'retiro'|'envio', ship_address?, contact_phone, comments? }
 *  `seen_unit` (opcional): precio de LISTA que el carrito mostró; si el actual difiere
 *  >3% (PRECIO_DERIVA_MAX) responde 409 {price_changed:[{id,name,seen,now}]}.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Pricing.php';
require __DIR__ . '/../lib/ShopCatalog.php';
require __DIR__ . '/../lib/ShopProduct.php';  // IVA_LISTA: la MISMA convención del precio que ve el cliente
require __DIR__ . '/../lib/Geo.php';
require __DIR__ . '/../lib/Addresses.php';   // ESTADOS: lista válida para el IVA
only_method('POST');

/* ── Umbral de deriva de precio (junta 2026-07-14): si el precio actual difiere >3%
   del que el cliente VIO en su carrito, el pedido se bloquea y el carrito se
   actualiza. Protege en ambas direcciones: al cliente (no pagar más de lo que vio
   tras un sync de Exel) y al negocio (no vender a un precio viejo más bajo).
   La comparación es contra el precio de LISTA (base × IVA_LISTA 8%), que es la
   convención con la que el carrito muestra los precios (products.php línea ~111);
   compararla contra el precio del DESTINO daría falsa alarma en envíos al 16%. */
const PRECIO_DERIVA_MAX = 0.03;

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

/* Correo de contacto OPCIONAL: si el cliente quiere los avisos de ESTA compra en otro
   correo (no el de su cuenta). Vacío o igual al de la cuenta → NULL (comportamiento
   de siempre: se avisa al correo de la cuenta). */
$contactEmail = strtolower(trim((string) ($b['contact_email'] ?? '')));
if ($contactEmail !== '' && !filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) {
    fail('El correo para avisos no es válido.');
}
if (mb_strlen($contactEmail) > 190) fail('El correo para avisos es demasiado largo.');
if ($contactEmail === strtolower(trim((string) ($user['email'] ?? '')))) $contactEmail = '';

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
$retirados = [];    // ids que existen pero ya no se publican → "ya no lo manejamos"
$precioCambio = []; // productos cuyo precio actual difiere >3% del que el cliente vio
$totalIncl = 0.0;   // total con el IVA del destino ya aplicado
foreach ($items as $it) {
    $pid = (int) ($it['id'] ?? 0);
    $qty = max(1, min(999, (int) ($it['qty'] ?? 1)));
    $p = ShopCatalog::resolve($pid);
    if (!$p) {
        /* Dos casos muy distintos detrás del mismo null, y confundirlos cuesta dinero:
           · El id NUNCA existió → basura del cliente, se ignora como siempre.
           · El id existe pero ya no se publica (Exel lo descontinuó, o quedó fuera del
             alcance del catálogo) → antes se caía del pedido EN SILENCIO. El cliente
             creía llevar tres cosas, pagaba dos y nadie le decía nada.
           Se avisa por el mismo camino que "se nos acabó", que ya devuelve 409 y hace
           que el carrito se repinte. */
        if (ShopCatalog::existeAunqueOculto($pid)) $retirados[] = $pid;
        continue;
    }
    // Validación de stock (solo catálogo real; el demo no lleva inventario).
    // NOTA: valida contra el stock del último sync; la revalidación EN VIVO contra Exel
    // (POST productos por almacenes) se añadirá cuando esté la API key.
    if ($p['stock'] !== null && $p['stock'] < $qty) { $sinStock[] = $p['name']; continue; }

    /* ── Bloqueo por deriva de precio (>3%) ──
       `seen_unit` es el precio de LISTA que el carrito mostraba al cliente. Es
       OPCIONAL a propósito: un carrito viejo que no lo mande sigue funcionando
       igual que antes (el precio autoritativo siempre fue el del servidor); solo
       que sin la protección. Cuando la deriva rebasa el umbral, NO se cobra ni el
       precio viejo ni el nuevo a ciegas: se devuelve 409 con los precios actuales
       para que el carrito se repinte y el cliente decida con el total real. */
    $listaNow = round($p['base'] * ShopProduct::IVA_LISTA, 2);
    $seen = isset($it['seen_unit']) && is_numeric($it['seen_unit']) ? (float) $it['seen_unit'] : null;
    if ($seen !== null && $seen > 0 && abs($listaNow - $seen) / $seen > PRECIO_DERIVA_MAX) {
        $precioCambio[] = ['id' => $pid, 'name' => $p['name'], 'seen' => round($seen, 2), 'now' => $listaNow];
        continue;
    }

    $unit = round($p['base'] * (1 + $ivaRate), 2);   // base sin IVA → IVA del destino
    $line = round($unit * $qty, 2);
    $totalIncl += $line;
    $resolved[] = ['id' => $pid, 'sku' => $p['sku'], 'name' => $p['name'], 'unit' => $unit, 'qty' => $qty, 'line' => $line];
}
/* Se revisa ANTES que el stock: si un producto ya ni se maneja, decirle al cliente
   "no hay suficiente inventario" lo mandaría a esperar algo que no va a volver. */
if ($retirados) {
    error_log('[shop.create] productos retirados en un carrito activo: ' . implode(',', $retirados));
    fail('Uno o más productos de tu carrito ya no están disponibles. Se quitaron: revisa tu carrito y el total antes de pagar.',
         409, ['unavailable' => $retirados]);
}
if ($sinStock) {
    fail('Ya no hay suficiente inventario de: ' . implode(', ', $sinStock) . '. Actualiza tu carrito y vuelve a intentar.', 409, ['out_of_stock' => $sinStock]);
}
if ($precioCambio) {
    $nombres = implode(', ', array_column($precioCambio, 'name'));
    /* Se registra SIEMPRE: si esto dispara seguido, el sync de Exel está corriendo
       poco (o un precio se movió de más) y alguien debe enterarse. */
    error_log('[shop.create] precio derivó >3% en: ' . $nombres);
    fail('El precio de ' . $nombres . ' cambió desde que lo agregaste. Tu carrito se actualizó con el precio vigente: revisa el total y vuelve a intentar.',
         409, ['price_changed' => $precioCambio]);
}
if (!$resolved) fail('No pudimos identificar los productos de tu carrito.', 422);

/* ── Costo del envío: lo cotiza EXEL, aquí y ahora ──
   El navegador manda qué transportista eligió el cliente, pero NUNCA cuánto cuesta:
   eso se vuelve a preguntar aquí, igual que se hace con los precios. Si se confiara
   en el número del navegador, cualquiera podría pagar $1 de envío.
   Ya no se usa la tarifa plana de ShopCatalog::SHIP_COST ($99): resultó estar por
   debajo del costo real de Exel —$130 el más barato, dentro de Tijuana—, así que
   cada envío se vendía con pérdida. Si Exel no contesta, el pedido NO se crea: es
   preferible pedirle al cliente que reintente que cobrarle un envío inventado. */
$shipCost = 0.0;
$shipCarrier = '';
if ($shipMode === 'envio') {
    require_once __DIR__ . '/../lib/ExelEnvios.php';

    $addressId = (int) ($b['address_id'] ?? 0);
    $st = db()->prepare('SELECT postal_code FROM user_addresses WHERE id = ? AND user_id = ? LIMIT 1');
    $st->execute([$addressId, (int) $user['id']]);
    $dirEnvio = $st->fetch();
    if (!$dirEnvio) fail('Elige una dirección de envío guardada.', 422);

    /* Las claves con las que Exel conoce cada producto no vienen en $resolved (que
       trae lo del cobro), así que se leen aparte con los ids ya validados. */
    $ids = array_column($resolved, 'id');
    $qtyPorId = [];
    foreach ($resolved as $r) $qtyPorId[(int) $r['id']] = (int) $r['qty'];
    $inPlaceholders = implode(',', array_fill(0, count($ids), '?'));
    $qx = db()->prepare("SELECT id, supplier_id, supplier_ref FROM products WHERE id IN ($inPlaceholders)");
    $qx->execute($ids);

    $paraExel = [];
    foreach ($qx->fetchAll() as $r) {
        $clave = trim((string) ($r['supplier_id'] ?? '')) ?: trim((string) ($r['supplier_ref'] ?? ''));
        if ($clave !== '') $paraExel[] = ['id_producto' => $clave, 'cantidad' => $qtyPorId[(int) $r['id']] ?? 1];
    }

    $coti = $paraExel ? ExelEnvios::cotizar((string) $dirEnvio['postal_code'], $paraExel) : null;
    if ($coti === null) {
        fail('No pudimos calcular el envío en este momento. Vuelve a intentarlo o elige recoger en tienda.', 503);
    }

    /* Se cobra la opción que el cliente eligió; si esa clave ya no viene en la
       cotización (cambió el carrito, o Exel dejó de ofrecerla), se usa la más
       barata, que es la primera. Nunca se inventa un número. */
    $elegida = null;
    $clavePedida = trim((string) ($b['transportista'] ?? ''));
    foreach ($coti['opciones'] as $o) { if ($o['clave'] === $clavePedida) { $elegida = $o; break; } }
    if ($elegida === null) $elegida = $coti['opciones'][0];

    $shipCost    = round((float) $elegida['costo'], 2);
    $shipCarrier = (string) $elegida['transportista'];

    /* El transportista se anexa a la dirección porque shop_orders no tiene columna
       propia para él, y quien prepara el pedido necesita saberlo (no es lo mismo
       dejarlo en el reparto local de Exel que darlo a FedEx). Se recorta para no
       pasarse del tope de 400 de la columna. */
    if ($shipCarrier !== '') {
        $shipAddress = mb_substr(trim($shipAddress) . ' · Envío: ' . $shipCarrier, 0, 400);
    }
}
$totalIncl = round($totalIncl, 2);
$subtotal  = round($totalIncl / (1 + $ivaRate), 2);   // base sin IVA
$tax       = round($totalIncl - $subtotal, 2);        // IVA desglosado (a la tasa del destino)
$total     = round($totalIncl + $shipCost, 2);        // IVA incluido + envío
$ivaState  = ($shipMode === 'envio') ? $state : 'Baja California';   // ya validado contra ESTADOS

$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO shop_orders (user_id, code, ship_mode, ship_cost, ship_address, ship_state, subtotal, tax, iva_rate, total, contact_phone, contact_email, comments)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            (int) $user['id'], 'TMP', $shipMode, $shipCost,
            $shipMode === 'envio' ? $shipAddress : null,
            $ivaState,
            $subtotal, $tax, $ivaRate, $total, $phone,
            $contactEmail !== '' ? $contactEmail : null,
            $comments !== '' ? $comments : null,
        ]);
    $shopId = (int) $pdo->lastInsertId();
    $code = 'TDA-' . date('Y') . '-' . str_pad((string) $shopId, 6, '0', STR_PAD_LEFT);

    $ins = $pdo->prepare('INSERT INTO shop_order_items (shop_order_id, product_id, product_sku, product_name, unit_price, qty, line_total)
                          VALUES (?,?,?,?,?,?,?)');
    foreach ($resolved as $r) {
        $ins->execute([$shopId, $r['id'], $r['sku'], $r['name'], $r['unit'], $r['qty'], $r['line']]);
    }

    /* ── Descuento de existencias, ATÓMICO y dentro de esta misma transacción ──
       La validación de más arriba mira el stock que había cuando se armó el carrito.
       Entre ese momento y éste, otro cliente pudo llevarse la última pieza: sin este
       paso los dos pagaban y solo uno podía recibirla.

       Lo que de verdad evita la doble venta es la condición `stock >= ?` DENTRO del
       UPDATE: la base resuelve quién llega primero. Si ya no alcanza, no toca ninguna
       fila, se levanta el error y la compra entera se deshace (no queda un pedido a
       medias ni un cobro sin respaldo).

       El stock es el del almacén 4 de Exel y el sync nocturno lo vuelve a fijar con el
       número del proveedor; esto cubre la ventana entre syncs, que es justo donde dos
       clientes se pisan. */
    $dec = $pdo->prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
    $agotados = [];
    foreach ($resolved as $r) {
        $dec->execute([$r['qty'], $r['id'], $r['qty']]);
        if ($dec->rowCount() === 0) $agotados[] = $r['name'];
    }
    if ($agotados) throw new RuntimeException('SIN_STOCK:' . implode(', ', $agotados));

    $pdo->prepare('UPDATE shop_orders SET code=? WHERE id=?')->execute([$code, $shopId]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    /* Se distingue "se acabó mientras comprabas" de un error de verdad: al cliente hay
       que decirle qué pasó y qué hacer, no un 500 opaco. */
    if (strncmp($e->getMessage(), 'SIN_STOCK:', 10) === 0) {
        $nombres = substr($e->getMessage(), 10);
        fail('Alguien se adelantó y ya no hay suficiente de: ' . $nombres
             . '. Ajusta las cantidades de tu carrito y vuelve a intentar.', 409,
             ['out_of_stock' => array_map('trim', explode(',', $nombres))]);
    }
    error_log('[shop.create] ' . $e->getMessage());
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
    /* Los avisos van al correo que ELIGIÓ el cliente para esta compra; si no eligió
       otro, al de su cuenta (como siempre). */
    $to = $contactEmail !== '' ? $contactEmail : (string) ($user['email'] ?? '');
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

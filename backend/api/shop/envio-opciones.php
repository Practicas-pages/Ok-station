<?php
/**
 * POST /backend/api/shop/envio-opciones.php — opciones de envío a una dirección.
 * -----------------------------------------------------------------------------
 * El checkout manda la dirección elegida y el carrito; aquí se le pregunta a Exel
 * cuánto cuesta mandarlo y con qué transportistas. Devuelve la lista para que el
 * cliente elija.
 *
 * Entra:  { "address_id": 12, "items": [ { "id": 5, "qty": 2 }, … ] }
 * Sale:   { ok:true, destino:{colonia,ciudad,estado}, opciones:[{clave,transportista,costo}] }
 *
 * Por qué se manda el ID de la dirección y NO un código postal suelto: así el CP
 * sale de la libreta del propio cliente (y se comprueba que la dirección es suya),
 * no de lo que alguien escriba en la petición.
 *
 * Este endpoint NO fija lo que se cobra. Es solo para pintar la pantalla: al crear
 * el pedido, shop/create.php vuelve a cotizar por su cuenta y usa SU número. Mismo
 * criterio que con los precios — el navegador nunca decide cuánto se paga.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/ExelEnvios.php';
only_method('POST');

$claims = require_auth();
$uid    = (int) $claims['sub'];

$in = body();
$addressId = (int) ($in['address_id'] ?? 0);
$items     = is_array($in['items'] ?? null) ? $in['items'] : [];

if ($addressId <= 0) fail('Falta la dirección de entrega.', 422);
if (!$items)         fail('El carrito está vacío.', 422);

/* La dirección tiene que ser del usuario de la sesión. */
$st = db()->prepare('SELECT postal_code FROM user_addresses WHERE id = ? AND user_id = ? LIMIT 1');
$st->execute([$addressId, $uid]);
$dir = $st->fetch();
if (!$dir) fail('Esa dirección no existe.', 404);

/* Nuestros ids de producto → el id que entiende Exel.
   `supplier_id` es el id del catálogo de Exel; `supplier_ref` es su referencia.
   Se prefiere el primero y se cae al segundo si viniera vacío. Solo productos
   activos de Exel: lo que no es suyo no lo puede enviar. */
$pedidos = [];
foreach ($items as $it) {
    $id  = (int) ($it['id'] ?? 0);
    $qty = max(1, (int) ($it['qty'] ?? 1));
    if ($id > 0) $pedidos[$id] = ($pedidos[$id] ?? 0) + $qty;
}
if (!$pedidos) fail('El carrito está vacío.', 422);

$in_  = implode(',', array_fill(0, count($pedidos), '?'));
$q    = db()->prepare("SELECT id, supplier_id, supplier_ref FROM products
                        WHERE id IN ($in_) AND is_active = 1 AND supplier = 'exel'");
$q->execute(array_keys($pedidos));

$paraExel = [];
foreach ($q->fetchAll() as $r) {
    $clave = trim((string) ($r['supplier_id'] ?? '')) ?: trim((string) ($r['supplier_ref'] ?? ''));
    if ($clave === '') continue;
    $paraExel[] = ['id_producto' => $clave, 'cantidad' => $pedidos[(int) $r['id']] ?? 1];
}

/* Un carrito sin nada de Exel no se puede cotizar con ellos: sale de la tienda y
   hoy eso no está resuelto. Se dice claro en vez de inventar una tarifa. */
if (!$paraExel) {
    respond(['ok' => false, 'error' => 'Estos productos no se envían por paquetería. Puedes recogerlos en la tienda.'], 200);
}

$r = ExelEnvios::cotizar((string) $dir['postal_code'], $paraExel);

if ($r === null) {
    /* Sin cotización NO se ofrece envío. Antes se cobraba una tarifa plana de $99
       que resultó estar por debajo del costo real (el más barato son $130), así que
       caer a un número inventado significaría vender con pérdida sin enterarse.
       Mejor decirle al cliente que recoja o lo intente de nuevo. */
    respond([
        'ok'    => false,
        'error' => 'No pudimos calcular el envío en este momento. Vuelve a intentarlo o elige recoger en tienda.',
    ], 200);
}

respond(['ok' => true, 'destino' => $r['destino'], 'opciones' => $r['opciones']]);

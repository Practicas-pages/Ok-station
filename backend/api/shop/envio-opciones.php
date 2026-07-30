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

require_once __DIR__ . '/../lib/EnvioRespaldo.php';

/** Opción de RESPALDO por zona: se ofrece cuando la paquetería no cotiza, para que la
 *  venta nunca se trabe (envío disponible el 100%). `respaldo:true` avisa al front que
 *  es una tarifa estimada. El monto lo confirma create.php de la misma forma. */
function respaldoEnvio(string $cp)
{
    respond(['ok' => true, 'respaldo' => true, 'destino' => [], 'opciones' => [[
        'clave'        => 'RESPALDO',
        'transportista' => EnvioRespaldo::etiquetaCliente(),
        'costo'        => EnvioRespaldo::tarifa($cp),
    ]]], 200);
}

/* Un carrito sin claves de paquetería igual se puede enviar desde la tienda: se
   ofrece la tarifa de respaldo en vez de trabar la venta. */
if (!$paraExel) {
    respaldoEnvio((string) $dir['postal_code']);
}

$r = ExelEnvios::cotizar((string) $dir['postal_code'], $paraExel);

/* La paquetería no cotizó (caída o throttle). En lugar de dejar sin envío al cliente,
   se ofrece la tarifa de RESPALDO por zona (estimada; ver EnvioRespaldo). Cuando la
   paquetería vuelva a responder, se usa su precio real. */
if ($r === null) {
    respaldoEnvio((string) $dir['postal_code']);
}

respond(['ok' => true, 'destino' => $r['destino'], 'opciones' => $r['opciones']]);

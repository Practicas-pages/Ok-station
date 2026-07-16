<?php
/** POST /backend/api/shop/address-default.php — elige cuál dirección es la predeterminada.
 *  Requiere sesión. Body: { id }
 *  Es la que la barra de la tienda muestra como "Entrega en {ciudad} {CP}" y la que
 *  se propone en el checkout.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Addresses.php';
only_method('POST');

$claims = require_auth();
$uid    = (int) $claims['sub'];
$id     = (int) (body()['id'] ?? 0);

if ($id <= 0) fail('Falta la dirección.');

/* setDefault comprueba que la dirección sea del usuario. Sin eso, cualquiera con
   sesión podría marcar como suya la dirección de otro mandando su id. */
try {
    if (!Addresses::setDefault(db(), $uid, $id)) fail('Esa dirección no existe.', 404);
} catch (Throwable $e) {
    fail('No se pudo actualizar.', 500);
}

respond(['ok' => true, 'addresses' => Addresses::listFor(db(), $uid)]);

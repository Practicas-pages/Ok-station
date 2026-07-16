<?php
/** GET /backend/api/shop/addresses.php — libreta de direcciones del cliente. Requiere sesión.
 *  Devuelve { ok, addresses:[...], states:[...] }. La predeterminada va primero.
 *  `states` viaja aquí para que el front no duplique la lista de estados de México.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Addresses.php';
only_method('GET');

$claims = require_auth();
$uid    = (int) $claims['sub'];

respond([
    'ok'        => true,
    'addresses' => Addresses::listFor(db(), $uid),
    'states'    => Addresses::ESTADOS,
]);

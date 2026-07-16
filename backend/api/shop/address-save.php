<?php
/** POST /backend/api/shop/address-save.php — agrega una dirección. Requiere sesión.
 *  Body: { recipient, phone, street, ext_num, int_num?, neighborhood, city, state,
 *          postal_code, notes?, is_default? }
 *  Devuelve la libreta completa ya actualizada, para que el front no tenga que
 *  volver a pedirla (y no se le desincronice la marca de predeterminada).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Addresses.php';
only_method('POST');

$claims = require_auth();
$uid    = (int) $claims['sub'];
$b      = body();
$pdo    = db();

$n = (int) $pdo->query("SELECT COUNT(*) FROM user_addresses WHERE user_id = {$uid}")->fetchColumn();
if ($n >= Addresses::MAX_POR_USUARIO) {
    fail('Llegaste al máximo de ' . Addresses::MAX_POR_USUARIO . ' direcciones. Borra una para agregar otra.');
}

[$d, $err] = Addresses::validate($b);
if ($err !== null) fail($err);

try {
    $id = Addresses::create($pdo, $uid, $d, !empty($b['is_default']));
} catch (Throwable $e) {
    fail('No se pudo guardar la dirección.', 500);
}

respond(['ok' => true, 'id' => $id, 'addresses' => Addresses::listFor($pdo, $uid)]);

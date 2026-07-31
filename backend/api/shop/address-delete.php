<?php
/** POST /backend/api/shop/address-delete.php — borra una dirección del cliente.
 *  Requiere sesión. Body: { id }. Solo borra si la dirección es del usuario.
 *  Devuelve la libreta completa ya actualizada (para no re-pedirla en el front).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Addresses.php';
only_method('POST');

$claims = require_auth();
$uid    = (int) $claims['sub'];
$b      = body();
$id     = (int) ($b['id'] ?? 0);
if ($id <= 0) fail('Falta la dirección a borrar.');

$pdo = db();
try {
    $ok = Addresses::delete($pdo, $uid, $id);
} catch (Throwable $e) {
    error_log('[address-delete] ' . $e->getMessage());
    fail('No se pudo borrar la dirección.', 500);
}
if (!$ok) fail('Esa dirección no existe.', 404);

respond(['ok' => true, 'addresses' => Addresses::listFor($pdo, $uid)]);

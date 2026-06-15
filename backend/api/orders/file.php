<?php
/** GET /backend/api/orders/file.php?id=## — sirve el ARCHIVO subido por el cliente (dueño o staff).
 *  Sirve para que el trabajador (admin) vea/imprima exactamente lo que el cliente pide. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
$id   = (int) ($_GET['id'] ?? 0);

$f = UploadedFile::find($id);
if (!$f) fail('Archivo no encontrado.', 404);

$isOwner = ((int) $f['user_id'] === (int) $user['id']);
$canView = user_has_permission((int) $user['id'], 'orders.view');
if (!$isOwner && !$canView) fail('No autorizado.', 403);

if (empty($f['stored_path']) || !is_file($f['stored_path'])) {
    fail('El archivo ya no está disponible.', 404);
}

$mime = $f['mime_type'] ?: 'application/octet-stream';
$name = preg_replace('/[\r\n"]/', '', (string) ($f['original_name'] ?: ('archivo-' . $id)));

// Servimos el binario (no es JSON): reemplazamos los headers.
header_remove('Content-Type');
header('Content-Type: ' . $mime);
header('Content-Disposition: inline; filename="' . $name . '"');
header('Content-Length: ' . filesize($f['stored_path']));
header('X-Content-Type-Options: nosniff');
readfile($f['stored_path']);
exit;

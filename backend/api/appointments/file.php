<?php
/** GET /backend/api/appointments/file.php?id=## — sirve un documento adjunto a una cita.
 *  Acceso: el dueño de la cita o staff con permiso 'appointments.view'. id = uploaded_file_id. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user   = current_user();
$fileId = (int) ($_GET['id'] ?? 0);
if ($fileId < 1) fail('Solicitud inválida.');

$st = db()->prepare(
    'SELECT a.user_id AS appt_user, uf.stored_path, uf.mime_type, uf.original_name
       FROM appointment_files af
       JOIN appointments a   ON a.id  = af.appointment_id
       JOIN uploaded_files uf ON uf.id = af.uploaded_file_id
      WHERE af.uploaded_file_id = ? LIMIT 1'
);
$st->execute([$fileId]);
$row = $st->fetch();
if (!$row) fail('Archivo no encontrado.', 404);

$isOwner = $row['appt_user'] && ((int) $row['appt_user'] === (int) $user['id']);
$canView = user_has_permission((int) $user['id'], 'appointments.view');
if (!$isOwner && !$canView) fail('No autorizado.', 403);

if (empty($row['stored_path']) || !is_file($row['stored_path'])) {
    fail('El archivo ya no está disponible.', 404);
}

$mime = $row['mime_type'] ?: 'application/octet-stream';
$name = preg_replace('/[\r\n"]/', '', (string) ($row['original_name'] ?: ('documento-' . $fileId)));

// Servimos el binario (no es JSON): reemplazamos los headers.
header_remove('Content-Type');
header('Content-Type: ' . $mime);
header('Content-Disposition: inline; filename="' . $name . '"');
header('Content-Length: ' . filesize($row['stored_path']));
header('X-Content-Type-Options: nosniff');
readfile($row['stored_path']);
exit;

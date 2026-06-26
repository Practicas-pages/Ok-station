<?php
/**
 * POST /backend/api/appointments/upload.php — adjunta un documento a una cita (multipart).
 * Público: las citas pueden crearlas invitados, así que este endpoint no exige sesión.
 * Anti-abuso: solo citas PENDIENTES y recientes (24 h), con tope de archivos por cita,
 * validando tipo (PDF/JPG/PNG) y tamaño. Reutiliza Storage + uploaded_files.
 * Campos: appointment_id, doc_key, doc_label, file
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Storage.php';
only_method('POST');

$apptId   = (int) ($_POST['appointment_id'] ?? 0);
$docKey   = preg_replace('/[^a-z0-9_]/i', '', (string) ($_POST['doc_key'] ?? ''));
$docLabel = mb_substr(trim((string) ($_POST['doc_label'] ?? $docKey)), 0, 120);
/* Persona (dentro de la cita) a la que pertenece el documento. Opcional y tolerante. */
$guestName = mb_substr(trim((string) ($_POST['guest_name'] ?? '')), 0, 120);
$guestIdx  = (isset($_POST['guest_index']) && $_POST['guest_index'] !== '') ? (int) $_POST['guest_index'] : null;
if ($guestIdx !== null && ($guestIdx < 0 || $guestIdx > 50)) $guestIdx = null;
if ($apptId < 1 || $docKey === '') fail('Solicitud inválida.');

$appt = Appointment::find($apptId);
if (!$appt) fail('Cita no encontrada.', 404);

/* Solo se admiten documentos en citas pendientes y creadas hace poco (anti-abuso). */
if (($appt['status'] ?? '') !== 'pendiente') fail('La cita ya no admite documentos.', 409);
$created = strtotime((string) ($appt['created_at'] ?? ''));
if ($created && (time() - $created) > 86400) fail('El plazo para adjuntar documentos terminó.', 409);

/* Tope de archivos por cita. */
try {
    $cnt = db()->prepare('SELECT COUNT(*) FROM appointment_files WHERE appointment_id = ?');
    $cnt->execute([$apptId]);
    if ((int) $cnt->fetchColumn() >= 15) fail('Alcanzaste el máximo de documentos para esta cita.', 409);
} catch (Throwable $e) {
    fail('La carga de documentos aún no está disponible.', 503); // migración 0013 pendiente
}

if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? 1) !== UPLOAD_ERR_OK) {
    fail('No se recibió ningún archivo válido.');
}
$f = $_FILES['file'];

global $CONFIG;
$maxBytes = (int) ($CONFIG['max_upload_mb'] ?? 25) * 1024 * 1024;
if ($f['size'] > $maxBytes) fail('El archivo supera el límite de ' . (int) $CONFIG['max_upload_mb'] . ' MB.');

$allowed = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png'];
$mime = Storage::detectMime($f['tmp_name']);   // por contenido, nunca el tipo del cliente
if ($mime === '') fail('No se pudo verificar el tipo del archivo. Intenta de nuevo.', 422);
if (!isset($allowed[$mime])) fail('Tipo no permitido. Sube PDF, JPG o PNG.');

/* Guardado del documento. user_id puede ser NULL en citas de INVITADO (sin
   sesión): la columna uploaded_files.user_id es NULLABLE desde la migración 0019.
   Robustez: si el registro en BD falla tras mover el archivo, no dejamos el
   archivo huérfano y devolvemos un error limpio. */
$path = null;
try {
    // Fuerza la extensión según el MIME detectado (anti subida de .php / RCE).
    $path = Storage::moveUploaded('appointments', $f, $allowed[$mime]);

    $fileId = UploadedFile::create([
        'user_id'       => ($appt['user_id'] ? (int) $appt['user_id'] : null),
        'original_name' => $f['name'],
        'stored_path'   => $path,
        'mime_type'     => $mime,
        'size_bytes'    => (int) $f['size'],
        'pages'         => 1,
    ]);

    /* Vincula el archivo a su cita y, si el esquema lo soporta (migración 0014), a la
       persona concreta (guest_index/guest_name). Retrocompatible si aún no se aplicó. */
    $cols = ['appointment_id', 'uploaded_file_id', 'doc_key', 'doc_label'];
    $vals = [$apptId, $fileId, $docKey, $docLabel];
    if (function_exists('table_has_column') && table_has_column('appointment_files', 'guest_index')) {
        $cols[] = 'guest_index'; $vals[] = $guestIdx;
        $cols[] = 'guest_name';  $vals[] = ($guestName !== '' ? $guestName : null);
    }
    $ph = implode(',', array_fill(0, count($cols), '?'));
    db()->prepare('INSERT INTO appointment_files (' . implode(',', $cols) . ') VALUES (' . $ph . ')')
        ->execute($vals);
} catch (Throwable $e) {
    if ($path && is_file($path)) @unlink($path);   // no dejar archivo huérfano
    error_log('[appointments/upload] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail('No se pudo guardar el documento. Inténtalo de nuevo.', 500);
}

respond(['ok' => true, 'file' => [
    'id' => $fileId, 'doc_key' => $docKey, 'doc_label' => $docLabel,
    'guest_index' => $guestIdx, 'guest_name' => $guestName,
    'original_name' => $f['name'], 'mime_type' => $mime, 'size_bytes' => (int) $f['size'],
]], 201);

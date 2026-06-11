<?php
/** POST /backend/api/orders/upload.php — sube un PDF o imagen (multipart). Requiere sesión. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Storage.php';
only_method('POST');

$user = current_user();

if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? 1) !== UPLOAD_ERR_OK) {
    fail('No se recibió ningún archivo válido.');
}
$f = $_FILES['file'];

global $CONFIG;
$maxBytes = (int) ($CONFIG['max_upload_mb'] ?? 25) * 1024 * 1024;
if ($f['size'] > $maxBytes) fail('El archivo supera el límite de ' . (int) $CONFIG['max_upload_mb'] . ' MB.');

$allowed = [
    'application/pdf' => 'pdf',
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
    'image/webp'      => 'webp',
];
$mime = function_exists('mime_content_type') ? (mime_content_type($f['tmp_name']) ?: $f['type']) : $f['type'];
if (!isset($allowed[$mime])) fail('Tipo no permitido. Sube PDF, JPG, PNG o WEBP.');

// Fuerza la extensión según el MIME detectado (anti subida de .php / RCE).
$path = Storage::moveUploaded('uploads', $f, $allowed[$mime]);

// Nº de páginas: lo manda el cliente (pdf.js) o se estima para PDF.
$pages = isset($_POST['pages']) ? max(1, (int) $_POST['pages']) : 1;
if ($mime === 'application/pdf' && !isset($_POST['pages'])) {
    $c = @file_get_contents($path);
    if ($c !== false && preg_match_all('/\/Type\s*\/Page[^s]/', $c, $m)) {
        $pages = max(1, count($m[0]));
    }
}

$id = UploadedFile::create([
    'user_id'       => (int) $user['id'],
    'original_name' => $f['name'],
    'stored_path'   => $path,
    'mime_type'     => $mime,
    'size_bytes'    => (int) $f['size'],
    'pages'         => $pages,
]);

respond(['ok' => true, 'file' => [
    'id' => $id, 'original_name' => $f['name'], 'pages' => $pages,
    'size_bytes' => (int) $f['size'], 'mime_type' => $mime,
]], 201);

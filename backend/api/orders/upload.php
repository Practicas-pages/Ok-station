<?php
/** POST /backend/api/orders/upload.php — sube un PDF o imagen (multipart).
 *  Sesión OPCIONAL: con Bearer válido el archivo queda ligado a la cuenta; sin sesión
 *  se guarda con user_id NULL (exploración libre de precios en el configurador).
 *  ENVIAR el pedido sí exige sesión: orders/create.php requiere auth y además valida
 *  que cada archivo pertenezca al usuario, así que un archivo anónimo no puede
 *  terminar en un pedido. Mismo patrón de token opcional que appointments/create.php. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Storage.php';
only_method('POST');

$userId = null;
$hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (preg_match('/Bearer\s+(.+)/i', $hdr, $m)) {
    $claims = jwt_verify(trim($m[1]));
    if ($claims) $userId = (int) $claims['sub'];
}

global $CONFIG;
$postMax = (int) ($CONFIG['max_upload_mb'] ?? 25);

/* Mensaje claro cuando el archivo supera el límite del servidor (php.ini): PHP vacía
   $_FILES si se excede post_max_size, o marca UPLOAD_ERR_INI_SIZE si excede
   upload_max_filesize. Sin esto, el usuario veía un genérico "No se recibió archivo". */
$err = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
if ((empty($_FILES) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0)
    || $err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
    fail('El archivo es demasiado grande (máximo ' . $postMax . ' MB). Comprímelo e inténtalo de nuevo.', 413);
}
if (empty($_FILES['file']) || $err !== UPLOAD_ERR_OK) {
    fail('No se recibió ningún archivo válido.');
}
$f = $_FILES['file'];

$maxBytes = $postMax * 1024 * 1024;
if ($f['size'] > $maxBytes) fail('El archivo supera el límite de ' . (int) $CONFIG['max_upload_mb'] . ' MB.');

$allowed = [
    'application/pdf' => 'pdf',
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
    'image/webp'      => 'webp',
];
$mime = Storage::detectMime($f['tmp_name']);   // por contenido, nunca el tipo del cliente
if ($mime === '') fail('No se pudo verificar el tipo del archivo. Intenta de nuevo.', 422);
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
    'user_id'       => $userId,   /* NULL para invitados (uploaded_files.user_id es NULLable, migración 0014) */
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

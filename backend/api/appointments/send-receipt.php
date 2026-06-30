<?php
/**
 * POST /backend/api/appointments/send-receipt.php
 * Envía al cliente su COMPROBANTE de CITA (PDF) por correo (vía Brevo).
 * El PDF se genera en el navegador (jsPDF) y llega aquí en base64.
 *
 * Público (las citas permiten invitados, sin sesión). Para evitar abuso:
 *   - se valida que appointment_id + code coincidan con una cita real;
 *   - SOLO se envía al correo GUARDADO de esa cita (nunca a un correo que mande
 *     el cliente), así no se puede usar el endpoint para enviar spam a terceros.
 * Best-effort: si el correo falla, responde ok:true, sent:false (no rompe nada).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Model.php';
only_method('POST');

$b    = body();
$id   = (int) ($b['appointment_id'] ?? 0);
$code = trim((string) ($b['code'] ?? ''));
$data = (string) ($b['pdf_base64'] ?? '');

$appt = Appointment::find($id);
if (!$appt) { respond(['ok' => true, 'sent' => false, 'reason' => 'not_found']); }

/* El folio debe coincidir (evita mandar comprobantes de citas ajenas por id). */
if ($code === '' || !hash_equals((string) $appt['code'], $code)) {
    respond(['ok' => true, 'sent' => false, 'reason' => 'mismatch']);
}

$to = trim((string) ($appt['contact_email'] ?? ''));
if ($to === '') { respond(['ok' => true, 'sent' => false, 'reason' => 'no_email']); }

/* El adjunto debe ser un PDF real y de tamaño razonable. */
if (strpos($data, ',') !== false) $data = substr($data, strpos($data, ',') + 1);
$bytes = base64_decode($data, true);
if ($bytes === false || strlen($bytes) < 100 || substr($bytes, 0, 5) !== '%PDF-') {
    respond(['ok' => true, 'sent' => false, 'reason' => 'bad_pdf']);
}
if (strlen($bytes) > 5 * 1024 * 1024) {
    respond(['ok' => true, 'sent' => false, 'reason' => 'too_big']);
}

$sent = false;
try {
    require_once __DIR__ . '/../lib/Mail.php';
    require_once __DIR__ . '/../lib/Emails.php';
    $cd   = (string) $appt['code'];
    $html = Emails::comprobanteHtml('cita', $cd, (string) ($appt['contact_name'] ?? ''));
    $sent = Mail::sendHtml(
        $to,
        'Tu comprobante de cita ' . $cd . ' · OK.station',
        $html,
        'Adjuntamos el comprobante (PDF) de tu cita ' . $cd . ' en OK.station.',
        [['name' => 'comprobante-' . $cd . '.pdf', 'content' => base64_encode($bytes)]]
    );
} catch (Throwable $e) { $sent = false; }

respond(['ok' => true, 'sent' => $sent]);

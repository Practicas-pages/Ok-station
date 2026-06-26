<?php
/**
 * GET /backend/api/appointments/confirm.php?c=CITA-...&t=TOKEN
 * Enlace público que el cliente abre desde su correo para CONFIRMAR su cita.
 * No exige sesión: el token (40 hex) es la credencial. Marca client_confirmed_at;
 * NO cambia el estado (eso lo hace el trabajador en el panel). Responde HTML.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Emails.php';
header('Content-Type: text/html; charset=utf-8');

function confirm_page(string $h, string $m, bool $ok): void { echo Emails::confirmPage($h, $m, $ok); exit; }

$code  = trim((string) ($_GET['c'] ?? ''));
$token = trim((string) ($_GET['t'] ?? ''));

if ($code === '' || $token === '' || strlen($token) > 60) {
    confirm_page('Enlace inválido', 'El enlace de confirmación no es válido. Revisa el correo o escríbenos por WhatsApp.', false);
}
if (!table_has_column('appointments', 'confirm_token')) {
    confirm_page('Confirmación no disponible', 'Aún no podemos confirmar por correo. No te preocupes: te contactaremos para confirmar tu cita.', false);
}

$st = db()->prepare('SELECT id, status, confirm_token, client_confirmed_at FROM appointments WHERE code = ? LIMIT 1');
$st->execute([$code]);
$a = $st->fetch();

if (!$a || empty($a['confirm_token']) || !hash_equals((string) $a['confirm_token'], $token)) {
    confirm_page('Enlace inválido', 'No encontramos esa cita o el enlace ya no es válido. Escríbenos por WhatsApp y con gusto te ayudamos.', false);
}
if ($a['status'] === 'cancelada') {
    confirm_page('Cita cancelada', 'Esta cita aparece como cancelada. Si crees que es un error, escríbenos por WhatsApp.', false);
}
if (!empty($a['client_confirmed_at'])) {
    confirm_page('¡Ya estaba confirmada!', 'Gracias, ya teníamos registrada tu confirmación. Te esperamos en OK.station.', true);
}

db()->prepare('UPDATE appointments SET client_confirmed_at = NOW() WHERE id = ?')->execute([(int) $a['id']]);

confirm_page('¡Cita confirmada!', 'Gracias por confirmar. Tu cita quedó registrada y te esperamos. Cualquier duda, escríbenos por WhatsApp.', true);

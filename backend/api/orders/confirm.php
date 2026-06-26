<?php
/**
 * GET /backend/api/orders/confirm.php?c=OKS-...&t=TOKEN
 * Enlace público que el cliente abre desde su correo para CONFIRMAR su pedido.
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
if (!table_has_column('orders', 'confirm_token')) {
    confirm_page('Confirmación no disponible', 'Aún no podemos confirmar por correo. No te preocupes: te avisaremos cuando tu pedido esté listo.', false);
}

$st = db()->prepare('SELECT id, status, confirm_token, client_confirmed_at FROM orders WHERE code = ? LIMIT 1');
$st->execute([$code]);
$o = $st->fetch();

if (!$o || empty($o['confirm_token']) || !hash_equals((string) $o['confirm_token'], $token)) {
    confirm_page('Enlace inválido', 'No encontramos ese pedido o el enlace ya no es válido. Escríbenos por WhatsApp y con gusto te ayudamos.', false);
}
if ($o['status'] === 'cancelado') {
    confirm_page('Pedido cancelado', 'Este pedido aparece como cancelado. Si crees que es un error, escríbenos por WhatsApp.', false);
}
if (!empty($o['client_confirmed_at'])) {
    confirm_page('¡Ya estaba confirmado!', 'Gracias, ya teníamos registrada tu confirmación. Te avisaremos cuando esté listo para recoger.', true);
}

db()->prepare('UPDATE orders SET client_confirmed_at = NOW() WHERE id = ?')->execute([(int) $o['id']]);

confirm_page('¡Pedido confirmado!', 'Gracias por confirmar. Prepararemos tu pedido y te avisaremos cuando esté listo para recoger.', true);

<?php
/**
 * POST /backend/api/admin/appointment-price.php — la trabajadora fija el ANTICIPO
 * de una cita cuyo trámite se cotiza (p. ej. apostille / cita médica) y avisa al cliente.
 *
 * Body: { id, amount }  — `amount` es el anticipo total a pagar (MXN, IVA incluido).
 * Requiere el permiso 'appointments.update_status' (mismo que cambiar el estado).
 *
 * Efectos: guarda `amount_total`, marca `quoted_at`, notifica in-app y envía un
 * correo al cliente con botón para pagar el anticipo en línea.
 * Espejo de admin/order-price.php.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user   = require_permission('appointments.update_status');
$b      = body();
$id     = (int) ($b['id'] ?? 0);
$amount = round((float) ($b['amount'] ?? $b['total'] ?? 0), 2);

if ($amount <= 0)      fail('Ingresa un anticipo válido mayor a $0.');
if ($amount > 1000000) fail('El monto es demasiado alto. Revisa la cifra.');

if (!table_has_column('appointments', 'amount_total')) fail('El cobro de anticipos no está habilitado.', 409);

$a = Appointment::find($id);
if (!$a) fail('Cita no encontrada.', 404);
if (($a['status'] ?? '') === 'cancelada')               fail('Esta cita está cancelada y no se puede cotizar.', 409);
if (($a['payment_status'] ?? 'pendiente') === 'pagado') fail('Esta cita ya tiene el anticipo pagado.', 409);

$data = ['amount_total' => $amount];
if (table_has_column('appointments', 'quoted_at')) $data['quoted_at'] = date('Y-m-d H:i:s');
Appointment::update($id, $data);

log_activity((int) $user['id'], 'appointment.price_set', 'appointments', $id, ['amount' => $amount]);

/* Notificación in-app (solo si la cita está asociada a una cuenta). */
if (!empty($a['user_id'])) {
    db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
        ->execute([
            (int) $a['user_id'], 'appointment', 'Anticipo listo',
            'Tu cita ' . $a['code'] . ' ya tiene anticipo: $' . number_format($amount, 2) . ' MXN. Ya puedes pagarlo en línea.',
        ]);
}

/* Correo al cliente con botón de pago (best-effort). El destinatario es el correo
   de la cuenta o, si es invitado, el correo de contacto de la cita. */
$emailed = false;
try {
    require_once __DIR__ . '/../lib/Mail.php';
    require_once __DIR__ . '/../lib/Emails.php';
    $to = ''; $name = (string) ($a['contact_name'] ?? '');
    if (!empty($a['user_id'])) {
        $cu = User::find((int) $a['user_id']);
        if ($cu) { $to = (string) ($cu['email'] ?? ''); if ($name === '') $name = (string) ($cu['full_name'] ?? ''); }
    }
    if ($to === '') $to = trim((string) ($a['contact_email'] ?? ''));
    if ($to !== '') {
        global $CONFIG;
        $base = rtrim((string) ($CONFIG['app_url'] ?? 'https://okstation.mx'), '/');
        $html = Emails::citaPrecioHtml([
            'name'   => $name,
            'code'   => (string) $a['code'],
            'total'  => $amount,
            'payUrl' => $base . '/perfil.html#citas',
        ]);
        $emailed = Mail::sendHtml(
            $to,
            'Tu cita ' . $a['code'] . ' ya tiene anticipo · Ok.station',
            $html,
            'Tu cita ' . $a['code'] . ' ya tiene anticipo: $' . number_format($amount, 2) . ' MXN. Entra a okstation.mx para pagarlo en línea.'
        );
    }
} catch (Throwable $e) { /* best-effort: el correo no debe afectar el guardado */ }

respond(['ok' => true, 'amount_total' => $amount, 'emailed' => $emailed]);

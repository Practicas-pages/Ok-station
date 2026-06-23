<?php
/** POST /backend/api/admin/appointment-status.php — cambia el estado de una cita y/o agrega nota interna.
 *  Requiere permiso 'appointments.update_status'. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user   = require_permission('appointments.update_status');
$b      = body();
$id     = (int) ($b['id'] ?? 0);
$status = (string) ($b['status'] ?? '');
$note   = trim((string) ($b['note'] ?? ''));

$valid = ['pendiente', 'confirmada', 'cancelada', 'completada', 'no_show'];
if (!in_array($status, $valid, true)) fail('Estado inválido.');

$a = Appointment::find($id);
if (!$a) fail('Cita no encontrada.', 404);

$data = ['status' => $status];
if ($note !== '') {
    $data['staff_notes'] = trim((string) ($a['staff_notes'] ?? '') . "\n" . $note);
}
Appointment::update($id, $data);

log_activity((int) $user['id'], 'appointment.status_changed', 'appointments', $id, ['status' => $status]);

/* Avisa al cliente si la cita está ligada a una cuenta. */
if (!empty($a['user_id'])) {
    $labels = ['pendiente' => 'pendiente', 'confirmada' => 'confirmada', 'cancelada' => 'cancelada', 'completada' => 'completada', 'no_show' => 'no asistida'];
    db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
        ->execute([(int) $a['user_id'], 'appointment', 'Cita actualizada', 'Tu cita ' . $a['code'] . ' ahora está: ' . ($labels[$status] ?? $status) . '.']);
}

respond(['ok' => true]);

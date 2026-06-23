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

// Aviso por correo al cliente (cuenta o invitado vía contact_email). Best-effort.
try {
    require_once __DIR__ . '/../lib/Mailer.php';
    $email = '';
    $name  = (string) ($a['contact_name'] ?? '');
    if (!empty($a['user_id'])) {
        $cust = user_public((int) $a['user_id']);
        if ($cust) { $email = (string) ($cust['email'] ?? ''); if (!empty($cust['full_name'])) $name = $cust['full_name']; }
    }
    if ($email === '') $email = trim((string) ($a['contact_email'] ?? ''));
    if ($email !== '') {
        $tramites = ['pasaporte' => 'Pasaporte', 'visa' => 'Visa Americana', 'sentri' => 'SENTRI / Global Entry', 'i94' => 'I-94 / Permiso de Viaje', 'curp' => 'CURP / Acta', 'ine' => 'INE / Credencial', 'licencia' => 'Licencia de Conducir', 'apostille' => 'Apostille / Traducción', 'medica' => 'Cita Médica / Examen'];
        $sLabels = ['pendiente' => 'Pendiente', 'confirmada' => 'Confirmada', 'cancelada' => 'Cancelada', 'completada' => 'Completada', 'no_show' => 'No asistió'];
        $extra = [
            'confirmada' => '¡Tu cita está confirmada! Te esperamos en Centro Comercial Otay, Tijuana.',
            'cancelada'  => 'Tu cita fue cancelada. Si necesitas reagendar, contáctanos.',
            'completada' => 'Gracias por tu visita.',
            'no_show'    => 'Registramos que no pudiste asistir. Escríbenos para reagendar.',
        ];
        $bodyTxt = 'Hola ' . $name . ",\n\n" .
            'El estado de tu cita ' . $a['code'] . ' (' . ($tramites[$a['tramite']] ?? $a['tramite']) . ') cambió a: ' . ($sLabels[$status] ?? $status) . ".\n" .
            'Fecha: ' . $a['appt_date'] . ' a las ' . substr((string) $a['appt_time'], 0, 5) . ".\n" .
            (isset($extra[$status]) ? $extra[$status] . "\n" : '') .
            ($note !== '' ? "\nNota: " . $note . "\n" : '') .
            "\nGracias,\nOK.station — Centro Comercial Otay, Tijuana";
        (new Mailer($CONFIG['smtp'] ?? []))->send($email, 'Tu cita en OK.station — ' . $a['code'], $bodyTxt);
    }
} catch (Throwable $e) { /* el correo no debe afectar la respuesta */ }

respond(['ok' => true]);

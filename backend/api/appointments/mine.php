<?php
/** GET /backend/api/appointments/mine.php — citas del usuario autenticado. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
$st = db()->prepare(
    "SELECT code, tramite, passport_subtype, party_size, additional_services,
            DATE_FORMAT(appt_date,'%Y-%m-%d') AS date,
            TIME_FORMAT(appt_time,'%H:%i')    AS time,
            status, created_at
     FROM appointments
     WHERE user_id = ?
     ORDER BY appt_date DESC, appt_time DESC
     LIMIT 100"
);
$st->execute([(int) $user['id']]);
respond(['ok' => true, 'appointments' => $st->fetchAll()]);

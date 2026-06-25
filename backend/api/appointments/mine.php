<?php
/** GET /backend/api/appointments/mine.php — citas del usuario autenticado. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
/* guests_json (0011) y services_json (0013) pueden no existir aún (resiliente). */
$guestsCol   = table_has_column('appointments', 'guests_json')   ? 'guests_json,'   : '';
$servicesCol = table_has_column('appointments', 'services_json') ? 'services_json,' : '';
$st = db()->prepare(
    "SELECT code, tramite, passport_subtype, party_size, $guestsCol $servicesCol contact_name, contact_phone,
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

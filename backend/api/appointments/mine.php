<?php
/** GET /backend/api/appointments/mine.php — citas del usuario autenticado. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
/* Columnas que pueden no existir aún según la migración aplicada (resiliente):
   guests_json (0011), services_json (0013), pago (0016). */
$guestsCol   = table_has_column('appointments', 'guests_json')   ? 'guests_json,'   : '';
$servicesCol = table_has_column('appointments', 'services_json') ? 'services_json,' : '';
$actaCol     = table_has_column('appointments', 'acta_state')    ? 'acta_state,'    : '';
$payCols     = table_has_column('appointments', 'amount_total')
    ? 'id, amount_total, payment_status, payment_reference,'
    : '';
/* Cotización (migración 0023): distingue "por cotizar y aún sin anticipo" de "ya cotizada". */
$quoteCols   = table_has_column('appointments', 'needs_quote') ? 'needs_quote, quoted_at,' : '';
$st = db()->prepare(
    "SELECT $payCols $quoteCols code, tramite, passport_subtype, $actaCol party_size, $guestsCol $servicesCol contact_name, contact_phone,
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

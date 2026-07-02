<?php
/**
 * GET /backend/api/admin/appointments.php?status=&date=YYYY-MM-DD
 * Lista de citas para el panel (admin/empleado). Requiere permiso 'appointments.view'.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = require_permission('appointments.view');

$status = $_GET['status'] ?? null;
$date   = $_GET['date'] ?? null;
$valid  = ['pendiente', 'confirmada', 'cancelada', 'completada', 'no_show'];

/* guests_json (0011), services_json (0013) y la confirmación por correo (0017)
   pueden no existir aún (resiliente). */
$guestsCol   = table_has_column('appointments', 'guests_json')   ? 'a.guests_json,'   : '';
$servicesCol = table_has_column('appointments', 'services_json') ? 'a.services_json,' : '';
$confirmCol  = table_has_column('appointments', 'client_confirmed_at')
    ? "DATE_FORMAT(a.client_confirmed_at,'%Y-%m-%d %H:%i') AS client_confirmed_at," : '';
/* Estado del ANTICIPO (migración 0016): para que el panel muestre si el cliente
   pagó o no. Resiliente: si la migración no se aplicó, no se piden esas columnas. */
$payCols = table_has_column('appointments', 'amount_total')
    ? "a.amount_total, a.payment_status, a.payment_amount, DATE_FORMAT(a.payment_date,'%Y-%m-%d %H:%i') AS payment_date," : '';
$sql = "SELECT a.id, a.code, a.tramite, a.passport_subtype, a.party_size, $guestsCol $servicesCol $confirmCol $payCols
               DATE_FORMAT(a.appt_date,'%Y-%m-%d') AS date,
               TIME_FORMAT(a.appt_time,'%H:%i')    AS time,
               a.status, a.contact_name, a.contact_phone, a.contact_email,
               a.contact_pref, a.notes, a.staff_notes, a.user_id,
               u.full_name AS account_name
        FROM appointments a
        LEFT JOIN users u ON u.id = a.user_id";
$where = [];
$params = [];
if ($status && in_array($status, $valid, true))         { $where[] = 'a.status = ?';    $params[] = $status; }
if ($date && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { $where[] = 'a.appt_date = ?'; $params[] = $date; }
if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
$sql .= ' ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT 300';

$st = db()->prepare($sql);
$st->execute($params);
$appointments = $st->fetchAll();

/* Documentos adjuntos por cita (solo si la migración 0013 creó appointment_files). */
$ids = array_column($appointments, 'id');
if ($ids) {
    try {
        /* guest_index/guest_name (migración 0014) pueden no existir aún (resiliente). */
        $guestFileCols = table_has_column('appointment_files', 'guest_index')
            ? 'af.guest_index, af.guest_name,' : '';
        $in = implode(',', array_fill(0, count($ids), '?'));
        $fq = db()->prepare(
            "SELECT af.appointment_id, af.uploaded_file_id AS id, af.doc_key, af.doc_label,
                    $guestFileCols
                    uf.original_name, uf.mime_type, uf.size_bytes
               FROM appointment_files af
               JOIN uploaded_files uf ON uf.id = af.uploaded_file_id
              WHERE af.appointment_id IN ($in)
              ORDER BY af.id"
        );
        $fq->execute($ids);
        $byAppt = [];
        foreach ($fq->fetchAll() as $fr) {
            $aid = (int) $fr['appointment_id'];
            unset($fr['appointment_id']);
            $byAppt[$aid][] = $fr;
        }
        foreach ($appointments as &$ap) { $ap['files'] = $byAppt[(int) $ap['id']] ?? []; }
        unset($ap);
    } catch (Throwable $e) { /* tabla aún no existe: las citas van sin adjuntos */ }
}

log_activity((int) $user['id'], 'appointments.view', 'appointments', null, ['status' => $status, 'date' => $date]);

respond(['ok' => true, 'appointments' => $appointments, 'count' => count($appointments)]);

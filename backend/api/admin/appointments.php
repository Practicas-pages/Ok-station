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

$sql = "SELECT a.id, a.code, a.tramite,
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

log_activity((int) $user['id'], 'appointments.view', 'appointments', null, ['status' => $status, 'date' => $date]);

respond(['ok' => true, 'appointments' => $appointments, 'count' => count($appointments)]);

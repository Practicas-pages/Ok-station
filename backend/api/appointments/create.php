<?php
/**
 * POST /backend/api/appointments/create.php — reserva una cita EN EL SERVIDOR.
 * Público: no exige sesión, pero si llega un Bearer válido se asocia la cuenta.
 * SEGURIDAD: la disponibilidad (día y hora) se valida en el servidor; el
 * navegador no puede forzar una fecha/hora cerrada u ocupada.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Availability.php';
only_method('POST');

$b       = body();
$tramite = (string) ($b['tramite'] ?? '');
$date    = trim((string) ($b['date'] ?? ''));
$time    = trim((string) ($b['time'] ?? ''));
$name    = trim((string) ($b['name'] ?? ''));
$phone   = trim((string) ($b['phone'] ?? ''));
$email   = trim((string) ($b['email'] ?? ''));
$pref    = (string) ($b['contact_pref'] ?? '');
$notes   = trim((string) ($b['notes'] ?? ''));

$validTramite = ['pasaporte', 'visa', 'sentri', 'i94'];
$validPref    = ['whatsapp', 'llamada', 'correo'];

if (!in_array($tramite, $validTramite, true))      fail('Selecciona un trámite válido.');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))   fail('Fecha inválida.');
if (!preg_match('/^\d{1,2}:\d{2}$/', $time))       fail('Hora inválida.');
if (mb_strlen($name) < 2)                          fail('Ingresa tu nombre completo.');
if (strlen(preg_replace('/\D/', '', $phone)) < 10) fail('Ingresa un teléfono válido (10 dígitos).');
if ($email !== '' && !valid_email($email))         fail('Correo electrónico inválido.');
if (mb_strlen($notes) > 1000)                      fail('Las notas son demasiado largas.');
if ($pref !== '' && !in_array($pref, $validPref, true)) $pref = '';

/* Usuario opcional: si hay sesión válida, se asocia. */
$userId = null;
$hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (preg_match('/Bearer\s+(.+)/i', $hdr, $m)) {
    $claims = jwt_verify(trim($m[1]));
    if ($claims) $userId = (int) $claims['sub'];
}

/* Anti-spam por IP: máximo 8 solicitudes en 24 h. */
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$st = db()->prepare("SELECT COUNT(*) c FROM appointments WHERE created_ip = ? AND created_at >= (NOW() - INTERVAL 1 DAY)");
$st->execute([$ip]);
if ((int) $st->fetch()['c'] >= 8) {
    fail('Has alcanzado el límite de solicitudes por hoy. Escríbenos por WhatsApp.', 429);
}

/* VALIDACIÓN DE DISPONIBILIDAD EN EL SERVIDOR (día y hora). */
[$ok, $err] = Availability::canBook($date, $time);
if (!$ok) fail($err, 409);

$time   = Availability::normTime($time);
$cap    = Availability::config()['capacity'];
$pdo    = db();

$pdo->beginTransaction();
try {
    /* Re-verifica capacidad dentro de la transacción para evitar doble reserva del mismo horario. */
    $cnt = $pdo->prepare("SELECT COUNT(*) c FROM appointments WHERE appt_date=? AND appt_time=? AND status<>'cancelada' FOR UPDATE");
    $cnt->execute([$date, $time . ':00']);
    if ((int) $cnt->fetch()['c'] >= $cap) {
        $pdo->rollBack();
        fail('Ese horario acaba de ocuparse. Elige otro.', 409);
    }

    $pdo->prepare(
        'INSERT INTO appointments
           (code, user_id, tramite, appt_date, appt_time, contact_name, contact_phone, contact_email, contact_pref, notes, created_ip)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        'TMP', $userId, $tramite, $date, $time . ':00',
        $name, $phone, ($email !== '' ? $email : null), ($pref !== '' ? $pref : null),
        ($notes !== '' ? $notes : null), $ip,
    ]);
    $id   = (int) $pdo->lastInsertId();
    $code = 'CITA-' . date('Y') . '-' . str_pad((string) $id, 6, '0', STR_PAD_LEFT);
    $pdo->prepare('UPDATE appointments SET code=? WHERE id=?')->execute([$code, $id]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo registrar la cita. Inténtalo de nuevo.', 500);
}

log_activity($userId, 'appointment.create', 'appointments', $id, ['tramite' => $tramite, 'date' => $date, 'time' => $time]);
if ($userId) {
    db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
        ->execute([$userId, 'appointment', 'Cita registrada', 'Tu cita ' . $code . ' quedó registrada para el ' . $date . ' a las ' . $time . '.']);
}

respond([
    'ok' => true,
    'appointment' => [
        'code' => $code, 'tramite' => $tramite, 'date' => $date, 'time' => $time, 'status' => 'pendiente',
    ],
], 201);

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

$ip = $_SERVER['REMOTE_ADDR'] ?? '';

/* Límite POR USUARIO (nunca global): máximo 2 citas activas y de trámites distintos.
   - Usuarios diferentes no se afectan entre sí.
   - No se permite duplicar un trámite ya activo.
   Para invitados (sin sesión) la persona se identifica por su teléfono. */
$phoneDigits = preg_replace('/\D/', '', $phone);
if ($userId) {
    $q = db()->prepare("SELECT tramite FROM appointments WHERE user_id = ? AND status IN ('pendiente','confirmada')");
    $q->execute([$userId]);
} else {
    $q = db()->prepare(
        "SELECT tramite FROM appointments
         WHERE user_id IS NULL
           AND REPLACE(REPLACE(REPLACE(REPLACE(contact_phone,' ',''),'-',''),'(',''),')','') = ?
           AND status IN ('pendiente','confirmada')"
    );
    $q->execute([$phoneDigits]);
}
$activeTramites = array_column($q->fetchAll(), 'tramite');
if (in_array($tramite, $activeTramites, true)) {
    fail('Ya tienes una cita activa de este trámite. Solo puedes tener una cita por trámite a la vez.', 409);
}
if (count($activeTramites) >= 2) {
    fail('Ya tienes el máximo de 2 citas activas (de trámites distintos). Completa o cancela una para agendar otra.', 409);
}

/* VALIDACIÓN DE DISPONIBILIDAD EN EL SERVIDOR (día y hora). */
[$ok, $err] = Availability::canBook($date, $time);
if (!$ok) fail($err, 409);

$time = Availability::normTime($time);
$pdo  = db();

$pdo->beginTransaction();
try {
    /* Doble reserva: re-verifica dentro de la transacción que el horario siga libre.
       Cada fecha+hora es un único espacio y solo cuentan las citas activas. */
    $cnt = $pdo->prepare("SELECT COUNT(*) c FROM appointments WHERE appt_date=? AND appt_time=? AND status IN ('pendiente','confirmada') FOR UPDATE");
    $cnt->execute([$date, $time . ':00']);
    if ((int) $cnt->fetch()['c'] > 0) {
        $pdo->rollBack();
        fail('Ese horario acaba de ocuparse mientras llenabas el formulario. Elige otro, por favor.', 409);
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

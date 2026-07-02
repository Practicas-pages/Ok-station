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
require __DIR__ . '/../lib/Pricing.php';
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
$subtype = (string) ($b['passport_subtype'] ?? '');   // solo pasaporte: mexicano|americano
$party   = (int) ($b['party_size'] ?? 1);             // cantidad de personas (mín. 1)

/* Catálogo completo de servicios independientes (una cita = un servicio). */
$validTramite = ['pasaporte', 'visa', 'sentri', 'i94', 'curp', 'ine', 'licencia', 'apostille', 'medica'];
$validPref    = ['whatsapp', 'llamada', 'correo'];
$validSubtype = ['mexicano', 'americano'];

if (!in_array($tramite, $validTramite, true))      fail('Selecciona un servicio válido.');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))   fail('Fecha inválida.');
if (!preg_match('/^\d{1,2}:\d{2}$/', $time))       fail('Hora inválida.');
if (mb_strlen($name) < 2)                          fail('Ingresa tu nombre completo.');
if (strlen(preg_replace('/\D/', '', $phone)) < 10) fail('Ingresa un teléfono válido (10 dígitos).');
if ($email !== '' && !valid_email($email))         fail('Correo electrónico inválido.');
if (mb_strlen($notes) > 1000)                      fail('Las notas son demasiado largas.');
if ($pref !== '' && !in_array($pref, $validPref, true)) $pref = '';

/* Subtipo: aplica solo a pasaporte. El front nuevo lo exige en el modal; aquí
   lo validamos si llega, pero NO fallamos si falta (compatibilidad con clientes
   antiguos durante el despliegue por etapas). En otros servicios se ignora. */
if ($tramite === 'pasaporte') {
    if ($subtype !== '' && !in_array($subtype, $validSubtype, true)) fail('Tipo de pasaporte inválido.');
} else {
    $subtype = '';
}
/* Cantidad de personas: mínimo 1, tope razonable. */
if ($party < 1)  $party = 1;
if ($party > 20) fail('Para grupos de más de 20 personas, escríbenos por WhatsApp para coordinar.');

/* Datos por persona (requisitos): [{name, dob, doctype}]. Validación tolerante:
   se limpia y se recorta a la cantidad de personas. doctype solo para pasaporte/
   visa/sentri (primera | renov_con | renov_sin). No se exige (compatibilidad). */
$cleanGuests = [];
$guestsIn = $b['guests'] ?? [];
if (is_array($guestsIn)) {
    $validDoc = ['primera', 'renov_con', 'renov_sin'];
    foreach ($guestsIn as $g) {
        if (!is_array($g)) continue;
        $gn = trim((string) ($g['name'] ?? ''));
        if ($gn === '') continue;
        $gd = trim((string) ($g['dob'] ?? ''));
        if ($gd !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $gd)) $gd = '';
        $gt = (string) ($g['doctype'] ?? '');
        if (!in_array($gt, $validDoc, true)) $gt = '';
        /* Respuestas del cuestionario por trámite: clave alfanumérica, valor texto/bool. */
        $cleanAns = [];
        $ga = (isset($g['answers']) && is_array($g['answers'])) ? $g['answers'] : [];
        foreach ($ga as $ak => $av) {
            $ak = preg_replace('/[^a-z0-9_]/i', '', (string) $ak);
            if ($ak === '') continue;
            $cleanAns[$ak] = is_bool($av) ? $av : mb_substr((string) $av, 0, 500);
            if (count($cleanAns) >= 40) break;
        }
        $cleanGuests[] = ['name' => mb_substr($gn, 0, 120), 'dob' => $gd, 'doctype' => $gt, 'answers' => $cleanAns];
        if (count($cleanGuests) >= $party) break;
    }
}
$guestsJson = $cleanGuests ? json_encode($cleanGuests, JSON_UNESCAPED_UNICODE) : null;

/* Servicios adicionales (venta cruzada) que el cliente marcó: [{key, label}].
   Validación tolerante (no se exige; compatibilidad con clientes antiguos). */
$cleanServices = [];
$svcIn = $b['services'] ?? [];
if (is_array($svcIn)) {
    foreach ($svcIn as $s) {
        if (!is_array($s)) continue;
        $sk = preg_replace('/[^a-z0-9_]/i', '', (string) ($s['key'] ?? ''));
        if ($sk === '') continue;
        $sl = trim((string) ($s['label'] ?? $sk));
        $cleanServices[] = ['key' => $sk, 'label' => mb_substr($sl !== '' ? $sl : $sk, 0, 120)];
        if (count($cleanServices) >= 20) break;
    }
}
$servicesJson = $cleanServices ? json_encode($cleanServices, JSON_UNESCAPED_UNICODE) : null;

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
           AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(contact_phone,'+',''),' ',''),'-',''),'(',''),')','') = ?
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

/* VALIDACIÓN DE DISPONIBILIDAD EN EL SERVIDOR (día, hora y DURACIÓN según personas). */
[$ok, $err] = Availability::canBook($date, $time, $party);
if (!$ok) fail($err, 409);

$time = Availability::normTime($time);

/* Precio del anticipo (autoridad del servidor): precio del trámite × personas.
   quote=true → el trámite se cotiza (no cobra en línea). */
$pricing = Pricing::appointmentPricing($tramite, ($subtype !== '' ? $subtype : null), $party);

$pdo  = db();

$pdo->beginTransaction();
try {
    /* Doble reserva (consciente de duración): bloqueamos las citas activas del día y
       verificamos que TODOS los slots que ocupará esta cita (45 min × persona) sigan
       libres. Cada cita ocupa slotsNeeded(personas) horas consecutivas desde su inicio. */
    $lock = $pdo->prepare("SELECT TIME_FORMAT(appt_time,'%H:%i') t, party_size FROM appointments WHERE appt_date=? AND status IN ('pendiente','confirmada') FOR UPDATE");
    $lock->execute([$date]);
    $occ = [];
    foreach ($lock->fetchAll() as $r) {
        foreach (Availability::neededSlotTimes($r['t'], (int) ($r['party_size'] ?? 1)) as $hm) {
            $occ[$hm] = ($occ[$hm] ?? 0) + 1;
        }
    }
    $conflict = false;
    foreach (Availability::neededSlotTimes($time, $party) as $hm) {
        if (($occ[$hm] ?? 0) > 0) { $conflict = true; break; }
    }
    if ($conflict) {
        $pdo->rollBack();
        fail('Ese horario acaba de ocuparse mientras llenabas el formulario. Elige otro, por favor.', 409);
    }

    $pdo->prepare(
        'INSERT INTO appointments
           (code, user_id, tramite, passport_subtype, party_size, appt_date, appt_time, contact_name, contact_phone, contact_email, contact_pref, notes, created_ip)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        'TMP', $userId, $tramite, ($subtype !== '' ? $subtype : null), $party, $date, $time . ':00',
        $name, $phone, ($email !== '' ? $email : null), ($pref !== '' ? $pref : null),
        ($notes !== '' ? $notes : null), $ip,
    ]);
    $id   = (int) $pdo->lastInsertId();
    $code = 'CITA-' . date('Y') . '-' . str_pad((string) $id, 6, '0', STR_PAD_LEFT);
    $pdo->prepare('UPDATE appointments SET code=? WHERE id=?')->execute([$code, $id]);

    /* Datos por persona: solo si la migración 0011 ya creó la columna (resiliente). */
    if ($guestsJson !== null && table_has_column('appointments', 'guests_json')) {
        $pdo->prepare('UPDATE appointments SET guests_json=? WHERE id=?')->execute([$guestsJson, $id]);
    }
    /* Servicios adicionales: solo si la migración 0013 ya creó la columna (resiliente). */
    if ($servicesJson !== null && table_has_column('appointments', 'services_json')) {
        $pdo->prepare('UPDATE appointments SET services_json=? WHERE id=?')->execute([$servicesJson, $id]);
    }

    /* MONTO DEL ANTICIPO (autoridad del servidor): precio del trámite × personas.
       Solo si la migración 0016 ya creó la columna (resiliente). Trámite que se
       cotiza → amount_total queda NULL (no cobra en línea). */
    if (!$pricing['quote'] && table_has_column('appointments', 'amount_total')) {
        $pdo->prepare('UPDATE appointments SET amount_total=? WHERE id=?')->execute([$pricing['total'], $id]);
    }

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

/* Token de confirmación: el cliente confirma su cita desde el correo (enlace con
   token). Solo si la migración 0017 ya creó la columna (resiliente). */
$confirmToken = null;
if (table_has_column('appointments', 'confirm_token')) {
    try {
        require_once __DIR__ . '/../lib/Emails.php';
        $confirmToken = Emails::token();
        db()->prepare('UPDATE appointments SET confirm_token = ? WHERE id = ?')->execute([$confirmToken, $id]);
    } catch (Throwable $e) { $confirmToken = null; }
}

/* NO se envía correo de "confirma tu cita": el cliente NO tiene que confirmar
   nada desde el correo. El COMPROBANTE (con el PDF adjunto) se le envía desde
   appointments/send-receipt.php cuando el navegador genera el ticket. */

respond([
    'ok' => true,
    'appointment' => [
        'id' => $id, 'code' => $code, 'tramite' => $tramite,
        'passport_subtype' => ($subtype !== '' ? $subtype : null),
        'party_size' => $party,
        'guests' => $cleanGuests,
        'services' => $cleanServices,
        'date' => $date, 'time' => $time, 'status' => 'pendiente',
        /* Cobro del anticipo: 'payable' indica si tiene precio fijo (se puede pagar
           en línea). Si se cotiza, queda en false y el anticipo se coordina aparte.
           'requires_payment' → trámite (visa/pasaporte) que NO se confirma sin anticipo. */
        'amount_total'     => $pricing['quote'] ? null : $pricing['total'],
        'payable'          => !$pricing['quote'],
        'requires_payment' => Pricing::requiresPayment($tramite),
        'payment_status'   => 'pendiente',
        'logged_in'        => ($userId !== null),
    ],
], 201);

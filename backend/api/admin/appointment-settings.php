<?php
/**
 * GET  /backend/api/admin/appointment-settings.php  → config actual (requiere 'appointments.view').
 * POST /backend/api/admin/appointment-settings.php  → actualiza disponibilidad (requiere 'settings.manage').
 *   Body admitido: { weekly_hours:{"0":[..],..,"6":[..]}, capacity:int, max_advance_days:int, blackout_dates:[...] }
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Availability.php';
require __DIR__ . '/../lib/Pricing.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    require_permission('appointments.view');
    respond(['ok' => true, 'config' => Availability::config(), 'prices' => Pricing::apptPrices()]);
}

if ($method === 'POST') {
    $user = require_permission('settings.manage');
    $b    = body();
    $set  = db()->prepare('INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)');

    if (isset($b['weekly_hours']) && is_array($b['weekly_hours'])) {
        $weekly = [];
        for ($d = 0; $d <= 6; $d++) {
            $arr   = $b['weekly_hours'][(string) $d] ?? ($b['weekly_hours'][$d] ?? []);
            $clean = [];
            foreach ((array) $arr as $t) {
                if (preg_match('/^\d{2}:\d{2}$/', (string) $t)) $clean[] = (string) $t;
            }
            sort($clean);
            $weekly[(string) $d] = array_values(array_unique($clean));
        }
        $set->execute(['appt.weekly_hours', json_encode($weekly, JSON_UNESCAPED_UNICODE)]);
    }

    if (isset($b['capacity']))          $set->execute(['appt.capacity', (string) max(1, (int) $b['capacity'])]);
    if (isset($b['max_advance_days']))  $set->execute(['appt.max_advance_days', (string) max(1, (int) $b['max_advance_days'])]);

    if (isset($b['blackout_dates']) && is_array($b['blackout_dates'])) {
        $bo = [];
        foreach ($b['blackout_dates'] as $d) {
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $d)) $bo[] = (string) $d;
        }
        $set->execute(['appt.blackout_dates', json_encode(array_values(array_unique($bo)))]);
    }

    /* Precios de trámites (anticipo): clave alfanumérica → monto (MXN, IVA incluido).
       0 / vacío = el trámite se cotiza (sin cobro en línea). Requiere settings.manage. */
    if (isset($b['prices']) && is_array($b['prices'])) {
        $clean = [];
        foreach ($b['prices'] as $k => $v) {
            $k = preg_replace('/[^a-z0-9_]/i', '', (string) $k);
            if ($k === '' || !is_numeric($v)) continue;
            $amount = round((float) $v, 2);
            if ($amount > 0) $clean[$k] = $amount;   // solo precios positivos; lo demás se cotiza
            if (count($clean) >= 40) break;
        }
        $set->execute(['appt.prices', json_encode($clean, JSON_UNESCAPED_UNICODE)]);
    }

    log_activity((int) $user['id'], 'appointments.settings_updated', 'settings', null);
    respond(['ok' => true, 'config' => Availability::config(), 'prices' => Pricing::apptPrices()]);
}

fail('Método no permitido.', 405);

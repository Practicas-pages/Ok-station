<?php
/**
 * GET  /backend/api/admin/print-prices.php → precios de impresión vigentes + IVA.
 * POST /backend/api/admin/print-prices.php → guarda `print.prices` y/o `tax_rate`.
 * Ambos requieren el permiso 'settings.manage' (lo tienen administrador y directivo,
 * NO empleado). Espejo del patrón de appointment-settings.php.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Pricing.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    require_permission('settings.manage');
    respond(['ok' => true, 'prices' => Pricing::printPricesFlat(), 'tax_rate' => Pricing::taxRate()]);
}

if ($method === 'POST') {
    $user = require_permission('settings.manage');
    $b    = body();

    /* Confirmación por contraseña: cambiar precios es sensible. Se verifica contra
       el hash del usuario en sesión; sin contraseña válida no se guarda nada. */
    $pw = (string) ($b['password'] ?? '');
    if ($pw === '') fail('Ingresa tu contraseña para confirmar el cambio.', 422);
    $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $st->execute([(int) $user['id']]);
    $hash = $st->fetchColumn();
    if (!$hash || !password_verify($pw, (string) $hash)) fail('Contraseña incorrecta.', 401);

    $set  = db()->prepare('INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)');

    /* Solo se aceptan claves CONOCIDAS (las de PRINT_DEFAULTS) con montos numéricos ≥ 0.
       Cualquier otra clave o valor inválido se ignora: no se puede inyectar basura. */
    if (isset($b['prices']) && is_array($b['prices'])) {
        $defaults = Pricing::PRINT_DEFAULTS;
        $clean = [];
        foreach ($b['prices'] as $k => $v) {
            $k = preg_replace('/[^a-z0-9_]/i', '', (string) $k);
            if (!isset($defaults[$k]) || !is_numeric($v)) continue;
            $amount = round((float) $v, 2);
            if ($amount < 0) $amount = 0.0;
            $clean[$k] = $amount;
        }
        if ($clean) {
            // Mezcla con lo vigente para no perder claves no enviadas.
            $merged = array_merge(Pricing::printPricesFlat(), $clean);
            $set->execute(['print.prices', json_encode($merged, JSON_UNESCAPED_UNICODE)]);
        }
    }

    /* IVA: admite 0.08 o 8 (se normaliza a fracción). Entre 0 y 1. */
    if (isset($b['tax_rate']) && is_numeric($b['tax_rate'])) {
        $rate = (float) $b['tax_rate'];
        if ($rate > 1) $rate = $rate / 100.0;
        if ($rate < 0) $rate = 0.0;
        if ($rate > 1) $rate = 1.0;
        $set->execute(['tax_rate', (string) round($rate, 4)]);
    }

    log_activity((int) $user['id'], 'print.prices_updated', 'settings', null);
    respond(['ok' => true, 'prices' => Pricing::printPricesFlat(), 'tax_rate' => Pricing::taxRate()]);
}

fail('Método no permitido.', 405);

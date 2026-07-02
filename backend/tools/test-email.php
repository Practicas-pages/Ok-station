<?php
/**
 * Ok.station — Diagnóstico de correo (CLI). Corre EN EL SERVIDOR:
 *
 *     php backend/tools/test-email.php destino@correo.com
 *
 * Qué hace:
 *   1. Carga backend/api/config.php y revisa si el bloque 'brevo' existe y tiene
 *      API key (la causa típica de "no llegan los correos" es que config.php
 *      quedó viejo, sin ese bloque, y todo cae al SMTP de Gmail sin adjuntos).
 *   2. Envía un correo de prueba por el MISMO camino que usa el sitio (Mail::sendHtml),
 *      y también un intento directo por Brevo para ver el error EXACTO que devuelve
 *      su API (remitente no verificado, IP no autorizada, api-key inválida, etc.).
 *
 * Solo CLI: no se puede llamar desde el navegador (evita abuso).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

$to = isset($argv[1]) ? trim((string) $argv[1]) : '';
if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Uso: php backend/tools/test-email.php destino@correo.com\n");
    exit(1);
}

$CONFIG = require __DIR__ . '/../api/config.php';   // define $CONFIG global para Mail.php
require_once __DIR__ . '/../api/lib/Mail.php';

echo "== Diagnóstico de correo Ok.station ==\n\n";

/* 1) ¿Está el bloque brevo y la API key? */
$brevoCfg = $CONFIG['brevo'] ?? null;
if (!is_array($brevoCfg)) {
    echo "✗ config.php NO tiene el bloque 'brevo'. Se usará SMTP (Gmail) SIN adjuntos.\n";
    echo "  → Copia el bloque 'brevo' de config.example.php a config.php.\n\n";
    $brevoCfg = [];
}
$hasKey = trim((string) ($brevoCfg['api_key'] ?? '')) !== '';
echo "Bloque 'brevo' presente : " . (is_array($CONFIG['brevo'] ?? null) ? "sí" : "NO") . "\n";
echo "BREVO_API_KEY cargada   : " . ($hasKey ? "sí (…" . substr((string) $brevoCfg['api_key'], -4) . ")" : "NO") . "\n";
echo "Remitente (from)        : " . ($brevoCfg['from'] ?? '(vacío)') . "  «" . ($brevoCfg['from_name'] ?? '') . "»\n";
echo "  (este correo DEBE estar verificado en Brevo → Senders, Domains & IPs)\n\n";

/* 2) Intento DIRECTO por Brevo para ver el error real. */
if ($hasKey) {
    require_once __DIR__ . '/../api/lib/Brevo.php';
    $brevo = new Brevo($brevoCfg);
    echo "→ Enviando prueba directa por Brevo a $to …\n";
    $ok = $brevo->sendHtml(
        $to,
        'Prueba Ok.station ' . date('H:i:s'),
        '<p>Correo de <b>prueba</b> de Ok.station. Si lo recibes, Brevo funciona.</p>',
        'Correo de prueba de Ok.station.'
    );
    echo $ok ? "   ✓ Brevo aceptó el mensaje (HTTP 2xx).\n" : "   ✗ Brevo rechazó: " . $brevo->lastError . "\n";
    echo "\n";
}

/* 3) Camino real del sitio (Mail::sendHtml → Brevo o SMTP). */
echo "→ Enviando por el camino real del sitio (Mail::sendHtml) a $to …\n";
$sent = Mail::sendHtml(
    $to,
    'Prueba Ok.station (camino real) ' . date('H:i:s'),
    '<p>Prueba enviada por <b>Mail::sendHtml</b> (el mismo que usa el comprobante de cita).</p>',
    'Prueba camino real Ok.station.'
);
echo $sent ? "   ✓ Enviado (sent:true).\n" : "   ✗ Falló (sent:false). Revisa el error_log del sitio para el detalle.\n";

echo "\nListo. Revisa la bandeja (y SPAM) de $to, y el log de Brevo (Transactional → Logs).\n";

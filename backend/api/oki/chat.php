<?php
declare(strict_types=1);
/**
 * POST /backend/api/oki/chat.php — cerebro de OKi (chatbot con Claude).
 * --------------------------------------------------------------------
 * Recibe el historial de conversación y devuelve la respuesta de OKi.
 * La llave de Anthropic vive SOLO en el servidor (.env), nunca en el navegador.
 *
 * Cuerpo (JSON):
 *   { "messages": [ {"role":"user","content":"..."}, {"role":"assistant","content":"..."} ] }
 *   o, para un solo turno:  { "message": "hola" }
 *
 * Respuesta:  { "ok": true, "reply": "..." }
 * En cualquier falla (API caída, rehúso, timeout) responde con un mensaje
 * amable que deriva a WhatsApp — OKi nunca deja al cliente sin respuesta.
 */

require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/prompt.php';
only_method('POST');

/* WhatsApp de respaldo (coincide con el prompt). */
const OKI_WA      = 'https://wa.me/526647194117';
const OKI_WA_TEXT = 'Con gusto te sigo ayudando por WhatsApp: 664 719 4117 (' . OKI_WA . ').';

/* Respuesta de respaldo cuando algo falla del lado del servidor/IA. */
function oki_fallback(string $motivo = ''): void
{
    if ($motivo !== '' && ($GLOBALS['CONFIG']['dev_mode'] ?? false)) {
        error_log('[oki] fallback: ' . $motivo);
    }
    respond([
        'ok'       => true,
        'reply'    => 'Uy, justo ahora no pude procesar eso. ' . OKI_WA_TEXT,
        'fallback' => true,
    ]);
}

/* ── Límite de uso por IP (archivo, sin tocar la BD) ──
   Ventana corta anti-abuso + tope diario para acotar el costo de la API. */
function oki_rate_limit(string $ip): void
{
    $base = ($GLOBALS['CONFIG']['storage_path'] ?? (__DIR__ . '/../../storage')) . '/oki_rl';
    if (!is_dir($base)) @mkdir($base, 0770, true);
    if (!is_dir($base) || !is_writable($base)) return; // si no hay dónde escribir, no bloquea

    $file = $base . '/' . hash('sha256', $ip) . '.json';
    $now  = time();
    $data = ['min' => [], 'day_count' => 0, 'day' => date('Y-m-d', $now)];

    $fh = @fopen($file, 'c+');
    if (!$fh) return;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    if ($raw !== '' && ($j = json_decode($raw, true)) && is_array($j)) $data = $j + $data;

    // Reinicio del contador diario.
    if (($data['day'] ?? '') !== date('Y-m-d', $now)) {
        $data['day'] = date('Y-m-d', $now);
        $data['day_count'] = 0;
    }
    // Purga de la ventana de 60 s.
    $data['min'] = array_values(array_filter((array) ($data['min'] ?? []), fn($t) => $t > $now - 60));

    $PER_MIN = 15;    // mensajes por minuto por IP
    $PER_DAY = 200;   // tope diario por IP (protege el gasto de la API)
    $blocked = count($data['min']) >= $PER_MIN || (int) ($data['day_count'] ?? 0) >= $PER_DAY;

    if (!$blocked) {
        $data['min'][]      = $now;
        $data['day_count']  = (int) ($data['day_count'] ?? 0) + 1;
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data));
    flock($fh, LOCK_UN);
    fclose($fh);

    if ($blocked) {
        respond([
            'ok'    => true,
            'reply' => 'Vas muy rápido para mí 😅. Dame un momentito o escríbenos por WhatsApp: 664 719 4117.',
            'rate_limited' => true,
        ], 429);
    }
}

/* ── Normaliza y acota el historial que llega del navegador ── */
function oki_clean_messages(array $in): array
{
    $out = [];
    foreach ($in as $m) {
        if (!is_array($m)) continue;
        $role = ($m['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
        $txt  = trim((string) ($m['content'] ?? ''));
        if ($txt === '') continue;
        if (mb_strlen($txt) > 2000) $txt = mb_substr($txt, 0, 2000); // acota el costo por turno
        $out[] = ['role' => $role, 'content' => $txt];
    }
    // Nos quedamos con los últimos 12 turnos y garantizamos que arranque en 'user'.
    if (count($out) > 12) $out = array_slice($out, -12);
    while ($out && $out[0]['role'] !== 'user') array_shift($out);
    // El último turno debe ser del usuario (es a lo que OKi va a responder).
    while ($out && end($out)['role'] !== 'user') array_pop($out);
    return $out;
}

/* ── 1) Entrada ── */
$b = body();
$messages = [];
if (isset($b['messages']) && is_array($b['messages'])) {
    $messages = oki_clean_messages($b['messages']);
} elseif (isset($b['message'])) {
    $messages = oki_clean_messages([['role' => 'user', 'content' => (string) $b['message']]]);
}
if (!$messages) fail('Falta el mensaje.', 400);

/* ── 2) Límite de uso ── */
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$ip = trim(explode(',', $ip)[0]);
oki_rate_limit($ip);

/* ── 3) Configuración de Anthropic ── */
$cfg    = $GLOBALS['CONFIG']['anthropic'] ?? [];
$apiKey = (string) ($cfg['api_key'] ?? '');
$model  = (string) ($cfg['model'] ?? 'claude-opus-4-8');
if ($apiKey === '') oki_fallback('ANTHROPIC_API_KEY vacío');

/* ── 4) Llamada a la API de Claude (Messages API, sin streaming) ── */
$payload = [
    'model'      => $model,
    'max_tokens' => 700,                 // respuestas cortas de servicio al cliente
    'system'     => oki_system_prompt(), // el cerebro de OKi (prompt.php)
    'messages'   => $messages,
];

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_HTTPHEADER     => [
        'content-type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ],
    CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
]);
$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$cerr = curl_error($ch);
curl_close($ch);

if ($res === false)      oki_fallback('cURL: ' . $cerr);
if ($code < 200 || $code >= 300) oki_fallback('HTTP ' . $code . ': ' . substr((string) $res, 0, 300));

$data = json_decode((string) $res, true);
if (!is_array($data)) oki_fallback('respuesta no-JSON');

/* Rehúso de seguridad del modelo: derivar a WhatsApp, no mostrar vacío. */
if (($data['stop_reason'] ?? '') === 'refusal') {
    respond([
        'ok'      => true,
        'reply'   => 'Eso mejor lo vemos directo con una persona. ' . OKI_WA_TEXT,
        'refusal' => true,
    ]);
}

/* Extrae el texto de los bloques de contenido. */
$reply = '';
foreach (($data['content'] ?? []) as $block) {
    if (($block['type'] ?? '') === 'text') $reply .= $block['text'];
}
$reply = trim($reply);
if ($reply === '') oki_fallback('respuesta vacía');

respond(['ok' => true, 'reply' => $reply]);

<?php
declare(strict_types=1);
/**
 * POST /backend/api/oki/chat.php — cerebro híbrido de OKi (reglas + IA).
 * ------------------------------------------------------------------------------
 * Recibe el mensaje del usuario y responde con los datos reales del negocio
 * (ver backend/api/oki/brain.php). Si no reconoce la intención o la pregunta
 * necesita una explicación, usa la IA configurada en el servidor.
 *
 * Cuerpo (JSON):
 *   { "messages": [ {"role":"user","content":"..."}, ... ] }   // se usa el último del usuario
 *   o, para un solo turno:  { "message": "hola" }
 *
 * Respuesta:  { "ok": true, "reply": "..." }
 */

require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/brain.php';
require_once __DIR__ . '/prompt.php';
only_method('POST');

/* ¿La pregunta pide OPINIÓN/CONSEJO/COMPATIBILIDAD? Entonces mejor que la conteste la IA
   (respuesta útil y a la medida) y no una regla enlatada. Recibe el texto ya normalizado
   (sin acentos, minúsculas). La navegación se resuelve ANTES, así que esto no rompe los
   "llévame a…". */
function oki_is_advice(string $t): bool
{
    // Límite SOLO al inicio (no al final) para que "recomiendas", "conviene", etc. peguen con
    // sus sufijos. Las frases son distintivas, así que no hace falta el límite final.
    return (bool) preg_match(
        '/\b(?:me conviene|conviene mas|recomiend|cual es mejor|cual me convien|sirve para|'
        . 'funciona (?:con|para|en)|es compatible|compatible con|vale la pena|diferencia entre|'
        . 'que opinas|opinas|crees que|es bueno|me sirve|deberia (?:usar|comprar|elegir)|'
        . 'cual elijo|cual escojo|cual compro|que tan bueno|ayuda(?:ra|ria)? (?:para|con)|'
        . 'mejor opcion|como organiz|como archiv|como elegir|que necesito para|'
        . 'no se que|ayudame a elegir|orientame|no se (?:me )?pierdan|'
        . 'quiero (?:guardar|ordenar|organizar|archivar)|algo para (?:guardar|ordenar|'
        . 'organizar|archivar|proteger|clasificar))/u',
        $t
    );
}

/**
 * Las reglas del negocio son excelentes para precios, horarios y navegación, pero no
 * deben ganar preguntas educativas como "¿qué es un tóner?". Esas preguntas pasan a
 * la IA para recibir una explicación real en lugar de una respuesta comercial enlatada.
 */
function oki_needs_explanation(string $t): bool
{
    return (bool) preg_match(
        '/(?:^|\b)(?:que es|que son|que significa|como funciona|como funcionan|'
        . 'para que sirve|para que sirven|explicame|puedes explicar|cual es la diferencia|'
        . 'por que|porque se|como se hace|como puedo aprender)(?:\b|$)/u',
        $t
    );
}

/* ── Límite de uso por IP (archivo, sin tocar la BD) — anti-spam ── */
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

    if (($data['day'] ?? '') !== date('Y-m-d', $now)) {
        $data['day'] = date('Y-m-d', $now);
        $data['day_count'] = 0;
    }
    $data['min'] = array_values(array_filter((array) ($data['min'] ?? []), fn($t) => $t > $now - 60));

    $PER_MIN = 30;    // mensajes por minuto por IP
    $PER_DAY = 600;   // tope diario por IP
    $blocked = count($data['min']) >= $PER_MIN || (int) ($data['day_count'] ?? 0) >= $PER_DAY;

    if (!$blocked) {
        $data['min'][]     = $now;
        $data['day_count'] = (int) ($data['day_count'] ?? 0) + 1;
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

/* ── 1) Entrada: sacar el último mensaje del usuario ── */
$b = body();
$text = '';
if (isset($b['messages']) && is_array($b['messages'])) {
    for ($i = count($b['messages']) - 1; $i >= 0; $i--) {
        $m = $b['messages'][$i];
        if (is_array($m) && ($m['role'] ?? '') !== 'assistant') {
            $text = trim((string) ($m['content'] ?? ''));
            if ($text !== '') break;
        }
    }
} elseif (isset($b['message'])) {
    $text = trim((string) $b['message']);
}
if ($text === '') fail('Falta el mensaje.', 400);
if (mb_strlen($text) > 2000) $text = mb_substr($text, 0, 2000);

/* Último mensaje de OKi (da contexto a flujos como el acta por estado). */
$prev = '';
if (isset($b['messages']) && is_array($b['messages'])) {
    for ($i = count($b['messages']) - 1; $i >= 0; $i--) {
        $m = $b['messages'][$i];
        if (is_array($m) && ($m['role'] ?? '') === 'assistant') {
            $prev = trim((string) ($m['content'] ?? ''));
            if ($prev !== '') break;
        }
    }
}

/* ── 2) Límite de uso ── */
/* Detrás de Cloudflare + real_ip (Paso A de deploy/CLOUDFLARE.md), la IP verdadera
   llega en REMOTE_ADDR. X-Forwarded-For es FALSIFICABLE por el cliente (Cloudflare le
   ANEXA la IP real, pero el primer valor lo pone quien llama), así que ya no se lee:
   si no, un atacante mandaría un XFF distinto en cada request y se saltaría el límite. */
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
oki_rate_limit($ip);

/* ── 3) Saludo ── */
if (preg_match('/^(?:hola|buenas|buenos dias|buenas tardes|buenas noches|oki)[!. ]*$/u', oki_norm($text))) {
    respond([
        'ok'    => true,
        'reply' => '¡Hola! 👋 Soy OKi 🚀 Puedo responder tus preguntas y, cuando necesites '
                 . 'papelería, oficina o escolares, también recomendarte productos y ayudarte '
                 . 'con tu compra. ¿Qué quieres saber?',
    ]);
}

/* ── 4) ¿Navegación directa? (solo llegará aquí un destino del dominio permitido) ── */
$nav = oki_navigate(oki_norm($text));
if ($nav !== null) {
    respond(['ok' => true, 'reply' => $nav['reply'], 'go' => $nav['go']]);
}

/* ── 5) Cerebro por reglas ── */
$reply = oki_brain_reply($text, $prev);

/* Las preguntas de consejo o explicación necesitan razonamiento, aunque alguna palabra
   también coincida con una respuesta comercial del cerebro por reglas. La respuesta de
   reglas NO se tira: si la IA no puede contestar (sin llave, sin cuota, caída), el dato
   comercial exacto que sí teníamos es mejor respuesta que "no pude generar nada". */
$replyReglas = null;
if ($reply !== null
    && (oki_is_advice(oki_norm($text)) || oki_needs_explanation(oki_norm($text)))) {
    $replyReglas = $reply;
    $reply = null;
}

/* ── 6) Respaldo con IA GRATIS (Gemini) — preguntas generales o no reconocidas ──
   Mantiene la navegación y los datos del negocio en reglas (rápido y determinista);
   Gemini solo atiende el "resto", así el consumo cabe en el tier gratuito. Si la
   llave no está o la API falla, cae al respaldo de WhatsApp de abajo. */
if ($reply === null) {
    require_once __DIR__ . '/../lib/Gemini.php';
}
if ($reply === null && Gemini::available()) {
    /* Estrategia de AHORRO de cuota (tier gratis):
       a) CACHÉ: preguntas frecuentes idénticas se responden sin gastar API. Solo
          para preguntas "sueltas" (sin conversación previa), para no servir una
          respuesta fuera de contexto en un chat de varios turnos.
       b) PRESUPUESTO: topes global/min, global/día y por IP/día. Si se alcanzan,
          NO se llama a Gemini y OKi cae a su respaldo de WhatsApp de abajo. */
    $cacheable = ($prev === '');                 // sin turno previo de OKi = pregunta suelta
    $qkey = 'v4-asistente-general|' . oki_norm($text);

    if ($cacheable && ($hit = Gemini::cacheGet($qkey)) !== null) {
        respond(['ok' => true, 'reply' => $hit, 'source' => 'gemini-cache']);
    }

    if (Gemini::withinBudget($ip)) {
        $history = (isset($b['messages']) && is_array($b['messages'])) ? $b['messages'] : [['role' => 'user', 'content' => $text]];
        /* Se le pasa el mensaje para que el prompt incluya los productos del catálogo que
           coinciden con lo que preguntó: así OKi contesta con el precio y la existencia
           REALES en vez de derivar a WhatsApp. */
        $sys = function_exists('oki_system_prompt') ? oki_system_prompt($text) : 'Eres OKi, el asistente astronauta de Ok.station (Tijuana). Responde breve, en español de México. Si no sabes algo con certeza, deriva a WhatsApp 664 719 4117.';
        $ai = Gemini::reply($text, $history, $sys);
        if ($ai !== null && trim($ai) !== '') {
            if ($cacheable) Gemini::cacheSet($qkey, $ai);
            respond(['ok' => true, 'reply' => $ai, 'source' => 'gemini']);
        }
    }
    /* Sin cuota o Gemini no respondió → cae al respaldo de WhatsApp de abajo. */
}

/* ── 7) Respaldo si la IA no está configurada, no tiene cuota o no respondió ── */
if ($reply === null && $replyReglas !== null) {
    /* La IA no pudo, pero el cerebro por reglas SÍ tenía una respuesta para esta
       pregunta (se apartó en el paso 5 esperando algo mejor). Se entrega esa. */
    respond(['ok' => true, 'reply' => $replyReglas, 'source' => 'reglas-respaldo']);
}
if ($reply === null) {
    respond([
        'ok'       => true,
        'reply'    => 'No pude generar una respuesta confiable en este momento. Intenta formular '
                    . 'la pregunta de otra manera; si buscas un producto, también puedo ayudarte '
                    . 'por nombre, marca o uso.',
        'fallback' => true,
    ]);
}

respond(['ok' => true, 'reply' => $reply]);

<?php
declare(strict_types=1);
/**
 * POST /backend/api/oki/chat.php — cerebro de OKi (por REGLAS, sin API ni costo).
 * ------------------------------------------------------------------------------
 * Recibe el mensaje del usuario y responde con los datos reales del negocio
 * (ver backend/api/oki/brain.php). Si no reconoce la intención, deriva a
 * WhatsApp — regla de oro: OKi no inventa.
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
 * Guardia de dominio: OKi ya no es el asistente general de todos los servicios.
 * Atiende exclusivamente papelería/oficina/escolares y el flujo de compra.
 * La comprobación contra la BD permite reconocer marcas y nombres reales sin mantener
 * una lista manual imposible de actualizar junto con los syncs de Exel.
 */
function oki_is_stationery_scope(string $text, string $previousUser = ''): bool
{
    $t = oki_norm($text);
    if ($t === '') return false;

    /* Aunque aparezca "tienda" o "precio", estos temas conocidos quedan fuera. */
    if (preg_match('/\b(?:pasaporte|visa|sentri|global entry|i-?94|curp|acta|ine|licencia|'
        . 'tramite|cita|recarga|pago de servicios?|cfe|recibo de luz|recibo de agua|'
        . 'fotografia|foto para|rfc|imss|nss|seguro social)\b/u', $t)) {
        return false;
    }

    /* Saludos y cortesía sí, siempre que no vengan acompañados de otra pregunta. */
    if (preg_match('/^(?:hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|'
        . 'muchas gracias|adios|hasta luego|ok|oki|perfecto)[!. ]*$/u', $t)) {
        return true;
    }

    /* Lenguaje propio del dominio, incluidos usos que no necesariamente son un SKU. */
    if (preg_match('/\b(?:papeleria|oficina|escuela|escolar(?:es)?|preescolar|primaria|'
        . 'secundaria|preparatoria|universidad|articulos? de oficina|'
        . 'material(?:es)? escolar(?:es)?|utiles escolares|cuaderno|libreta|agenda|bitacora|'
        . 'folder|carpeta|archivador|archivo|papel|hojas?|notas? adhesivas?|post-?it|'
        . 'cartulina|pluma|boligrafo|lapiz|lapices|marcador|marcatextos|crayon|colores|'
        . 'borrador|goma|sacapuntas|corrector|pegamento|adhesivo|cinta|tijera|regla|compas|'
        . 'mica|acetato|foamy|pincel|pintura|acuarela|tempera|estuche|mochila|'
        . 'engrapadora|grapas|perforadora|clip|sujetadocumentos|sobre|etiqueta|calculadora|'
        . 'tinta|toner|cartucho|impresora|escritorio|organizar documentos|archivar documentos)\b/u', $t)) {
        return true;
    }

    /* Quien no conoce el nombre del artículo suele describir el resultado que busca. */
    if (preg_match('/\b(?:guardar|ordenar|organizar|archivar|proteger|clasificar|'
        . 'que no se (?:me )?pierdan)\b.*\b(?:papeles?|documentos?|recibos?|facturas?|'
        . 'apuntes?|tareas?)\b/u', $t)
        || preg_match('/\b(?:algo|material|producto)\b.*\b(?:escribir|apuntar|dibujar|'
            . 'colorear|pegar|recortar|medir|archivar|organizar)\b/u', $t)) {
        return true;
    }

    /* Acciones y dudas del e-commerce que tienen sentido sin repetir "papelería". */
    if (preg_match('/\b(?:carrito|catalogo|producto|productos|categoria|categorias|oferta|'
        . 'ofertas|existencia|stock|favorito|favoritos|deseado|deseados|pedido|pedidos|'
        . 'tienda en linea|mercado pago)\b/u', $t)
        || preg_match('/^(?:como pago|puedo pagar|formas? de pago|metodos? de pago|'
            . 'cuanto llevo|que llevo|mi total|envio|entrega|recoger|recoleccion|'
            . 'que me recomiendas|recomiendame algo|no se que necesito|no se que comprar|'
            . 'ayudame a elegir|orientame|no se|ninguna|elige tu|tu dime)$/u', $t)) {
        return true;
    }

    /* Marca, SKU o nombre vivo del catálogo (p. ej. "¿tienes BIC?"). */
    try {
        require_once __DIR__ . '/../shop/_synonyms.php';
        $terms = oki_terminos_de_busqueda($text);
        if ($terms !== '' && oki_buscar_productos($terms)) return true;
    } catch (Throwable $e) {
        /* La BD no disponible no debe abrir el dominio; continúa con la regla estricta. */
    }

    /* Seguimiento breve de una conversación que YA era de papelería. */
    if ($previousUser !== ''
        && preg_match('/^(?:y |para mi|es para|ese|esa|esos|esas|el primero|el segundo|la primera|la segunda|'
            . 'cual|cuanto|sirve|funciona|agregalo|ponlo|quit(a|alo)|me conviene)/u', $t)
        && oki_is_stationery_scope($previousUser, '')) {
        return true;
    }
    return false;
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
$previousUser = '';
if (isset($b['messages']) && is_array($b['messages'])) {
    $lastUserSeen = false;
    for ($i = count($b['messages']) - 1; $i >= 0; $i--) {
        $m = $b['messages'][$i];
        if (is_array($m) && ($m['role'] ?? '') === 'assistant') {
            if ($prev === '') $prev = trim((string) ($m['content'] ?? ''));
        } elseif (is_array($m) && ($m['role'] ?? '') !== 'assistant') {
            if (!$lastUserSeen) $lastUserSeen = true;
            else {
                $previousUser = trim((string) ($m['content'] ?? ''));
                break;
            }
        }
    }
}

/* ── 2) Límite de uso ── */
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$ip = trim(explode(',', $ip)[0]);
oki_rate_limit($ip);

/* ── 3) Alcance estricto: papelería, oficina, escolares y su compra ── */
if (!oki_is_stationery_scope($text, $previousUser)) {
    respond([
        'ok'       => true,
        'reply'    => 'Solo puedo ayudarte con papelería, artículos de oficina y escolares, '
                    . 'y con tu compra en la tienda. Dime qué material buscas y con gusto te ayudo 🚀',
        'restricted' => true,
    ]);
}

/* La regla histórica de saludo anunciaba trámites y otros servicios. Se responde aquí
   para que incluso el primer mensaje deje claro el nuevo alcance especializado. */
if (preg_match('/^(?:hola|buenas|buenos dias|buenas tardes|buenas noches|oki)[!. ]*$/u', oki_norm($text))) {
    respond([
        'ok'    => true,
        'reply' => '¡Hola! 👋 Soy OKi 🚀 Tu especialista en papelería, artículos de oficina '
                 . 'y escolares. Puedo recomendarte productos y ayudarte con tu compra. '
                 . '¿Qué material necesitas?',
    ]);
}

/* ── 4) ¿Navegación directa? (solo llegará aquí un destino del dominio permitido) ── */
$nav = oki_navigate(oki_norm($text));
if ($nav !== null) {
    respond(['ok' => true, 'reply' => $nav['reply'], 'go' => $nav['go']]);
}

/* ── 5) Cerebro por reglas ── */
$reply = oki_brain_reply($text, $prev);

/* Si la pregunta es de CONSEJO/opinión (compatibilidad, recomendación, "¿me conviene…?"),
   deja que la IA la conteste de verdad en vez de una regla enlatada. La navegación (paso 3)
   ya se resolvió, así que esto no rompe los "llévame a…". */
if ($reply !== null && oki_is_advice(oki_norm($text))) $reply = null;

/* ── 6) Respaldo con IA GRATIS (Gemini) — solo si las reglas no reconocieron ──
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
    $qkey = 'v3-guia-papeleria|' . oki_norm($text);

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

/* ── 7) Respaldo dentro del mismo alcance (no deriva a otros servicios) ── */
if ($reply === null) {
    respond([
        'ok'       => true,
        'reply'    => 'No encontré una respuesta suficientemente precisa. Puedo ayudarte a elegir '
                    . 'otro artículo de papelería o buscarlo por nombre, marca o uso.',
        'fallback' => true,
    ]);
}

respond(['ok' => true, 'reply' => $reply]);

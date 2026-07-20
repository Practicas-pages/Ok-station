<?php
/**
 * Cerebro IA GRATIS de OKi — Google Gemini (AI Studio) vía REST + cURL.
 * -----------------------------------------------------------------------------
 * SIN dependencias ni SDK (igual que el resto del backend). La llave es SECRETO
 * DE SERVIDOR: vive solo en backend/.env (GEMINI_API_KEY), nunca en el navegador.
 *
 * Se usa como RESPALDO: OKi resuelve navegación y datos del negocio con su cerebro
 * por reglas (rápido, gratis, determinista); solo cuando NO reconoce la pregunta
 * llama a Gemini para dar una respuesta natural. Así el consumo es bajo y cabe en
 * el tier gratuito. Si la llave está vacía o la API falla, devuelve null y OKi cae
 * a su respaldo de WhatsApp (nunca rompe el chat).
 *
 * Requiere config.php ($CONFIG['gemini']).
 */
final class Gemini
{
    /** ¿Hay llave configurada? */
    public static function available(): bool
    {
        global $CONFIG;
        return trim((string) ($CONFIG['gemini']['api_key'] ?? '')) !== '';
    }

    private static function model(): string
    {
        global $CONFIG;
        $m = trim((string) ($CONFIG['gemini']['model'] ?? 'gemini-flash-lite-latest'));
        return $m !== '' ? $m : 'gemini-flash-lite-latest';
    }

    /* ── Presupuesto de uso (protege el tier GRATUITO de Gemini) ──────────────
       Topes conservadores, por DEBAJO de los límites del tier gratis. Si se
       alcanzan, OKi cae a su respaldo de reglas/WhatsApp (nunca falla). Ajusta
       estas constantes si tu cuota es distinta. */
    const MAX_PER_MIN    = 10;     // llamadas GLOBALES por minuto (bajo el RPM gratis)
    const MAX_PER_DAY    = 800;    // llamadas GLOBALES por día (bajo el RPD gratis, con margen)
    const MAX_PER_IP_DAY = 25;     // por usuario/IP al día (que uno solo no agote la cuota)
    const CACHE_TTL      = 43200;  // 12 h de caché para preguntas repetidas

    /** Carpeta de estado (contadores y caché). Best-effort. */
    private static function stateDir(): string
    {
        global $CONFIG;
        $d = ($CONFIG['storage_path'] ?? (__DIR__ . '/../../storage')) . '/oki_gemini';
        if (!is_dir($d)) @mkdir($d, 0770, true);
        return $d;
    }

    /**
     * ¿Podemos gastar UNA llamada a Gemini ahora? Reserva el cupo si sí.
     * Combina 3 topes: global/min, global/día y por IP/día. Si no hay dónde
     * contar (storage no escribible), NO bloquea (deja pasar).
     */
    public static function withinBudget(string $ip): bool
    {
        $dir = self::stateDir();
        if (!is_dir($dir) || !is_writable($dir)) return true;
        $file = $dir . '/budget.json';
        $now  = time();
        $today = date('Y-m-d', $now);

        $fh = @fopen($file, 'c+');
        if (!$fh) return true;
        flock($fh, LOCK_EX);
        $raw = stream_get_contents($fh);
        $d = ['day' => $today, 'day_count' => 0, 'min' => [], 'ip' => []];
        if ($raw !== '' && ($j = json_decode($raw, true)) && is_array($j)) $d = $j + $d;

        if (($d['day'] ?? '') !== $today) { $d['day'] = $today; $d['day_count'] = 0; $d['ip'] = []; }
        $d['min'] = array_values(array_filter((array) ($d['min'] ?? []), fn($t) => $t > $now - 60));

        $iphash  = hash('sha256', $ip);
        $ipCount = (int) (($d['ip'][$iphash] ?? 0));
        $allow = count($d['min']) < self::MAX_PER_MIN
              && (int) ($d['day_count'] ?? 0) < self::MAX_PER_DAY
              && $ipCount < self::MAX_PER_IP_DAY;

        if ($allow) {
            $d['min'][] = $now;
            $d['day_count'] = (int) ($d['day_count'] ?? 0) + 1;
            $d['ip'][$iphash] = $ipCount + 1;
        }
        ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($d));
        flock($fh, LOCK_UN); fclose($fh);
        return $allow;
    }

    /** Respuesta cacheada para una pregunta (o null). NO consume presupuesto. */
    public static function cacheGet(string $key): ?string
    {
        $f = self::stateDir() . '/cache/' . hash('sha256', $key) . '.json';
        if (!is_file($f)) return null;
        $j = json_decode((string) @file_get_contents($f), true);
        if (!is_array($j) || (int) ($j['exp'] ?? 0) < time()) { @unlink($f); return null; }
        $t = (string) ($j['t'] ?? '');
        return $t !== '' ? $t : null;
    }

    /** Guarda una respuesta en caché (para preguntas repetidas). Best-effort. */
    public static function cacheSet(string $key, string $val): void
    {
        $dir = self::stateDir() . '/cache';
        if (!is_dir($dir)) @mkdir($dir, 0770, true);
        if (!is_dir($dir) || !is_writable($dir)) return;
        @file_put_contents($dir . '/' . hash('sha256', $key) . '.json',
            json_encode(['t' => $val, 'exp' => time() + self::CACHE_TTL]));
    }

    /**
     * Genera una respuesta de OKi con Gemini.
     * @param string $userText        último mensaje del usuario
     * @param array  $history         turnos previos [{role:'user'|'assistant', content:'...'}]
     * @param string $systemPrompt    instrucción de sistema (personalidad + base de conocimiento)
     * @return string|null            texto de la respuesta, o null si no se pudo
     */
    public static function reply(string $userText, array $history, string $systemPrompt): ?string
    {
        global $CONFIG;
        $key = trim((string) ($CONFIG['gemini']['api_key'] ?? ''));
        if ($key === '' || trim($userText) === '') return null;

        // Historial → formato Gemini (assistant se llama 'model'). Solo los últimos turnos.
        $contents = [];
        $hist = array_slice($history, -8);
        foreach ($hist as $m) {
            if (!is_array($m)) continue;
            $role = (($m['role'] ?? '') === 'assistant') ? 'model' : 'user';
            $txt  = trim((string) ($m['content'] ?? ''));
            if ($txt === '') continue;
            $contents[] = ['role' => $role, 'parts' => [['text' => mb_substr($txt, 0, 2000)]]];
        }
        // Asegura que el turno actual del usuario sea el último.
        $lastIsUser = $contents && end($contents)['role'] === 'user'
            && end($contents)['parts'][0]['text'] === $userText;
        if (!$lastIsUser) {
            $contents[] = ['role' => 'user', 'parts' => [['text' => mb_substr($userText, 0, 2000)]]];
        }

        $payload = [
            'systemInstruction' => ['parts' => [['text' => $systemPrompt]]],
            'contents'          => $contents,
            'generationConfig'  => [
                'temperature'     => 0.7,
                'maxOutputTokens' => 500,
                'topP'            => 0.95,
            ],
            // Umbrales laxos: es un asistente de tienda, no queremos falsos bloqueos.
            'safetySettings' => [
                ['category' => 'HARM_CATEGORY_HARASSMENT',        'threshold' => 'BLOCK_ONLY_HIGH'],
                ['category' => 'HARM_CATEGORY_HATE_SPEECH',       'threshold' => 'BLOCK_ONLY_HIGH'],
                ['category' => 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'threshold' => 'BLOCK_ONLY_HIGH'],
                ['category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_ONLY_HIGH'],
            ],
        ];

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
             . rawurlencode(self::model()) . ':generateContent?key=' . rawurlencode($key);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 8,
        ]);
        $raw  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($raw === false || $code < 200 || $code >= 300) {
            error_log('[oki.gemini] HTTP ' . $code . ' ' . $err . ' ' . substr((string) $raw, 0, 300));
            return null;
        }
        $j = json_decode((string) $raw, true);
        if (!is_array($j)) return null;

        // Bloqueo por seguridad o sin candidatos → null (cae al respaldo).
        if (isset($j['promptFeedback']['blockReason'])) return null;
        $parts = $j['candidates'][0]['content']['parts'] ?? null;
        if (!is_array($parts)) return null;

        $out = '';
        foreach ($parts as $p) { $out .= (string) ($p['text'] ?? ''); }
        $out = trim($out);
        return $out !== '' ? $out : null;
    }
}

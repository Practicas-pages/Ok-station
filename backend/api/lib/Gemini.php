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
        $m = trim((string) ($CONFIG['gemini']['model'] ?? 'gemini-2.0-flash'));
        return $m !== '' ? $m : 'gemini-2.0-flash';
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

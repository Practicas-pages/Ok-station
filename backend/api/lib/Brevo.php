<?php
/**
 * Brevo (ex-Sendinblue) — correo transaccional vía API HTTP v3.
 * Sin dependencias (cURL). A diferencia del SMTP de lib/Mailer.php, ESTE SÍ
 * permite ADJUNTAR archivos (el comprobante PDF que se genera en la página).
 *
 * Endpoint: POST https://api.brevo.com/v3/smtp/email   (header: api-key)
 * Doc: https://developers.brevo.com/reference/sendtransacemail
 *
 * El remitente (from) DEBE estar verificado en Brevo (Senders, Domains & IPs),
 * o Brevo rechaza el envío.
 */
final class Brevo
{
    private $apiKey;
    private $fromEmail;
    private $fromName;

    public function __construct(array $cfg)
    {
        $this->apiKey    = (string) ($cfg['api_key'] ?? '');
        $this->fromEmail = (string) ($cfg['from'] ?? 'no-reply@okstation.mx');
        $this->fromName  = (string) ($cfg['from_name'] ?? 'Ok.station');
    }

    /** ¿Hay API key? (si no, el llamador cae al SMTP de lib/Mailer.php). */
    public function configured(): bool { return $this->apiKey !== ''; }

    /**
     * Envía un correo HTML (con alternativa de texto y adjuntos opcionales).
     * @param array $attachments  [ ['name' => 'comprobante.pdf', 'content' => '<base64 puro>'], ... ]
     * @return bool  true si Brevo aceptó el mensaje (HTTP 2xx).
     */
    public function sendHtml(string $to, string $subject, string $html, string $textAlt = '', array $attachments = []): bool
    {
        if ($this->apiKey === '' || $to === '') return false;

        $payload = [
            'sender'      => ['email' => $this->fromEmail, 'name' => $this->fromName],
            'to'          => [['email' => $to]],
            'subject'     => $subject,
            'htmlContent' => $html,
        ];
        if ($textAlt !== '') {
            $payload['textContent'] = $textAlt;
        }

        $att = [];
        foreach ($attachments as $a) {
            $name    = (string) ($a['name'] ?? '');
            $content = (string) ($a['content'] ?? '');
            // Acepta "data:...;base64,XXXX" o base64 puro; Brevo quiere base64 puro.
            if ($content !== '' && strpos($content, ',') !== false && strpos($content, ';base64,') !== false) {
                $content = substr($content, strpos($content, ',') + 1);
            }
            if ($name !== '' && $content !== '') {
                $att[] = ['name' => $name, 'content' => $content];
            }
        }
        if ($att) {
            $payload['attachment'] = $att;
        }

        $ch = curl_init('https://api.brevo.com/v3/smtp/email');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER     => [
                'api-key: ' . $this->apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 20,
            /* Forzar IPv4: el servidor tiene IPv6 y saldría por esa dirección,
               que NO está autorizada en Brevo (Security → Authorized IPs). Con
               IPv4 sale por la IP del sitio, que sí está autorizada. */
            CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4,
        ]);
        $res  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $code >= 200 && $code < 300;
    }

    /** Correo de texto plano (compatibilidad con la interfaz de lib/Mailer.php). */
    public function send(string $to, string $subject, string $text): bool
    {
        $html = nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8'));
        return $this->sendHtml($to, $subject, $html, $text);
    }
}

<?php
/**
 * Mailer SMTP mínimo, sin dependencias (fsockopen + STARTTLS + AUTH LOGIN).
 * Suficiente para correo transaccional (recuperación de contraseña, avisos,
 * confirmación de citas/pedidos). Para alto volumen se recomienda PHPMailer;
 * este cubre el caso de CloudPanel / Gmail-Workspace (smtp.gmail.com:587).
 *
 *  - send($to,$subject,$text)                 → correo de TEXTO plano.
 *  - sendHtml($to,$subject,$html,$textAlt)    → correo HTML (multipart/alternative).
 */
final class Mailer
{
    private $cfg;
    public function __construct(array $smtp) { $this->cfg = $smtp; }

    /** Correo de texto plano (compatibilidad con el código existente). */
    public function send(string $to, string $subject, string $textBody): bool
    {
        $headers =
            "MIME-Version: 1.0\r\n" .
            "Content-Type: text/plain; charset=utf-8\r\n" .
            "Content-Transfer-Encoding: 8bit\r\n";
        return $this->deliver($to, $subject, $headers, $textBody);
    }

    /** Correo HTML con alternativa de texto (mejor entregabilidad). */
    public function sendHtml(string $to, string $subject, string $htmlBody, string $textAlt = ''): bool
    {
        if ($textAlt === '') {
            // Texto de respaldo: HTML sin etiquetas.
            $textAlt = trim(html_entity_decode(strip_tags(preg_replace('/<\s*br\s*\/?\s*>/i', "\n", $htmlBody)), ENT_QUOTES, 'UTF-8'));
        }
        $boundary = 'oks_' . bin2hex(random_bytes(12));
        $headers =
            "MIME-Version: 1.0\r\n" .
            'Content-Type: multipart/alternative; boundary="' . $boundary . "\"\r\n";
        $body =
            '--' . $boundary . "\r\n" .
            "Content-Type: text/plain; charset=utf-8\r\n" .
            "Content-Transfer-Encoding: 8bit\r\n\r\n" .
            $textAlt . "\r\n\r\n" .
            '--' . $boundary . "\r\n" .
            "Content-Type: text/html; charset=utf-8\r\n" .
            "Content-Transfer-Encoding: 8bit\r\n\r\n" .
            $htmlBody . "\r\n\r\n" .
            '--' . $boundary . "--\r\n";
        return $this->deliver($to, $subject, $headers, $body);
    }

    /** Transporte SMTP compartido. Devuelve true si el servidor aceptó el mensaje. */
    private function deliver(string $to, string $subject, string $extraHeaders, string $body): bool
    {
        $host = $this->cfg['host'] ?? '';
        $port = (int) ($this->cfg['port'] ?? 587);
        if ($host === '') return false;

        $remote = ($port === 465 ? 'ssl://' : '') . $host . ':' . $port;
        $fp = @stream_socket_client($remote, $errno, $errstr, 15);
        if (!$fp) return false;

        $read = function () use ($fp) {
            $data = '';
            while (($line = fgets($fp, 515)) !== false) {
                $data .= $line;
                if (isset($line[3]) && $line[3] === ' ') break;
            }
            return $data;
        };
        $cmd = function ($c) use ($fp, $read) { fwrite($fp, $c . "\r\n"); return $read(); };

        $read();
        $cmd('EHLO okstation');
        if ($port === 587) {
            $cmd('STARTTLS');
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { fclose($fp); return false; }
            $cmd('EHLO okstation');
        }
        if (!empty($this->cfg['user'])) {
            $cmd('AUTH LOGIN');
            $cmd(base64_encode($this->cfg['user']));
            $cmd(base64_encode($this->cfg['pass'] ?? ''));
        }

        $from     = $this->cfg['from'] ?? 'no-reply@okstation.mx';
        $fromName = $this->cfg['from_name'] ?? 'OK.station';

        $cmd('MAIL FROM:<' . $from . '>');
        $cmd('RCPT TO:<' . $to . '>');
        $cmd('DATA');

        $headers =
            'From: ' . $this->encodeName($fromName) . ' <' . $from . ">\r\n" .
            'To: <' . $to . ">\r\n" .
            'Reply-To: ' . $from . "\r\n" .
            'Subject: =?UTF-8?B?' . base64_encode($subject) . "?=\r\n" .
            'Date: ' . date('r') . "\r\n" .
            $extraHeaders;

        fwrite($fp, $headers . "\r\n" . $body . "\r\n.\r\n");
        $resp = $read();
        $cmd('QUIT');
        fclose($fp);

        return strpos($resp, '250') !== false;
    }

    private function encodeName(string $name): string
    {
        // Si tiene caracteres no ASCII, lo codificamos (acentos en "OK.station").
        return preg_match('/[\x80-\xFF]/', $name)
            ? '=?UTF-8?B?' . base64_encode($name) . '?='
            : $name;
    }
}

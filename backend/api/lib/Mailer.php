<?php
/**
 * Mailer SMTP mínimo, sin dependencias (fsockopen + STARTTLS + AUTH LOGIN).
 * Suficiente para correo transaccional (recuperación de contraseña, avisos).
 * Para alto volumen se recomienda PHPMailer; este cubre el caso de CloudPanel.
 */
final class Mailer
{
    private $cfg;
    public function __construct(array $smtp) { $this->cfg = $smtp; }

    public function send(string $to, string $subject, string $textBody): bool
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
            'From: ' . $fromName . ' <' . $from . ">\r\n" .
            'To: <' . $to . ">\r\n" .
            'Subject: =?UTF-8?B?' . base64_encode($subject) . "?=\r\n" .
            "MIME-Version: 1.0\r\n" .
            "Content-Type: text/plain; charset=utf-8\r\n" .
            "Content-Transfer-Encoding: 8bit\r\n";

        fwrite($fp, $headers . "\r\n" . $textBody . "\r\n.\r\n");
        $resp = $read();
        $cmd('QUIT');
        fclose($fp);

        return strpos($resp, '250') !== false;
    }
}

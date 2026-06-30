<?php
/**
 * Capa de correo UNIFICADA. El resto del código llama Mail::sendHtml(...) sin
 * preocuparse del proveedor:
 *   - Si hay BREVO_API_KEY → usa Brevo (API HTTP, permite ADJUNTOS, mejor entrega).
 *   - Si no               → cae al SMTP de lib/Mailer.php (sin adjuntos).
 *
 * Requiere $CONFIG (de _bootstrap.php) con las claves 'brevo' y 'smtp'.
 */
require_once __DIR__ . '/Mailer.php';
require_once __DIR__ . '/Brevo.php';

final class Mail
{
    /**
     * @param array $attachments  [ ['name'=>'comprobante.pdf','content'=>'<base64>'], ... ]
     *                            (solo se adjuntan vía Brevo; el SMTP los ignora)
     */
    public static function sendHtml(string $to, string $subject, string $html, string $textAlt = '', array $attachments = []): bool
    {
        global $CONFIG;
        try {
            $brevo = new Brevo($CONFIG['brevo'] ?? []);
            if ($brevo->configured()) {
                return $brevo->sendHtml($to, $subject, $html, $textAlt, $attachments);
            }
            $mailer = new Mailer($CONFIG['smtp'] ?? []);
            return $mailer->sendHtml($to, $subject, $html, $textAlt);
        } catch (Throwable $e) {
            return false; // el correo es best-effort: nunca rompe la petición
        }
    }

    public static function send(string $to, string $subject, string $text): bool
    {
        global $CONFIG;
        try {
            $brevo = new Brevo($CONFIG['brevo'] ?? []);
            if ($brevo->configured()) {
                return $brevo->send($to, $subject, $text);
            }
            $mailer = new Mailer($CONFIG['smtp'] ?? []);
            return $mailer->send($to, $subject, $text);
        } catch (Throwable $e) {
            return false;
        }
    }
}

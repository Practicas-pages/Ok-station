<?php
/**
 * Límite de intentos para login / acciones sensibles (anti fuerza bruta).
 * Bloquea por (IP + email) tras MAX intentos fallidos durante WINDOW segundos.
 * Requiere la tabla login_attempts (migración 0005) y db().
 */
final class RateLimit
{
    const MAX    = 5;     // intentos fallidos antes de bloquear
    const WINDOW = 900;   // bloqueo de 15 minutos

    /** Aborta con 429 si la combinación está bloqueada. */
    public static function guard(string $ip, string $email): void
    {
        $st = db()->prepare('SELECT locked_until FROM login_attempts WHERE ip = ? AND email = ?');
        $st->execute([$ip, $email]);
        $r = $st->fetch();
        if ($r && !empty($r['locked_until']) && strtotime($r['locked_until']) > time()) {
            fail('Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.', 429);
        }
    }

    /** Registra un intento fallido y bloquea al llegar al máximo. */
    public static function hit(string $ip, string $email): void
    {
        db()->prepare(
            'INSERT INTO login_attempts (ip, email, attempts) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE
               attempts = attempts + 1,
               locked_until = IF(attempts + 1 >= ' . self::MAX . ', DATE_ADD(NOW(), INTERVAL ' . self::WINDOW . ' SECOND), locked_until)'
        )->execute([$ip, $email]);
    }

    /** Limpia el contador tras un login exitoso. */
    public static function reset(string $ip, string $email): void
    {
        db()->prepare('DELETE FROM login_attempts WHERE ip = ? AND email = ?')->execute([$ip, $email]);
    }
}

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

    /** Aborta con 429 si la combinación está bloqueada.
     *  La comparación se hace DENTRO de MySQL (locked_until > NOW()) a propósito: hacerla
     *  en PHP con strtotime()/time() se rompe si PHP y MySQL están en zonas horarias
     *  distintas (p. ej. PHP en UTC y MySQL en hora local) — el bloqueo NUNCA se activaría. */
    public static function guard(string $ip, string $email): void
    {
        $st = db()->prepare(
            'SELECT (locked_until IS NOT NULL AND locked_until > NOW()) AS locked
               FROM login_attempts WHERE ip = ? AND email = ?'
        );
        $st->execute([$ip, $email]);
        $r = $st->fetch();
        if ($r && (int) $r['locked'] === 1) {
            fail('Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.', 429);
        }
    }

    /** Registra un intento y bloquea al llegar al máximo (ventana DESLIZANTE).
     *  Si el último intento fue hace más de WINDOW, el contador arranca de nuevo en 1.
     *  Sin esto, el contador crecería para siempre y en un IP compartido/NAT terminaría
     *  bloqueando a usuarios legítimos (login se salvaba solo por reset() al acertar;
     *  register/forgot no tienen ese reset). `updated_at` da la hora del último intento;
     *  dentro de ON DUPLICATE KEY UPDATE se lee su valor VIEJO (antes del ON UPDATE). */
    public static function hit(string $ip, string $email): void
    {
        // OJO al orden: MySQL evalúa el ON DUPLICATE KEY UPDATE de izquierda a derecha,
        // así que la línea de `locked_until` lee el `attempts` YA actualizado por la de
        // arriba (que es justo el conteo tras este intento). Por eso NO se le vuelve a
        // sumar 1 (hacerlo bloqueaba un intento antes de tiempo).
        $fresh = 'updated_at < NOW() - INTERVAL ' . self::WINDOW . ' SECOND';   // ¿ventana expirada?
        db()->prepare(
            'INSERT INTO login_attempts (ip, email, attempts) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE
               attempts = IF(' . $fresh . ', 1, attempts + 1),
               locked_until = IF(attempts >= ' . self::MAX . ', NOW() + INTERVAL ' . self::WINDOW . ' SECOND, locked_until)'
        )->execute([$ip, $email]);
    }

    /** Limpia el contador tras un login exitoso. */
    public static function reset(string $ip, string $email): void
    {
        db()->prepare('DELETE FROM login_attempts WHERE ip = ? AND email = ?')->execute([$ip, $email]);
    }
}

<?php
/**
 * Disponibilidad de citas. Lee la configuración de la tabla `settings` y
 * calcula los horarios libres por fecha, validando DÍA y HORA contra:
 *   - horario semanal      (appt.weekly_hours, por día 0=Dom..6=Sáb)
 *   - días bloqueados      (appt.blackout_dates)
 *   - ventana de anticipación (appt.max_advance_days) y que la fecha sea futura
 *   - capacidad por horario (appt.capacity) menos las citas ya reservadas
 *
 * Esta es la fuente de verdad: el navegador NUNCA decide la disponibilidad.
 * Requiere db() de _bootstrap.php.
 */
final class Availability
{
    private static function setting(string $key, string $default): string
    {
        $st = db()->prepare('SELECT `value` FROM settings WHERE `key` = ?');
        $st->execute([$key]);
        $r = $st->fetch();
        return ($r && $r['value'] !== null) ? (string) $r['value'] : $default;
    }

    /** Configuración normalizada de disponibilidad. */
    public static function config(): array
    {
        $weekly = json_decode(self::setting('appt.weekly_hours', '{}'), true);
        if (!is_array($weekly)) $weekly = [];
        $blackout = json_decode(self::setting('appt.blackout_dates', '[]'), true);
        if (!is_array($blackout)) $blackout = [];
        return [
            'weekly'   => $weekly,
            'capacity' => max(1, (int) self::setting('appt.capacity', '1')),
            'blackout' => array_values($blackout),
            'advance'  => max(1, (int) self::setting('appt.max_advance_days', '60')),
        ];
    }

    /** Normaliza "9:0" / "09:00:00" → "09:00". */
    public static function normTime(string $t): string
    {
        $p = explode(':', trim($t));
        $h = str_pad((string) (int) ($p[0] ?? 0), 2, '0', STR_PAD_LEFT);
        $m = str_pad((string) (int) ($p[1] ?? 0), 2, '0', STR_PAD_LEFT);
        return "$h:$m";
    }

    /** Horas (HH:MM) configuradas para una fecha, o [] si cerrado/bloqueado/fuera de ventana. */
    public static function hoursFor(string $date, ?array $cfg = null): array
    {
        $cfg = $cfg ?: self::config();
        $ts  = strtotime($date);
        if ($ts === false) return [];
        $today = strtotime(date('Y-m-d'));
        $max   = strtotime('+' . $cfg['advance'] . ' days', $today);
        if ($ts < $today || $ts > $max) return [];                 // pasada o fuera de ventana
        if (in_array($date, $cfg['blackout'], true)) return [];    // día bloqueado
        $dow   = (string) ((int) date('w', $ts));                  // 0=Dom..6=Sáb
        $hours = $cfg['weekly'][$dow] ?? [];
        if (!is_array($hours)) return [];
        return array_values(array_unique(array_map([self::class, 'normTime'], $hours)));
    }

    /**
     * Citas ACTIVAS por horario (HH:MM => conteo) para una fecha.
     * Solo cuentan 'pendiente' y 'confirmada'. Las 'cancelada' y 'completada'
     * NO ocupan el horario (liberan el espacio).
     */
    public static function bookedCounts(string $date): array
    {
        $st = db()->prepare(
            "SELECT TIME_FORMAT(appt_time,'%H:%i') t, COUNT(*) c
             FROM appointments
             WHERE appt_date = ? AND status IN ('pendiente','confirmada')
             GROUP BY appt_time"
        );
        $st->execute([$date]);
        $out = [];
        foreach ($st->fetchAll() as $r) $out[$r['t']] = (int) $r['c'];
        return $out;
    }

    /**
     * Slots con disponibilidad para una fecha: [{time, left, available}].
     * Cada combinación fecha+hora es UN ÚNICO espacio: disponible si no existe
     * una cita activa en ese horario; ocupado si ya existe una.
     */
    public static function slotsFor(string $date): array
    {
        $hours = self::hoursFor($date);
        if (!$hours) return [];
        $booked = self::bookedCounts($date);
        $slots  = [];
        foreach ($hours as $h) {
            $taken = ($booked[$h] ?? 0) > 0;
            $slots[] = ['time' => $h, 'left' => $taken ? 0 : 1, 'available' => !$taken];
        }
        return $slots;
    }

    /** ¿Se puede reservar fecha+hora ahora mismo? Devuelve [bool ok, ?string error]. */
    public static function canBook(string $date, string $time): array
    {
        $hours = self::hoursFor($date);
        if (!$hours) return [false, 'Ese día no atendemos citas. Elige otra fecha.'];
        $time = self::normTime($time);
        if (!in_array($time, $hours, true)) return [false, 'Ese horario no está disponible. Elige otro.'];
        if ((self::bookedCounts($date)[$time] ?? 0) > 0) {
            return [false, 'Ese horario ya está ocupado. Elige otro.'];
        }
        return [true, null];
    }

    /**
     * Nivel de disponibilidad de un día para el indicador del calendario:
     *   'full' (verde)  → menos del 50% ocupado
     *   'mid'  (naranja)→ más del 50% ocupado
     *   'none' (rojo)   → 90% o más, o lleno
     */
    public static function dayLevel(int $total, int $reserved): string
    {
        if ($total <= 0) return 'none';
        if ($reserved >= $total) return 'none';
        $occ = $reserved / $total;
        if ($occ >= 0.9) return 'none';
        if ($occ > 0.5)  return 'mid';
        return 'full';
    }

    /** Citas ACTIVAS agrupadas por fecha en un rango (Y-m-d => conteo). */
    public static function activeCountsByDate(string $from, string $to): array
    {
        $st = db()->prepare(
            "SELECT DATE_FORMAT(appt_date,'%Y-%m-%d') d, COUNT(*) c
             FROM appointments
             WHERE appt_date BETWEEN ? AND ? AND status IN ('pendiente','confirmada')
             GROUP BY appt_date"
        );
        $st->execute([$from, $to]);
        $out = [];
        foreach ($st->fetchAll() as $r) $out[$r['d']] = (int) $r['c'];
        return $out;
    }
}

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

    /* ── Duración: cada persona toma ~45 min; los slots del horario son de 60 min. ── */
    const MIN_PER_PERSON = 45;
    const SLOT_MIN = 60;

    /** Nº de slots (de 60 min) que ocupa una cita de N personas. Ej: 3→ceil(135/60)=3. */
    public static function slotsNeeded(int $party): int
    {
        $party = max(1, $party);
        return max(1, (int) ceil(($party * self::MIN_PER_PERSON) / self::SLOT_MIN));
    }

    /** "HH:MM" → minutos desde medianoche. */
    public static function timeToMin(string $t): int
    {
        $p = explode(':', self::normTime($t));
        return ((int) $p[0]) * 60 + ((int) $p[1]);
    }

    /** minutos → "HH:MM". */
    public static function minToTime(int $min): string
    {
        $min = max(0, $min);
        return str_pad((string) intdiv($min, 60), 2, '0', STR_PAD_LEFT) . ':' . str_pad((string) ($min % 60), 2, '0', STR_PAD_LEFT);
    }

    /** Horas (HH:MM) que ocupa una cita que empieza en $time con N personas. */
    public static function neededSlotTimes(string $time, int $party): array
    {
        $need  = self::slotsNeeded($party);
        $start = self::timeToMin($time);
        $out   = [];
        for ($i = 0; $i < $need; $i++) $out[] = self::minToTime($start + $i * self::SLOT_MIN);
        return $out;
    }

    /** Etiqueta legible de la duración de una cita de N personas (ej. "2 h 15 min"). */
    public static function durationLabel(int $party): string
    {
        $mins = max(1, $party) * self::MIN_PER_PERSON;
        $h = intdiv($mins, 60); $m = $mins % 60;
        if ($h && $m) return "{$h} h {$m} min";
        if ($h) return "{$h} h";
        return "{$m} min";
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
     * Slots horarios OCUPADOS por citas activas en una fecha (HH:MM => conteo).
     * Cada cita ocupa slotsNeeded(party_size) slots consecutivos DESDE su hora,
     * de modo que una cita de varias personas bloquea el tiempo que realmente usa.
     * Solo 'pendiente' y 'confirmada' ocupan; 'cancelada'/'completada' liberan.
     */
    public static function occupiedSlots(string $date): array
    {
        $st = db()->prepare(
            "SELECT TIME_FORMAT(appt_time,'%H:%i') t, party_size
             FROM appointments
             WHERE appt_date = ? AND status IN ('pendiente','confirmada')"
        );
        $st->execute([$date]);
        $out = [];
        foreach ($st->fetchAll() as $r) {
            foreach (self::neededSlotTimes($r['t'], (int) ($r['party_size'] ?? 1)) as $hm) {
                $out[$hm] = ($out[$hm] ?? 0) + 1;
            }
        }
        return $out;
    }

    /**
     * Slots disponibles para una fecha y un nº de personas: [{time, left, available}].
     * Un horario está disponible solo si los slotsNeeded($party) slots consecutivos
     * a partir de él están TODOS dentro del horario del día y libres (así una cita
     * larga no invade el cierre, el descanso, ni el tiempo de otra cita).
     */
    public static function slotsFor(string $date, int $party = 1): array
    {
        $hours = self::hoursFor($date);
        if (!$hours) return [];
        $hourSet = array_flip($hours);
        $occ     = self::occupiedSlots($date);
        $need    = self::slotsNeeded($party);
        $slots   = [];
        foreach ($hours as $h) {
            $fits = self::fitsAt($h, $need, $hourSet, $occ);
            $slots[] = ['time' => $h, 'left' => $fits ? 1 : 0, 'available' => $fits];
        }
        return $slots;
    }

    /** ¿Caben $need slots consecutivos desde $h (todos abiertos ese día y libres)? */
    private static function fitsAt(string $h, int $need, array $hourSet, array $occ): bool
    {
        $start = self::timeToMin($h);
        for ($i = 0; $i < $need; $i++) {
            $hm = self::minToTime($start + $i * self::SLOT_MIN);
            if (!isset($hourSet[$hm])) return false;   // fuera de horario (cierre/hueco)
            if (($occ[$hm] ?? 0) > 0) return false;     // ocupado por otra cita
        }
        return true;
    }

    /** ¿Se puede reservar fecha+hora para N personas? Devuelve [bool ok, ?string error]. */
    public static function canBook(string $date, string $time, int $party = 1): array
    {
        $hours = self::hoursFor($date);
        if (!$hours) return [false, 'Ese día no atendemos citas. Elige otra fecha.'];
        $time = self::normTime($time);
        if (!in_array($time, $hours, true)) return [false, 'Ese horario no está disponible. Elige otro.'];
        if (!self::fitsAt($time, self::slotsNeeded($party), array_flip($hours), self::occupiedSlots($date))) {
            return [false, 'Ese horario no tiene tiempo suficiente para tu cita (' . self::durationLabel($party) . '). Elige otro horario.'];
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

    /** Slots OCUPADOS por fecha en un rango (Y-m-d => nº de slots), sumando la
     *  duración (slotsNeeded) de cada cita activa. Sirve para el color del calendario. */
    public static function activeCountsByDate(string $from, string $to): array
    {
        $st = db()->prepare(
            "SELECT DATE_FORMAT(appt_date,'%Y-%m-%d') d, party_size
             FROM appointments
             WHERE appt_date BETWEEN ? AND ? AND status IN ('pendiente','confirmada')"
        );
        $st->execute([$from, $to]);
        $out = [];
        foreach ($st->fetchAll() as $r) {
            $d = $r['d'];
            $out[$d] = ($out[$d] ?? 0) + self::slotsNeeded((int) ($r['party_size'] ?? 1));
        }
        return $out;
    }
}

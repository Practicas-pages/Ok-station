<?php
/**
 * Cálculo de precios — AUTORIDAD DEL SERVIDOR.
 * El navegador puede mostrar un estimado, pero el precio real SIEMPRE
 * se calcula aquí. Nunca se confía en montos enviados por el cliente.
 * (Refleja la misma tabla que assets/order.js para que el estimado coincida.)
 */
final class Pricing
{
    /** Precio por HOJA según tamaño + B/N|Color + tramo de cantidad (hojas TOTALES).
     *  Cada tramo: [cantidad_máxima, precio_por_hoja]. Tabla OFICIAL OK.station. */
    const PRINT_TIERS = [
        'carta'    => ['bn' => [[10, 2.0], [60, 1.5], [PHP_INT_MAX, 1.3]], 'color' => [[10, 12.0], [60, 9.0], [PHP_INT_MAX, 5.0]]],
        'a4'       => ['bn' => [[10, 2.0], [60, 1.5], [PHP_INT_MAX, 1.3]], 'color' => [[10, 12.0], [60, 9.0], [PHP_INT_MAX, 5.0]]],
        'oficio'   => ['bn' => [[10, 2.5], [50, 2.0], [PHP_INT_MAX, 1.5]], 'color' => [[10, 15.0], [50, 13.0], [PHP_INT_MAX, 10.0]]],
        'tabloide' => ['bn' => [[PHP_INT_MAX, 5.0]],                        'color' => [[PHP_INT_MAX, 20.0]]],
    ];
    /** Precio por foto (sin tramos). */
    const PHOTO  = ['foto_10x15' => 10.0, 'foto_13x18' => 30.0];
    /** Enmicado: precio POR HOJA según el TAMAÑO del documento (catálogo Hoja2).
     *  Oficio y A4 quedan PENDIENTES (sin recargo de enmicado hasta definir su precio). */
    const ENMICADO = ['carta' => 20.0, 'tabloide' => 30.0];
    /** Acabados de precio plano. Engargolado PENDIENTE: $45 temporal hasta definir el
     *  grosor por número de hojas (chico/mediano/grande). */
    const FINISH_FLAT = ['ninguno' => 0.0, 'engargolado' => 45.0];

    private static function tierFor(array $tiers, int $count): float
    {
        foreach ($tiers as [$max, $price]) { if ($count <= $max) return (float) $price; }
        return (float) end($tiers)[1];
    }

    /** Devuelve ['unit'=>float, 'line'=>float, 'quote'=>bool] para un ítem. */
    public static function line(array $cfg, int $pages, int $qty): array
    {
        $pages = max(1, $pages);
        $qty   = max(1, $qty);
        $size  = $cfg['size'] ?? 'carta';
        $count = $pages * $qty;                                   // hojas totales

        if (isset(self::PHOTO[$size])) {                          // fotos: precio por unidad
            $unit = self::PHOTO[$size];
            return ['unit' => $unit, 'line' => round($unit * $count, 2), 'quote' => false];
        }
        if (!isset(self::PRINT_TIERS[$size])) {
            return ['unit' => 0.0, 'line' => 0.0, 'quote' => true]; // gran formato u otro → cotizar
        }
        $band   = (($cfg['color'] ?? 'bn') === 'color') ? 'color' : 'bn';
        $per    = self::tierFor(self::PRINT_TIERS[$size][$band], $count);
        // Doble cara DUPLICA el precio de impresión (regla OK.station).
        $sidesMult  = (($cfg['sides'] ?? 'una') === 'doble') ? 2 : 1;
        // Acabado: enmicado se cobra POR HOJA según el tamaño; los demás (engargolado) son precio plano.
        $finishSel  = $cfg['finish'] ?? 'ninguno';
        $finishCost = ($finishSel === 'enmicado')
            ? ((self::ENMICADO[$size] ?? 0.0) * $count)
            : (self::FINISH_FLAT[$finishSel] ?? 0.0);
        $line   = round($per * $count * $sidesMult + $finishCost, 2);
        return ['unit' => $per, 'line' => $line, 'quote' => false];
    }

    /** Tasa de IVA desde settings (configurable sin tocar código). */
    public static function taxRate(): float
    {
        $row = db()->query("SELECT `value` FROM settings WHERE `key`='tax_rate'")->fetch();
        return $row ? (float) $row['value'] : 0.08;
    }

    /* ============================================================
       Precios de TRÁMITES (citas). Anticipo 100% según el trámite.
       MXN por persona, IVA incluido (igual que el ticket de mostrador).
       Espejo de assets/cita-ticket.js (CITA_PRICES) para que coincidan.
       ============================================================ */

    /** Precios por defecto si no hay setting `appt.prices` (mismos que el front). */
    const APPT_PRICE_DEFAULTS = [
        'pasaporte_mexicano'  => 200.0,
        'pasaporte_americano' => 400.0,   // formato $200 + cita = $400 total
        'visa'                => 800.0,
        'sentri'              => 900.0,
        'ine'                 => 80.0,
        'curp'                => 35.0,
    ];

    /** Catálogo de precios vigente (settings `appt.prices`, con respaldo en los defaults). */
    public static function apptPrices(): array
    {
        $out = self::APPT_PRICE_DEFAULTS;
        $row = db()->query("SELECT `value` FROM settings WHERE `key`='appt.prices'")->fetch();
        if ($row) {
            $j = json_decode((string) $row['value'], true);
            if (is_array($j)) {
                foreach ($j as $k => $v) {
                    $k = preg_replace('/[^a-z0-9_]/i', '', (string) $k);
                    if ($k !== '' && is_numeric($v)) $out[$k] = round((float) $v, 2);
                }
            }
        }
        return $out;
    }

    /** Clave de precio para un trámite (pasaporte se distingue por subtipo). */
    public static function apptPriceKey(string $tramite, ?string $subtype): string
    {
        if ($tramite === 'pasaporte') {
            return 'pasaporte_' . ($subtype === 'americano' ? 'americano' : 'mexicano');
        }
        return $tramite;
    }

    /** Trámites que EXIGEN anticipo del 100% para confirmar (default: visa, pasaporte). */
    const APPT_REQUIRE_PAYMENT_DEFAULTS = ['visa', 'pasaporte'];

    /** Lista vigente de trámites que exigen anticipo (settings appt.require_payment). */
    public static function apptRequirePayment(): array
    {
        $row = db()->query("SELECT `value` FROM settings WHERE `key`='appt.require_payment'")->fetch();
        if ($row) {
            $j = json_decode((string) $row['value'], true);
            if (is_array($j)) {
                $out = [];
                foreach ($j as $t) {
                    $t = preg_replace('/[^a-z0-9_]/i', '', (string) $t);
                    if ($t !== '') $out[] = $t;
                }
                return $out;   // puede ser [] si el admin lo vacía (nadie exige anticipo)
            }
        }
        return self::APPT_REQUIRE_PAYMENT_DEFAULTS;
    }

    /** ¿Este trámite exige el anticipo del 100% para poder confirmar la cita? */
    public static function requiresPayment(string $tramite): bool
    {
        return in_array($tramite, self::apptRequirePayment(), true);
    }

    /**
     * Precio de una cita según trámite + subtipo + personas.
     * Devuelve ['quote'=>bool, 'unit'=>?float, 'party'=>int, 'total'=>?float].
     * quote=true → el trámite NO tiene precio fijo (se cotiza; sin cobro en línea).
     */
    public static function appointmentPricing(string $tramite, ?string $subtype, int $party): array
    {
        $party  = max(1, $party);
        $prices = self::apptPrices();
        $key    = self::apptPriceKey($tramite, $subtype);
        $unit   = $prices[$key] ?? null;

        if ($unit === null || (float) $unit <= 0) {
            return ['quote' => true, 'unit' => null, 'party' => $party, 'total' => null];
        }
        $unit = round((float) $unit, 2);
        return ['quote' => false, 'unit' => $unit, 'party' => $party, 'total' => round($unit * $party, 2)];
    }
}

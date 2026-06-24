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
    /** Acabados (precio representativo; variantes por tamaño se cobran en mostrador). */
    const FINISH = ['ninguno' => 0.0, 'engargolado' => 45.0, 'enmicado' => 20.0, 'grapado' => 5.0];

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
        $finish = self::FINISH[$cfg['finish'] ?? 'ninguno'] ?? 0.0;
        $line   = round($per * $count + $finish, 2);
        return ['unit' => $per, 'line' => $line, 'quote' => false];
    }

    /** Tasa de IVA desde settings (configurable sin tocar código). */
    public static function taxRate(): float
    {
        $row = db()->query("SELECT `value` FROM settings WHERE `key`='tax_rate'")->fetch();
        return $row ? (float) $row['value'] : 0.16;
    }
}

<?php
/**
 * Cálculo de precios — AUTORIDAD DEL SERVIDOR.
 * El navegador puede mostrar un estimado, pero el precio real SIEMPRE
 * se calcula aquí. Nunca se confía en montos enviados por el cliente.
 * (Refleja la misma tabla que assets/order.js para que el estimado coincida.)
 */
final class Pricing
{
    /** Precio base por tamaño (MXN por página). 0 = se cotiza aparte. */
    const SIZES = [
        'carta' => 1.5, 'oficio' => 2.0, 'tabloide' => 5.0, 'a4' => 1.5,
        'foto_10x15' => 8.0, 'foto_13x18' => 15.0, 'gran_formato' => 0.0,
    ];
    const COLOR  = ['color' => 1.0, 'grises' => 0.8, 'bn' => 0.5];
    const SIDES  = ['una' => 1.0, 'doble' => 0.9];
    const FINISH = ['ninguno' => 0.0, 'engargolado' => 25.0, 'enmicado' => 15.0, 'grapado' => 5.0];

    /** Devuelve ['unit'=>float, 'line'=>float, 'quote'=>bool] para un ítem. */
    public static function line(array $cfg, int $pages, int $qty): array
    {
        $pages = max(1, $pages);
        $qty   = max(1, $qty);
        $base  = self::SIZES[$cfg['size'] ?? 'carta'] ?? 0.0;
        if ($base <= 0) {
            return ['unit' => 0.0, 'line' => 0.0, 'quote' => true]; // gran formato → cotizar
        }
        $color  = self::COLOR[$cfg['color'] ?? 'bn'] ?? 1.0;
        $sides  = self::SIDES[$cfg['sides'] ?? 'una'] ?? 1.0;
        $finish = self::FINISH[$cfg['finish'] ?? 'ninguno'] ?? 0.0;

        $unit = round($base * $color * $sides, 2);
        $line = round($unit * $pages * $qty + $finish, 2);
        return ['unit' => $unit, 'line' => $line, 'quote' => false];
    }

    /** Tasa de IVA desde settings (configurable sin tocar código). */
    public static function taxRate(): float
    {
        $row = db()->query("SELECT `value` FROM settings WHERE `key`='tax_rate'")->fetch();
        return $row ? (float) $row['value'] : 0.16;
    }
}

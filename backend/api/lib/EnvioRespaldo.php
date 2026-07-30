<?php
/**
 * Tarifa de envío de RESPALDO por zona (código postal).
 * -----------------------------------------------------------------------------
 * Se usa SOLO cuando la paquetería (Almacén 4) no cotiza en el momento —está caída
 * o throttleada—, para que la venta NUNCA se trabe (envío disponible el 100% de las
 * veces). Cuando la paquetería sí responde, manda SU precio real; esto es el piso.
 *
 * ⚠️ MONTOS A CONFIRMAR CON EL JEFE ⚠️
 * Los valores de abajo son ESTIMADOS, puestos a propósito un poco por ENCIMA de lo
 * observado (reparto local ~$130, nacional ~$230) para no vender el envío por debajo
 * del costo. NO son tarifas oficiales: el dueño debe revisarlas y ajustarlas. Están
 * en UN solo lugar (const TARIFAS) para que cambiarlas sea trivial.
 *
 * La zona se decide por el CP —el mismo dato con el que cotiza la paquetería—, así
 * que el respaldo es coherente con el resto del checkout (IVA y envío por CP).
 */
declare(strict_types=1);

final class EnvioRespaldo
{
    /** Tarifas ESTIMADAS por zona (MXN). Ajustar con el dueño. */
    const TARIFAS = [
        'local'    => 149.0,   // Tijuana y frontera (CP 22xxx) — reparto local
        'bc'       => 199.0,   // resto de Baja California norte (CP 21xxx, Mexicali)
        'nacional' => 299.0,   // resto del país
    ];

    /** Zona a partir del código postal. */
    public static function zona(string $cp): string
    {
        $cp = preg_replace('/\D/', '', $cp) ?? '';
        if (strncmp($cp, '22', 2) === 0) return 'local';      // Tijuana / Ensenada / Tecate / Rosarito
        if (strncmp($cp, '21', 2) === 0) return 'bc';         // Mexicali y alrededores
        return 'nacional';
    }

    /** Tarifa de respaldo para un CP. Nunca falla: siempre devuelve un número. */
    public static function tarifa(string $cp): float
    {
        return self::TARIFAS[self::zona($cp)] ?? self::TARIFAS['nacional'];
    }

    /** Nombre que ve el CLIENTE (el checkout le añade "(Almacén 4)"). */
    public static function etiquetaCliente(): string
    {
        return 'Envío estándar';
    }

    /** Nota para el PEDIDO/staff: deja claro que fue estimado, no confirmado por la paquetería. */
    public static function etiquetaPedido(): string
    {
        return 'Envío estándar (Almacén 4) · tarifa estimada';
    }
}

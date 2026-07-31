<?php
/**
 * Tarifa de envío de RESPALDO (plana).
 * -----------------------------------------------------------------------------
 * Se usa SOLO cuando la paquetería (Almacén 4) no cotiza tras 2 intentos —está caída
 * o throttleada—, para que la venta NUNCA se trabe (envío disponible el 100% de las
 * veces). Cuando la paquetería sí responde, manda SU precio real; esto es el piso.
 *
 * Tarifa PLANA de $230 (decisión del negocio, 2026-07-31). ⚠️ Monto a confirmar con
 * el dueño; está en UN solo lugar (const TARIFA) para cambiarlo trivialmente.
 */
declare(strict_types=1);

final class EnvioRespaldo
{
    /** Tarifa PLANA de respaldo (MXN). ⚠️ Ajustar con el dueño. */
    const TARIFA = 230.0;

    /** Tarifa de respaldo. Plana: no depende del CP. Nunca falla. */
    public static function tarifa(string $cp = ''): float
    {
        return self::TARIFA;
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

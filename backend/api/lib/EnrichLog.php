<?php
/**
 * Bitácora de enriquecimiento — quién intentó qué, y cómo le fue
 * =============================================================================
 * Escribe en `product_enrichment` (migración 0036). Existe para que TODAS las
 * fuentes —Icecat hoy, las páginas de los fabricantes mañana— dejen rastro de la
 * misma forma, en vez de que cada runner invente su propia marca en `products`.
 *
 * El agujero que tapa: antes, cuando Icecat no encontraba un producto, se escribía
 * `enriched_at = NOW()` y el runner seleccionaba `WHERE enriched_at IS NULL`. Un
 * producto que Icecat NO pudo enriquecer quedaba marcado igual que uno enriquecido
 * con éxito, y nadie lo volvía a mirar. Los productos que más necesitan una segunda
 * fuente eran justo los invisibles para ella.
 *
 * NO lanza excepciones nunca: la bitácora es para saber qué pasó, no para tumbar
 * una corrida. Si la tabla no existe todavía (migración sin aplicar), calla y sigue.
 */
final class EnrichLog
{
    /** Cuánto esperar antes de reintentar, según por qué falló. */
    public const REINTENTO = [
        // Falla temporal (red caída, 429, timeout): mañana probablemente funcione.
        'error'     => '+1 day',
        // La fuente respondió bien y NO tiene el producto. Reintentar seguido es
        // gastar cuota para nada — pero tampoco es "nunca": los catálogos crecen.
        'sin_datos' => '+30 days',
        // Ya aportó / ya se descartó / espera a una persona: no se reintenta solo.
        'ok'        => null,
        'rechazado' => null,
        'revision'  => null,
    ];

    /**
     * Registra el resultado de consultar UNA fuente para UN producto.
     * El intento nuevo pisa al anterior (un renglón por producto+fuente).
     *
     * @param string $source 'icecat' | 'fabricante:3m' | …
     * @param string $status ok | sin_datos | error | revision | rechazado
     * @param array  $extra  fields, source_url, match_key, confidence, detail
     */
    public static function registrar(PDO $pdo, int $productId, string $source, string $status, array $extra = []): void
    {
        $espera = self::REINTENTO[$status] ?? null;
        $retry  = $espera !== null ? date('Y-m-d H:i:s', strtotime($espera)) : null;

        try {
            $pdo->prepare(
                "INSERT INTO product_enrichment
                    (product_id, source, status, fields, source_url, match_key, confidence, detail, tried_at, retry_after)
                 VALUES (?,?,?,?,?,?,?,?,NOW(),?)
                 ON DUPLICATE KEY UPDATE
                    status      = VALUES(status),
                    fields      = VALUES(fields),
                    source_url  = VALUES(source_url),
                    match_key   = VALUES(match_key),
                    confidence  = VALUES(confidence),
                    detail      = VALUES(detail),
                    tried_at    = VALUES(tried_at),
                    retry_after = VALUES(retry_after)"
            )->execute([
                $productId,
                mb_substr($source, 0, 32),
                $status,
                isset($extra['fields'])     ? mb_substr((string) $extra['fields'], 0, 80)      : null,
                isset($extra['source_url']) ? mb_substr((string) $extra['source_url'], 0, 500) : null,
                isset($extra['match_key'])  ? mb_substr((string) $extra['match_key'], 0, 120)  : null,
                isset($extra['confidence']) ? max(0, min(100, (int) $extra['confidence']))     : null,
                isset($extra['detail'])     ? mb_substr((string) $extra['detail'], 0, 255)     : null,
                $retry,
            ]);
        } catch (Throwable $e) {
            /* La bitácora nunca debe tumbar una corrida de enriquecimiento. Si la
               migración 0036 no se ha aplicado, esto simplemente no registra y el
               runner sigue funcionando como antes. */
        }
    }

    /**
     * Fragmento SQL para la cola de trabajo de una fuente: productos a los que
     * ESA fuente todavía no les ha dicho la última palabra.
     *
     * Entra un producto si: nunca se le preguntó a esta fuente, o el intento
     * anterior fue temporal/agotado y ya toca reintentar. NO entra si la fuente ya
     * aportó, ya lo rechazó, o está esperando revisión de una persona.
     *
     * Se devuelve como texto para poder pegarlo en los WHERE que ya existen sin
     * reescribir las consultas de los runners.
     */
    public static function pendienteSql(string $alias = 'products'): string
    {
        return "NOT EXISTS (
                    SELECT 1 FROM product_enrichment pe
                     WHERE pe.product_id = {$alias}.id
                       AND pe.source = :enrich_source
                       AND (pe.retry_after IS NULL OR pe.retry_after > NOW())
                )";
    }
}

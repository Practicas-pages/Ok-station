<?php
/**
 * Tercera pasada de imágenes: rescate automático con coincidencias comprobables.
 * =============================================================================
 * Exel e Icecat siguen mandando. Esta clase solo atiende productos que todavía no
 * tienen una imagen y nunca publica resultados aproximados:
 *
 *   1. NEXTEP por número de parte NE-xxx.
 *   2. NEXTEP por nombre normalizado idéntico y único en el catálogo oficial.
 *
 * Las coincidencias por parecido quedan marcadas como `revision`; el panel ya sabe
 * mostrarlas como candidatas. Así el proceso es masivo sin convertir un hueco visual
 * en una devolución por haber elegido otra medida, color o presentación.
 *
 * La clase no carga dependencias por su cuenta. Este proyecto no tiene autoloader:
 * cada endpoint/runner debe requerir Nextep, ImagenSegura, EnrichLog y
 * CatalogoAlcance antes de usarla.
 */
final class RescateImagenes
{
    public const SOURCE = 'rescate:nextep';
    private const MAX_IMAGENES = 5;

    /** Procesa un lote acotado y devuelve un resumen apto para CLI o JSON. */
    public static function procesar(PDO $pdo, int $limit = 10): array
    {
        $limit = max(1, min(100, $limit));
        $alcance = alcance_sql('products');
        $sql = "SELECT products.id, products.name, products.brand,
                       products.sku, products.supplier_ref
                  FROM products
                 WHERE UPPER(COALESCE(products.brand,'')) LIKE '%NEXTEP%'
                   {$alcance['sql']}
                   AND NOT EXISTS (
                       SELECT 1 FROM product_images pi WHERE pi.product_id = products.id
                   )
                   AND " . EnrichLog::pendienteSql('products') . "
                 ORDER BY products.id
                 LIMIT {$limit}";
        $st = $pdo->prepare($sql);
        $st->execute([':enrich_source' => self::SOURCE] + $alcance['params']);
        $productos = $st->fetchAll(PDO::FETCH_ASSOC);

        $res = [
            'procesados' => 0,
            'rescatados' => 0,
            'revision'   => 0,
            'sin_datos'  => 0,
            'errores'    => 0,
            'imagenes'   => 0,
            'detalle'    => [],
        ];

        foreach ($productos as $p) {
            $res['procesados']++;
            $pid = (int) $p['id'];
            [$match, $matchKey, $confidence] = self::coincidenciaExacta($p);

            if (!$match || empty($match['imagenes'])) {
                $parecidas = Nextep::porNombre((string) $p['name'], 2);
                if ($parecidas) {
                    $res['revision']++;
                    EnrichLog::registrar($pdo, $pid, self::SOURCE, 'revision', [
                        'fields'     => 'imagen',
                        'source_url' => (string) ($parecidas[0]['url'] ?? ''),
                        'match_key'  => (string) ($parecidas[0]['clave'] ?? ''),
                        'confidence' => (int) round(((float) ($parecidas[0]['score'] ?? 0)) * 100),
                        'detail'     => 'Hay candidatas por parecido; falta confirmar la variante en el panel.',
                    ]);
                    $res['detalle'][] = ['id' => $pid, 'estado' => 'revision'];
                } else {
                    $res['sin_datos']++;
                    EnrichLog::registrar($pdo, $pid, self::SOURCE, 'sin_datos', [
                        'fields' => 'imagen',
                        'detail' => 'El fabricante no devolvió una coincidencia exacta ni candidatas.',
                    ]);
                    $res['detalle'][] = ['id' => $pid, 'estado' => 'sin_datos'];
                }
                continue;
            }

            $guardadas = [];
            $fallos = [];
            foreach (array_slice(array_values(array_unique($match['imagenes'])), 0, self::MAX_IMAGENES) as $url) {
                [$bytes, $motivo] = ImagenSegura::descargar((string) $url);
                if ($bytes === null) { $fallos[] = $motivo; continue; }
                [$meta, $motivo] = ImagenSegura::validarBytes($bytes);
                if ($meta === null) { $fallos[] = $motivo; continue; }
                $guardadas[] = [
                    'url'  => (string) $url,
                    'path' => ImagenSegura::guardar($pid, $bytes, (string) $meta['ext']),
                ];
            }

            if (!$guardadas) {
                $res['errores']++;
                EnrichLog::registrar($pdo, $pid, self::SOURCE, 'error', [
                    'fields'     => 'imagen',
                    'source_url' => (string) ($match['imagenes'][0] ?? ''),
                    'match_key'  => $matchKey,
                    'confidence' => $confidence,
                    'detail'     => mb_strimwidth(implode(' ', $fallos) ?: 'No se pudo descargar una imagen válida.', 0, 250, '…'),
                ]);
                $res['detalle'][] = ['id' => $pid, 'estado' => 'error'];
                continue;
            }

            try {
                $pdo->beginTransaction();
                $ins = $pdo->prepare(
                    'INSERT INTO product_images
                        (product_id, url, stored_path, source, sort_order, is_primary)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                foreach ($guardadas as $i => $img) {
                    $ins->execute([$pid, $img['url'], $img['path'], self::SOURCE, $i, $i === 0 ? 1 : 0]);
                }
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                $res['errores']++;
                EnrichLog::registrar($pdo, $pid, self::SOURCE, 'error', [
                    'fields' => 'imagen', 'match_key' => $matchKey,
                    'confidence' => $confidence, 'detail' => 'No se pudo registrar la imagen local.',
                ]);
                $res['detalle'][] = ['id' => $pid, 'estado' => 'error'];
                continue;
            }

            $res['rescatados']++;
            $res['imagenes'] += count($guardadas);
            EnrichLog::registrar($pdo, $pid, self::SOURCE, 'ok', [
                'fields'     => 'imagen',
                'source_url' => $guardadas[0]['url'],
                'match_key'  => $matchKey,
                'confidence' => $confidence,
                'detail'     => 'Imagen oficial guardada automáticamente con coincidencia exacta.',
            ]);
            $res['detalle'][] = ['id' => $pid, 'estado' => 'ok', 'imagenes' => count($guardadas)];
        }

        $res['pendientes'] = self::contarPendientes($pdo);
        $res['sin_imagen_total'] = self::contarSinImagen($pdo);
        return $res;
    }

    /** Clave exacta primero; nombre idéntico y único solo cuando no hay clave usable. */
    private static function coincidenciaExacta(array $p): array
    {
        foreach ([(string) ($p['sku'] ?? ''), (string) ($p['supplier_ref'] ?? '')] as $clave) {
            if (!Nextep::claveValida($clave)) continue;
            $normal = Nextep::normalizarClave($clave);
            $match = Nextep::porClave($normal);
            if ($match) return [$match, $normal, 100];
        }

        $match = Nextep::porNombreExacto((string) ($p['name'] ?? ''));
        if ($match) return [$match, 'nombre:' . (string) ($match['sku'] ?? ''), 98];
        return [null, '', 0];
    }

    private static function contarPendientes(PDO $pdo): int
    {
        $alcance = alcance_sql('products');
        $sql = "SELECT COUNT(*)
                  FROM products
                 WHERE UPPER(COALESCE(products.brand,'')) LIKE '%NEXTEP%'
                   {$alcance['sql']}
                   AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = products.id)
                   AND " . EnrichLog::pendienteSql('products');
        $st = $pdo->prepare($sql);
        $st->execute([':enrich_source' => self::SOURCE] + $alcance['params']);
        return (int) $st->fetchColumn();
    }

    private static function contarSinImagen(PDO $pdo): int
    {
        $alcance = alcance_sql('products');
        $st = $pdo->prepare(
            "SELECT COUNT(*) FROM products
              WHERE 1=1 {$alcance['sql']}
                AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = products.id)"
        );
        $st->execute($alcance['params']);
        return (int) $st->fetchColumn();
    }
}

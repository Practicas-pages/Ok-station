<?php
/**
 * Enriquecedor de productos con Icecat.
 * -----------------------------------------------------------------------------
 * Toma un producto de la tabla `products` (creado por el runner de Exel), lo busca
 * en Icecat por su código de barras (o marca+sku) y le escribe la FICHA TÉCNICA
 * (products.specs_json) y las IMÁGENES (product_images, máx 5). Marca `enriched_at`
 * para no volver a intentarlo en cada visita.
 *
 * Idempotente: correrlo otra vez re-sincroniza las imágenes de Icecat sin duplicar.
 * Recibe el PDO por parámetro para servir igual desde un endpoint (db()) que desde
 * el runner CLI (su propio PDO). Requiere Icecat.php ya incluido.
 */

/* Aquí NO hay autoloader: si un llamador olvida requerir EnrichLog, la clase no
   existe y esto revienta con un fatal en pleno enriquecimiento. Se requiere desde
   aquí para que cualquiera que use ProductEnricher lo tenga sí o sí. */
require_once __DIR__ . '/EnrichLog.php';
final class ProductEnricher
{
    /**
     * Enriquece un producto. Devuelve el estado:
     *   ['enriched'=>bool, 'images'=>int, 'specs'=>int, 'source'=>'icecat'|'none', 'reason'=>string]
     * NO lanza excepciones: si algo falla, degrada con gracia.
     */
    public static function enrich(PDO $pdo, int $productId): array
    {
        $out = ['enriched' => false, 'images' => 0, 'specs' => 0, 'source' => 'none', 'reason' => ''];

        // Sin usuario de Icecat no marcamos nada: reintentar cuando llegue la key.
        if (!Icecat::available()) { $out['reason'] = 'icecat_no_configurado'; return $out; }

        try {
            $st = $pdo->prepare('SELECT id, barcode, brand, sku, name, description, specs_json FROM products WHERE id = ? LIMIT 1');
            $st->execute([$productId]);
            $p = $st->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $e) { $out['reason'] = 'db_error'; return $out; }
        if (!$p) { $out['reason'] = 'no_existe'; return $out; }

        $data = Icecat::fetch([
            'gtin'  => (string) ($p['barcode'] ?? ''),
            'brand' => (string) ($p['brand'] ?? ''),
            'code'  => (string) ($p['sku'] ?? ''),
        ]);

        // No está en Icecat. Se marca el intento para no repreguntar en cada vista,
        // PERO en la bitácora y como 'sin_datos', no como éxito: así el producto
        // sigue siendo visible para otra fuente (las páginas del fabricante) en vez
        // de quedar sepultado bajo un enriched_at que dice "ya está resuelto".
        if ($data === null) {
            EnrichLog::registrar($pdo, $productId, 'icecat', 'sin_datos', [
                'match_key' => (string) ($p['barcode'] ?? '') ?: trim(($p['brand'] ?? '') . ' ' . ($p['sku'] ?? '')),
                'detail'    => 'Icecat respondió sin ficha para este identificador',
            ]);
            try {
                $pdo->prepare('UPDATE products SET enriched_at = NOW() WHERE id = ?')->execute([$productId]);
            } catch (Throwable $e) {}
            $out['reason'] = 'no_en_icecat';
            return $out;
        }

        try {
            $pdo->beginTransaction();

            /* REGLA: el proveedor (Exel) MANDA; Icecat solo COMPLEMENTA lo que falte.
               Si ya hay una ficha que NO vino de Icecat (es decir, de Exel), no se pisa.
               Igual con la descripción: solo se rellena si Exel no la trae. */
            $existing  = json_decode((string) ($p['specs_json'] ?? ''), true);
            $fichaExel = is_array($existing) && (($existing['source'] ?? '') !== 'icecat') && !empty($existing['specs']);

            $sets = ['image_source = ?', 'enriched_at = NOW()'];
            $args = ['icecat'];
            if (!$fichaExel) {
                array_unshift($sets, 'specs_json = ?');
                array_unshift($args, json_encode(['source' => 'icecat', 'specs' => $data['specs']], JSON_UNESCAPED_UNICODE));
            }
            if (trim((string) $p['description']) === '' && $data['description'] !== '') {
                $sets[] = 'description = ?'; $args[] = $data['description'];
            }
            $args[] = $productId;
            $pdo->prepare('UPDATE products SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($args);

            /* Imágenes: reemplaza SOLO las de Icecat (no toca las de Exel).
               ANTES de borrarlas se apunta qué archivo local tenía cada URL, para
               devolvérselo abajo a la que vuelva con la misma URL. Sin esto, volver a
               enriquecer DEJA SIN FOTOS a la tienda (stored_path se pierde y se sirve
               el CDN de Icecat) hasta que alguien corra el descargador otra vez. */
            $old = [];
            $st2 = $pdo->prepare("SELECT url, stored_path FROM product_images WHERE product_id = ? AND source = 'icecat' AND stored_path IS NOT NULL AND stored_path <> ''");
            $st2->execute([$productId]);
            foreach ($st2->fetchAll(PDO::FETCH_ASSOC) as $r) $old[(string) $r['url']] = (string) $r['stored_path'];

            $pdo->prepare("DELETE FROM product_images WHERE product_id = ? AND source = 'icecat'")->execute([$productId]);
            // Cap TOTAL de 5 por producto: cuenta las que ya hay (p. ej. de Exel) y solo
            // llena los huecos restantes. Ej: 2 de Exel + 4 de Icecat -> se guardan 5 (2+3).
            $er = $pdo->prepare('SELECT COUNT(*) AS c, COALESCE(MAX(is_primary),0) AS hp FROM product_images WHERE product_id = ?');
            $er->execute([$productId]);
            $ex = $er->fetch(PDO::FETCH_ASSOC);
            $already    = (int) ($ex['c'] ?? 0);
            $hasPrimary = ((int) ($ex['hp'] ?? 0)) === 1;   // ¿ya hay una principal (Exel)?
            $slots      = max(0, 5 - $already);

            $ins = $pdo->prepare(
                'INSERT INTO product_images (product_id, url, stored_path, source, sort_order, is_primary)
                 VALUES (?, ?, ?, \'icecat\', ?, ?)'
            );
            $i = 0;
            foreach ($data['images'] as $img) {
                if ($i >= $slots) break;                    // respeta el tope total de 5
                // Solo una imagen de Icecat puede ser principal, y solo si Exel no puso ya una.
                $primary = (!$hasPrimary && !empty($img['is_primary'])) ? 1 : 0;
                if ($primary) $hasPrimary = true;
                // Misma URL que antes → conserva el archivo ya descargado (no se re-baja).
                $ins->execute([$productId, $img['url'], $old[(string) $img['url']] ?? null, $already + $i, $primary]);
                $i++;
            }

            $pdo->commit();
            $out['enriched'] = true;
            $out['images']   = $i;
            $out['specs']    = count($data['specs']);
            $out['source']   = 'icecat';

            /* Qué aportó Icecat en realidad, campo por campo. Se registra DESPUÉS del
               commit: la bitácora describe lo que quedó escrito, no lo que se intentó.
               Si aportó imágenes pero no ficha, el producto sigue necesitando ficha y
               otra fuente debe poder verlo — por eso importa el detalle y no un
               "enriquecido" a secas. */
            $aporto = [];
            if ($i > 0)                     $aporto[] = 'imagen';
            if (count($data['specs']) > 0)  $aporto[] = 'ficha';
            if (!empty($data['description']) && trim((string) ($p['description'] ?? '')) === '') $aporto[] = 'descripcion';
            EnrichLog::registrar($pdo, $productId, 'icecat', $aporto ? 'ok' : 'sin_datos', [
                'fields'    => implode(',', $aporto),
                'match_key' => (string) ($p['barcode'] ?? '') ?: trim(($p['brand'] ?? '') . ' ' . ($p['sku'] ?? '')),
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $out['reason'] = 'write_error: ' . $e->getMessage();
            /* Falla de ESCRITURA, no de la fuente: es temporal y debe reintentarse.
               Sin esto, un error de base de datos dejaba al producto sin registro y
               el runner lo reintentaría en cada corrida sin control. */
            EnrichLog::registrar($pdo, $productId, 'icecat', 'error', ['detail' => $e->getMessage()]);
        }
        return $out;
    }
}

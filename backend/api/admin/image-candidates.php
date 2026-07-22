<?php
/**
 * GET /backend/api/admin/image-candidates.php?id=N — imágenes CANDIDATAS de un producto.
 * Requiere 'shop.view'.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PARA OSCAR — aquí se enchufan las APIs de imágenes                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Qué hace HOY: devuelve lo que ya quedó registrado en `product_enrichment` (0036)
 * esperando revisión (status='revision'). O sea, funciona pero nadie llena esa cola
 * todavía.
 *
 * Qué FALTA (tu parte): consultar las fuentes en vivo — Icecat y, después, páginas
 * de fabricante — y devolver las imágenes que encuentren para ese producto.
 *
 * Lo único que hay que respetar es la FORMA de la respuesta. El panel ya sabe
 * pintar candidatas, dejar que el administrador elija una y guardarla; si respetas
 * este formato, no tienes que tocar una sola línea del front:
 *
 *   {
 *     "ok": true,
 *     "candidates": [
 *       {
 *         "url":        "https://…/foto.jpg",   (obligatorio, https)
 *         "thumb":      "https://…/mini.jpg",   (opcional; si falta se usa `url`)
 *         "source":     "icecat",               (obligatorio: 'icecat', 'fabricante:3m'…)
 *         "title":      "Post-it 683 12mm",     (opcional, ayuda a comparar)
 *         "confidence": 85,                     (opcional, 0-100)
 *         "source_url": "https://…/producto",   (opcional, para auditar de dónde salió)
 *         "width": 800, "height": 800           (opcional)
 *       }
 *     ]
 *   }
 *
 * Tres reglas del negocio que NO hay que romper:
 *   1. Esto solo PROPONE. Publicar es decisión de una persona: guardar la elección
 *      es trabajo de product-image.php, nunca de aquí.
 *   2. `source` viaja tal cual a `product_images.source` (VARCHAR(32) desde la 0037)
 *      y a `product_enrichment.source`. Usa el mismo texto en ambos lados para
 *      poder cruzarlos después.
 *   3. Si una fuente responde pero no está segura de que sea el mismo producto,
 *      eso es exactamente `status='revision'` de tu 0036: mándala como candidata
 *      con su `confidence`, no la publiques.
 *
 * Sugerencia de orden: las de mayor `confidence` primero — el administrador revisa
 * decenas de productos seguidos y lo primero que ve es lo que más pesa.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = require_permission('shop.view');

$id = (int) ($_GET['id'] ?? 0);
if ($id <= 0) fail('Producto inválido.');

$st = db()->prepare('SELECT id, name, brand, sku, supplier_ref, barcode FROM products WHERE id = ?');
$st->execute([$id]);
$p = $st->fetch();
if (!$p) fail('El producto no existe.', 404);

$candidates = [];

/* ── Fuente 1 (ya conectada): la cola de revisión de la 0036 ─────────────────
   Cuando un runner encuentra algo que NO puede confirmar, deja el renglón en
   'revision' con su source_url. Eso ES una candidata: se muestra para que una
   persona decida. */
try {
    $ste = db()->prepare(
        "SELECT source, source_url, confidence, detail
           FROM product_enrichment
          WHERE product_id = ? AND status = 'revision' AND source_url IS NOT NULL
          ORDER BY confidence DESC, source ASC"
    );
    $ste->execute([$id]);
    foreach ($ste->fetchAll() as $r) {
        $candidates[] = [
            'url'        => (string) $r['source_url'],
            'thumb'      => null,
            'source'     => (string) $r['source'],
            'title'      => $r['detail'] !== null ? (string) $r['detail'] : null,
            'confidence' => $r['confidence'] !== null ? (int) $r['confidence'] : null,
            'source_url' => (string) $r['source_url'],
        ];
    }
} catch (Throwable $e) {
    /* La 0036 puede no estar aplicada en algún entorno: sin cola, sin candidatas. */
}

/* ── Fuente 2 (PENDIENTE, Oscar): búsqueda en vivo ───────────────────────────
   Aquí va la llamada a Icecat / fabricantes usando los datos de $p (barcode/EAN,
   sku, supplier_ref como MPN, brand + name como último recurso) y el resultado se
   agrega a $candidates con la forma de arriba.

   Ojo con dos cosas que ya mordieron antes en este proyecto:
     · En Windows, las llamadas HTTPS de PHP fallan EN SILENCIO si no está puesto
       curl.cainfo (ver LEEME-local.md). Se ve como "no encontrado", no como error.
     · Gastar cuota: si la búsqueda se dispara cada vez que se abre una ficha, una
       tarde de revisión se come el límite diario. Conviene registrar el intento en
       product_enrichment y respetar retry_after, igual que hace EnrichLog. */

respond([
    'ok'         => true,
    'product'    => ['id' => (int) $p['id'], 'name' => $p['name'], 'brand' => $p['brand'],
                     'sku' => $p['sku'], 'supplier_ref' => $p['supplier_ref'], 'barcode' => $p['barcode']],
    'candidates' => $candidates,
    'pending'    => ['live_search' => true],  // el front avisa que falta conectar fuentes
]);

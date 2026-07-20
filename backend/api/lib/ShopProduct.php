<?php
/**
 * Ok.station — Lectura de un producto para la TIENDA (compartido).
 * -----------------------------------------------------------------------------
 * Lo usan el API (backend/api/shop/product.php) y la página pública del producto
 * (producto.php). Vive aquí para que la definición de "qué es un producto público"
 * —precio con IVA, imágenes, ficha, oferta— exista UNA sola vez: si mañana cambia
 * la regla del IVA o de la oferta, se cambia en un lugar y los dos la respetan.
 *
 * Requiere: una función global db(): PDO y (para enriquecer) Icecat + ProductEnricher.
 */
final class ShopProduct
{
    /** IVA de la zona fronteriza, ya incluido en el precio de lista que se muestra.
     *  El definitivo se recalcula por geolocalización en el checkout. */
    const IVA_LISTA = 1.08;

    /** Fila cruda de `products` (solo activos), por id, sku o referencia de Exel. */
    public static function findRow(PDO $pdo, int $id, string $sku = '', string $ref = ''): ?array
    {
        if ($id > 0) {
            $st = $pdo->prepare('SELECT * FROM products WHERE id = ? AND is_active = 1 LIMIT 1');
            $st->execute([$id]);
        } elseif ($sku !== '') {
            $st = $pdo->prepare('SELECT * FROM products WHERE sku = ? AND is_active = 1 LIMIT 1');
            $st->execute([$sku]);
        } elseif ($ref !== '') {
            $st = $pdo->prepare("SELECT * FROM products WHERE supplier = 'exel' AND supplier_ref = ? AND is_active = 1 LIMIT 1");
            $st->execute([$ref]);
        } else {
            return null;
        }
        $p = $st->fetch();
        return $p ?: null;
    }

    /** Tope de fotos que se muestran por producto (galería de la ficha y vista previa). */
    const MAX_IMAGENES = 5;

    /**
     * Imágenes del producto: la principal primero. Prefiere la copia local descargada.
     * Se topan en MAX_IMAGENES: es lo que cabe en la galería, y algunos productos de
     * Exel traen muchas más de las que tiene sentido cargar (cada una es una petición
     * al CDN del proveedor).
     */
    public static function images(PDO $pdo, int $productId): array
    {
        $st = $pdo->prepare(
            "SELECT COALESCE(stored_path, url) AS src
               FROM product_images WHERE product_id = ?
              ORDER BY is_primary DESC, sort_order ASC, id ASC
              LIMIT " . self::MAX_IMAGENES
        );
        $st->execute([$productId]);
        return array_values(array_filter(array_column($st->fetchAll(), 'src')));
    }

    /** Ficha técnica normalizada. specs_json puede venir como {source,specs:[…]} o como lista. */
    /**
     * Ficha técnica del producto, en formato [['name'=>, 'value'=>], …].
     *
     * Prioridad: la ficha de Icecat si existe. Si no, se arma una BÁSICA con los datos
     * que sí manda Exel del Norte (marca, tipo, claves, código de barras, clave SAT).
     * Exel no expone especificaciones técnicas en su API —lo único cercano es
     * `descripcion_extendida`, y solo la trae el 22% del catálogo—, así que sin este
     * respaldo la mayoría de las fichas saldrían sin ningún dato del producto.
     * Cuando Icecat enriquezca ese producto, su ficha completa toma el lugar de ésta.
     */
    public static function specs(array $row): array
    {
        $s = !empty($row['specs_json']) ? json_decode((string) $row['specs_json'], true) : null;
        if (is_array($s) && isset($s['specs'])) $s = $s['specs'];
        if (is_array($s) && $s) return $s;

        /* Respaldo con datos del proveedor. Solo se listan los que traen valor. */
        $basica = [
            'Marca'            => trim((string) ($row['brand'] ?? '')),
            'Tipo'             => trim((string) ($row['subcategory'] ?? '')),
            'Categoría'        => trim((string) ($row['category'] ?? '')),
            'Clave'            => trim((string) ($row['sku'] ?? '')),
            'Código de barras' => trim((string) ($row['barcode'] ?? '')),
            'Clave SAT'        => trim((string) ($row['sat_code'] ?? '')),
        ];
        $out = [];
        foreach ($basica as $name => $value) {
            if ($value !== '') $out[] = ['name' => $name, 'value' => $value];
        }
        return $out;
    }

    /** Precio de lista (con IVA incluido) y precio tachado si está en oferta. */
    public static function price(array $row): float
    {
        return round((float) $row['price'] * self::IVA_LISTA, 2);
    }
    public static function oldPrice(array $row): ?float
    {
        $old = (float) ($row['old_price'] ?? 0);
        return ($old > (float) $row['price']) ? round($old * self::IVA_LISTA, 2) : null;
    }

    /**
     * Trozo de URL legible a partir del nombre: "Tóner HP 85A negro" → "toner-hp-85a-negro".
     * Sin acentos ni signos, para que la URL se lea bien y Google la entienda.
     */
    public static function slug(string $name): string
    {
        /* Mapa explicito en vez de iconv('ASCII//TRANSLIT'): TRANSLIT depende de la
           libreria del sistema y NO da el mismo resultado en todas partes. En Windows
           devuelve "T'oner" y "Ni~no" (mete apostrofo/virgulilla), que el limpiador de
           abajo convierte en guion: quedaba "t-oner", "ni-no". En Linux suele salir
           limpio, asi que la MISMA ficha tendria una URL distinta segun donde se
           calcule. Con el mapa el resultado es identico en local y en el servidor.
           Se arregla ahora que el catalogo real (nombres en espanol, llenos de
           acentos) todavia no esta indexado: mas adelante cambiar los slugs
           romperia enlaces ya publicados. */
        $s = strtr($name, [
            'á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n',
            'Á'=>'a','É'=>'e','Í'=>'i','Ó'=>'o','Ú'=>'u','Ü'=>'u','Ñ'=>'n',
            'à'=>'a','è'=>'e','ì'=>'i','ò'=>'o','ù'=>'u',
            'â'=>'a','ê'=>'e','î'=>'i','ô'=>'o','û'=>'u',
            'ç'=>'c','Ç'=>'c','º'=>'','ª'=>'','°'=>'',
        ]);
        $s = strtolower($s);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s);
        $s = trim((string) $s, '-');
        return $s !== '' ? substr($s, 0, 70) : 'producto';
    }

    /** URL canónica del producto: /producto/49-toner-hp-85a-negro */
    public static function url(int $id, string $name): string
    {
        return '/producto/' . $id . '-' . self::slug($name);
    }

    /**
     * Productos relacionados: de la MISMA subcategoría primero y, si no llenan, del
     * resto de su categoría. Solo con existencia y nunca él mismo.
     */
    public static function related(PDO $pdo, array $row, int $limit = 6): array
    {
        $st = $pdo->prepare(
            "SELECT id, name, brand, price, old_price, stock, subcategory
               FROM products
              WHERE is_active = 1 AND stock > 0 AND id <> ? AND category = ?
              ORDER BY (subcategory = ?) DESC, (old_price > price) DESC, stock DESC
              LIMIT " . (int) $limit
        );
        $st->execute([(int) $row['id'], (string) $row['category'], (string) ($row['subcategory'] ?? '')]);
        $rows = $st->fetchAll();
        if (!$rows) return [];

        // Imagen principal de todos, en una sola consulta.
        $ids = array_column($rows, 'id');
        $in  = implode(',', array_fill(0, count($ids), '?'));
        $sti = $pdo->prepare(
            "SELECT product_id, COALESCE(stored_path, url) AS src
               FROM product_images WHERE is_primary = 1 AND product_id IN ($in)"
        );
        $sti->execute($ids);
        $img = [];
        foreach ($sti->fetchAll() as $r) $img[(int) $r['product_id']] = $r['src'];

        return array_map(function ($r) use ($img) {
            return [
                'id'    => (int) $r['id'],
                'name'  => $r['name'],
                'brand' => $r['brand'],
                'price' => self::price($r),
                'old'   => self::oldPrice($r),
                'stock' => (int) $r['stock'],
                'image' => $img[(int) $r['id']] ?? null,
                'url'   => self::url((int) $r['id'], (string) $r['name']),
            ];
        }, $rows);
    }
}

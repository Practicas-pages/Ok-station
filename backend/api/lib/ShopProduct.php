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

    /** Imágenes del producto: la principal primero. Prefiere la copia local descargada. */
    public static function images(PDO $pdo, int $productId): array
    {
        $st = $pdo->prepare(
            "SELECT COALESCE(stored_path, url) AS src
               FROM product_images WHERE product_id = ?
              ORDER BY is_primary DESC, sort_order ASC, id ASC"
        );
        $st->execute([$productId]);
        return array_values(array_filter(array_column($st->fetchAll(), 'src')));
    }

    /** Ficha técnica normalizada. specs_json puede venir como {source,specs:[…]} o como lista. */
    public static function specs(array $row): array
    {
        $s = !empty($row['specs_json']) ? json_decode((string) $row['specs_json'], true) : null;
        if (is_array($s) && isset($s['specs'])) $s = $s['specs'];
        return is_array($s) ? $s : [];
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
        $s = $name;
        if (function_exists('iconv')) {
            $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
            if ($t !== false) $s = $t;
        }
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

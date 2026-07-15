<?php
/**
 * Catálogo de la tienda EN EL SERVIDOR — fuente de verdad del PRECIO.
 * Espejo de assets/catalogo.js (window.OK_PRODUCTS). El navegador NUNCA fija el
 * precio: shop/create.php resuelve cada id contra este arreglo.
 *
 * PRECIO DE VENTA = costo × (1 + margen) + IVA (por geolocalización).
 *   · 'cost'  = costo del proveedor (base para el margen).
 *   · margen  = 30% (factor 1.30), configurable en settings.shop_margin.
 *   · 'price' = precio de LISTA con IVA 8% incluido (Baja California), ya calculado
 *               con el margen. Es el que se muestra en la tienda; el IVA se ajusta
 *               a 16% en el checkout si el envío sale de BC.
 * Si cambias un precio, cámbialo AQUÍ y en assets/catalogo.js (mismo id/sku/price).
 * Cuando el runner del proveedor llene la tabla real, usará listPrice(cost).
 */
final class ShopCatalog
{
    /** Margen por defecto si no está en settings (30% → factor 1.30). */
    const DEFAULT_MARGIN = 1.30;

    /** [id => ['sku','name','cost','price']]  cost = costo proveedor; price = lista IVA 8% incl. */
    const PRODUCTS = [
        1  => ['sku' => 'CON-TON105', 'name' => 'Tóner HP 105A Negro',        'cost' => 918.80, 'price' => 1290],
        2  => ['sku' => 'CON-CAN145', 'name' => 'Cartucho Canon 145 Negro',   'cost' => 277.07, 'price' => 389],
        3  => ['sku' => 'CON-BOND500','name' => 'Hojas Bond carta (500)',      'cost' => 96.15,  'price' => 135],
        4  => ['sku' => 'CON-PFOTO',  'name' => 'Papel fotográfico Gloss',     'cost' => 128.21, 'price' => 180],
        5  => ['sku' => 'PAP-CU100',  'name' => 'Cuaderno profesional',        'cost' => 42.02,  'price' => 59],
        6  => ['sku' => 'PAP-BIC12',  'name' => 'Bolígrafos BIC (caja 12)',    'cost' => 53.42,  'price' => 75],
        7  => ['sku' => 'PAP-FOL25',  'name' => 'Folders carta (paq. 25)',     'cost' => 63.39,  'price' => 89],
        8  => ['sku' => 'PAP-CINTA',  'name' => 'Cinta adhesiva',              'cost' => 15.67,  'price' => 22],
        9  => ['sku' => 'ACC-USB64',  'name' => 'Memoria USB 64 GB',           'cost' => 113.25, 'price' => 159],
        10 => ['sku' => 'ACC-MOU01',  'name' => 'Mouse inalámbrico',           'cost' => 163.11, 'price' => 229],
        11 => ['sku' => 'COM-REG08',  'name' => 'Regulador 8 tomas',           'cost' => 355.41, 'price' => 499],
        12 => ['sku' => 'COM-AUD05',  'name' => 'Audífonos con micrófono',     'cost' => 248.58, 'price' => 349],
    ];

    /** Costo de envío a domicilio (MXN). El cliente NO lo fija. */
    const SHIP_COST = 99.0;

    public static function find(int $id): ?array
    {
        return self::PRODUCTS[$id] ?? null;
    }

    /** Margen configurable (settings.shop_margin), p. ej. 1.30 = 30%. */
    public static function margin(): float
    {
        try {
            $row = db()->query("SELECT `value` FROM settings WHERE `key`='shop_margin'")->fetch();
            $m = $row ? (float) $row['value'] : self::DEFAULT_MARGIN;
        } catch (Throwable $e) { $m = self::DEFAULT_MARGIN; }
        return ($m >= 1.0 && $m <= 5.0) ? $m : self::DEFAULT_MARGIN;   // sanidad
    }

    /** Precio de venta NETO (sin IVA) = costo × margen. Aquí vive el 30% de utilidad. */
    public static function baseFor(float $cost): float
    {
        return round($cost * self::margin(), 2);
    }

    /** Precio de LISTA con IVA aplicado = costo × margen × (1 + IVA). */
    public static function listPrice(float $cost, float $ivaRate): float
    {
        return round(self::baseFor($cost) * (1 + $ivaRate), 2);
    }

    /**
     * Resuelve un producto para el CARRITO priorizando el catálogo REAL (tabla
     * `products`, que llena el runner de Exel) y cayendo al catálogo de demostración
     * (PRODUCTS) si el id no está en la BD. Así la tienda sigue funcionando aunque el
     * catálogo real todavía esté vacío (sin la API key de Exel).
     * @return array{id:int,sku:string,name:string,base:float,stock:?int}|null
     *   base  = precio SIN IVA (costo × margen).  stock = null → demo sin inventario.
     */
    public static function resolve(int $id): ?array
    {
        // 1) Catálogo real (products). `price` ya es costo × margen (sin IVA).
        try {
            $st = db()->prepare('SELECT id, sku, name, price, stock FROM products WHERE id = ? AND is_active = 1 LIMIT 1');
            $st->execute([$id]);
            if ($r = $st->fetch()) {
                return [
                    'id'    => (int) $r['id'],
                    'sku'   => (string) $r['sku'],
                    'name'  => (string) $r['name'],
                    'base'  => round((float) $r['price'], 2),
                    'stock' => (int) $r['stock'],
                ];
            }
        } catch (Throwable $e) { /* si `products` aún no existe, se usa el demo */ }

        // 2) Catálogo de demostración (hardcodeado). base = costo × margen.
        $p = self::find($id);
        if (!$p) return null;
        return [
            'id'    => $id,
            'sku'   => (string) $p['sku'],
            'name'  => (string) $p['name'],
            'base'  => self::baseFor((float) $p['cost']),
            'stock' => null,   // el demo no controla inventario (siempre disponible)
        ];
    }

    /** Desglose de precio de un producto (para el panel/auditoría del margen). */
    public static function pricingFor(int $id): ?array
    {
        $p = self::find($id);
        if (!$p) return null;
        $cost = (float) ($p['cost'] ?? 0);
        $base = self::baseFor($cost);
        return [
            'id'         => $id,
            'sku'        => $p['sku'],
            'name'       => $p['name'],
            'cost'       => round($cost, 2),
            'margin'     => self::margin(),
            'margin_pct' => $cost > 0 ? round(($base / $cost - 1) * 100, 1) : 0,
            'base'       => $base,                        // venta sin IVA (con el 30%)
            'price_8'    => self::listPrice($cost, 0.08), // BC
            'price_16'   => self::listPrice($cost, 0.16), // nacional
        ];
    }
}

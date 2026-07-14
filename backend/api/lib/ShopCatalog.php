<?php
/**
 * Catálogo de la tienda EN EL SERVIDOR — fuente de verdad del PRECIO.
 * Espejo de assets/catalogo.js (window.OK_PRODUCTS). El navegador NUNCA fija el
 * precio: shop/create.php resuelve cada id contra este arreglo. Si cambias un
 * precio, cámbialo AQUÍ y en assets/catalogo.js (mismo id/sku/precio).
 */
final class ShopCatalog
{
    /** [id => ['sku','name','price']]  (precio IVA incluido, en MXN) */
    const PRODUCTS = [
        1  => ['sku' => 'CON-TON105', 'name' => 'Tóner HP 105A Negro',        'price' => 1290],
        2  => ['sku' => 'CON-CAN145', 'name' => 'Cartucho Canon 145 Negro',   'price' => 389],
        3  => ['sku' => 'CON-BOND500','name' => 'Hojas Bond carta (500)',      'price' => 135],
        4  => ['sku' => 'CON-PFOTO',  'name' => 'Papel fotográfico Gloss',     'price' => 180],
        5  => ['sku' => 'PAP-CU100',  'name' => 'Cuaderno profesional',        'price' => 59],
        6  => ['sku' => 'PAP-BIC12',  'name' => 'Bolígrafos BIC (caja 12)',    'price' => 75],
        7  => ['sku' => 'PAP-FOL25',  'name' => 'Folders carta (paq. 25)',     'price' => 89],
        8  => ['sku' => 'PAP-CINTA',  'name' => 'Cinta adhesiva',              'price' => 22],
        9  => ['sku' => 'ACC-USB64',  'name' => 'Memoria USB 64 GB',           'price' => 159],
        10 => ['sku' => 'ACC-MOU01',  'name' => 'Mouse inalámbrico',           'price' => 229],
        11 => ['sku' => 'COM-REG08',  'name' => 'Regulador 8 tomas',           'price' => 499],
        12 => ['sku' => 'COM-AUD05',  'name' => 'Audífonos con micrófono',     'price' => 349],
    ];

    /** Costo de envío a domicilio (MXN). El cliente NO lo fija. */
    const SHIP_COST = 99.0;

    public static function find(int $id): ?array
    {
        return self::PRODUCTS[$id] ?? null;
    }
}

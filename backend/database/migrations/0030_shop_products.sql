-- 0030 — Catálogo de productos de la TIENDA (e-commerce de productos físicos).
-- Fuente de datos: API del proveedor Exel del Norte (api01.exeldelnorte.com.mx).
-- Cierra el hueco de la 0027: shop_order_items.product_id ya apuntaba a un
-- catálogo que no existía; esta tabla ES ese catálogo. Cambios ADITIVOS.
-- Diseño multi-proveedor (exel/syscom/local) para reusar el runner a futuro.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,

  -- ── Origen / proveedor ──
  supplier       ENUM('exel','syscom','local') NOT NULL DEFAULT 'exel',
  supplier_ref   VARCHAR(60)     NOT NULL,          -- Exel 'referencia' (No. Parte / llave de relación)
  supplier_id    VARCHAR(40)     NULL,              -- Exel 'id' (id interno numérico del proveedor)
  sku            VARCHAR(60)     NULL,              -- Exel 'sku' (SKU interno del proveedor)
  barcode        VARCHAR(20)     NULL,              -- Exel 'codigo_barras' (UPC/EAN; puede venir mal-formado)
  sat_code       VARCHAR(15)     NULL,              -- Exel 'codigo_sat' (ClaveProdServ SAT, para CFDI)

  -- ── Contenido (lo que ve el cliente) ──
  name           VARCHAR(255)    NOT NULL,          -- Exel 'nombre' (descripción corta)
  description    TEXT            NULL,              -- Exel 'descripcion_extendida' (descripción larga)
  specs_json     JSON            NULL,              -- Especificaciones técnicas (Icecat / ficha técnica Exel)
  brand          VARCHAR(120)    NULL,              -- Exel 'marca_nombre'
  category       VARCHAR(120)    NULL,              -- Exel 'categoria_nombre'
  subcategory    VARCHAR(120)    NULL,              -- Exel 'subcategoria_nombre'

  -- ── Precio / moneda ──
  currency       CHAR(3)         NOT NULL DEFAULT 'MXN',   -- Exel 'moneda'
  cost           DECIMAL(12,6)   NOT NULL DEFAULT 0,       -- Exel 'precio' (COSTO proveedor, 6 decimales)
  price          DECIMAL(10,2)   NOT NULL DEFAULT 0,       -- Precio público SIN IVA = cost × margen (settings.shop_margin, 1.30).
                                                           --   El IVA (8%/16%) se aplica por geo en el checkout (no se guarda aquí).
  prev_cost      DECIMAL(12,6)   NULL,                     -- Costo anterior → detectar fluctuación >3% (regla de la junta)

  -- ── Inventario ──
  stock          INT             NOT NULL DEFAULT 0,       -- Exel 'stock'. Vendemos SOLO del almacén 4;
                                                           --   el stock en vivo se revalida con POST productos por almacenes.
  warehouse_id   VARCHAR(20)     NOT NULL DEFAULT '4',     -- Almacén de venta (decisión: solo almacén 4)

  -- ── Imágenes / enriquecimiento ──
  image_source   ENUM('icecat','exel','none') NOT NULL DEFAULT 'none',  -- de dónde se "vistió" el producto
  enriched_at    TIMESTAMP       NULL,                     -- cuándo corrió Icecat sobre este producto

  -- ── Estado / control del runner ──
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,       -- publicado en la tienda
  is_papeleria   TINYINT(1)      NOT NULL DEFAULT 1,       -- pasó el filtro de papelería
  last_synced_at TIMESTAMP       NULL,                     -- última vez que el runner lo tocó
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_products_supplier_ref (supplier, supplier_ref),  -- llave natural del UPSERT masivo
  KEY idx_products_sku (sku),
  KEY idx_products_barcode (barcode),
  KEY idx_products_brand (brand),
  KEY idx_products_cat (category, subcategory),
  KEY idx_products_active (is_active),
  KEY idx_products_stock (stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Imágenes del producto — normalizado, MÁX 5 por producto (el límite lo aplica el runner).
CREATE TABLE IF NOT EXISTS product_images (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  INT UNSIGNED    NOT NULL,
  url         VARCHAR(500)    NULL,                  -- URL origen (Icecat/Exel)
  stored_path VARCHAR(255)    NULL,                  -- ruta local tras descargar al servidor
  source      ENUM('icecat','exel') NOT NULL DEFAULT 'icecat',
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_primary  TINYINT(1)      NOT NULL DEFAULT 0,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pimg_product (product_id),
  CONSTRAINT fk_pimg_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nota: shop_order_items.product_id (0027) se deja SIN FK a propósito: es un
-- snapshot del catálogo al momento de la compra (el catálogo puede cambiar/borrarse).

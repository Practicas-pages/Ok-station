-- 0027 — Pedidos de la TIENDA (e-commerce de productos físicos).
-- Dominio separado de `orders` (que es de impresión). Reusa el motor de pagos
-- (Payments.php $kind='shop') y payment_logs (se le añade shop_order_id).
-- Cambios ADITIVOS: no toca orders/appointments; el pago de pedidos/citas sigue intacto.
SET NAMES utf8mb4;

-- ── Cabecera del pedido de tienda ──
CREATE TABLE IF NOT EXISTS shop_orders (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  code          VARCHAR(20)     NOT NULL,
  status        ENUM('recibido','en_preparacion','listo','entregado','cancelado')
                                NOT NULL DEFAULT 'recibido',
  ship_mode     ENUM('retiro','envio') NOT NULL DEFAULT 'retiro',
  ship_cost     DECIMAL(10,2)   NOT NULL DEFAULT 0,
  ship_address  VARCHAR(400)    NULL,
  subtotal      DECIMAL(10,2)   NOT NULL DEFAULT 0,     -- base sin IVA (desglosado)
  tax           DECIMAL(10,2)   NOT NULL DEFAULT 0,     -- IVA (desglosado del total incluido)
  total         DECIMAL(10,2)   NOT NULL DEFAULT 0,     -- IVA incluido + envío
  contact_phone VARCHAR(40)     NULL,
  comments      TEXT            NULL,
  staff_notes   TEXT            NULL,
  -- Campos de pago (espejo EXACTO de orders 0008) --
  payment_status ENUM('pendiente','procesando','pagado','error','reembolsado')
                                NOT NULL DEFAULT 'pendiente',
  payment_provider       VARCHAR(40)   NULL,
  payment_reference      VARCHAR(100)  NULL,
  payment_amount         DECIMAL(10,2) NULL,
  payment_date           TIMESTAMP     NULL,
  payment_transaction_id VARCHAR(190)  NULL,
  entregado_at  TIMESTAMP       NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_orders_code (code),
  KEY idx_shop_orders_user (user_id),
  KEY idx_shop_orders_status (status),
  KEY idx_shop_orders_payment_status (payment_status),
  KEY idx_shop_orders_payment_reference (payment_reference),
  KEY idx_shop_orders_created (created_at),
  CONSTRAINT fk_shop_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Ítems con "foto" del producto (el catálogo puede cambiar) ──
CREATE TABLE IF NOT EXISTS shop_order_items (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_order_id BIGINT UNSIGNED NOT NULL,
  product_id    INT UNSIGNED    NULL,          -- id del catálogo al momento (referencia)
  product_sku   VARCHAR(60)     NULL,
  product_name  VARCHAR(160)    NOT NULL,
  unit_price    DECIMAL(10,2)   NOT NULL DEFAULT 0,   -- IVA incluido, snapshot del precio
  qty           INT UNSIGNED    NOT NULL DEFAULT 1,
  line_total    DECIMAL(10,2)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_soi_order (shop_order_id),
  CONSTRAINT fk_soi_order FOREIGN KEY (shop_order_id) REFERENCES shop_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bitácora de pagos: tercera FK polimórfica (pedido | cita | tienda) ──
ALTER TABLE payment_logs
  ADD COLUMN shop_order_id BIGINT UNSIGNED NULL AFTER appointment_id,
  ADD KEY idx_plog_shop (shop_order_id),
  ADD CONSTRAINT fk_plog_shop FOREIGN KEY (shop_order_id) REFERENCES shop_orders(id) ON DELETE CASCADE;

-- ── Permisos del panel para la tienda (heredados por administrador/directivo/empleado) ──
INSERT INTO permissions (slug, name) VALUES
  ('shop.view','Ver pedidos de tienda'),
  ('shop.update_status','Actualizar pedidos de tienda')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.slug IN ('administrador','directivo','empleado')
   AND p.slug IN ('shop.view','shop.update_status')
ON DUPLICATE KEY UPDATE role_id = role_id;

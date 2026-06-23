-- 0008 — Pago en línea de pedidos (campos en orders + bitácora de auditoría)
-- Se integra al flujo de pedidos existente. No crea tablas nuevas de pedidos:
-- solo extiende `orders` con el estado del pago y agrega `payment_logs` (auditoría).
SET NAMES utf8mb4;

-- ── Campos de pago en la tabla de pedidos ──
ALTER TABLE orders
  ADD COLUMN payment_status ENUM('pendiente','procesando','pagado','error','reembolsado')
                            NOT NULL DEFAULT 'pendiente' AFTER total,
  ADD COLUMN payment_provider       VARCHAR(40)   NULL AFTER payment_status,
  ADD COLUMN payment_reference      VARCHAR(100)  NULL AFTER payment_provider,
  ADD COLUMN payment_amount         DECIMAL(10,2) NULL AFTER payment_reference,
  ADD COLUMN payment_date           TIMESTAMP     NULL AFTER payment_amount,
  ADD COLUMN payment_transaction_id VARCHAR(190)  NULL AFTER payment_date,
  ADD KEY idx_orders_payment_status (payment_status),
  ADD KEY idx_orders_payment_reference (payment_reference);

-- ── Bitácora de pagos (auditoría: quién/qué/cuándo cambió el estado del pago) ──
CREATE TABLE IF NOT EXISTS payment_logs (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(20)     NULL,                 -- estado de pago anterior
  payment_status  VARCHAR(20)     NOT NULL,             -- estado de pago nuevo
  provider        VARCHAR(40)     NULL,
  reference       VARCHAR(100)    NULL,
  transaction_id  VARCHAR(190)    NULL,
  amount          DECIMAL(10,2)   NULL,
  source          ENUM('cliente','webhook','admin','sistema') NOT NULL DEFAULT 'sistema',
  updated_by      BIGINT UNSIGNED NULL,                 -- usuario que originó el cambio (NULL = webhook/sistema)
  meta_json       JSON            NULL,
  ip              VARCHAR(45)     NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plog_order (order_id),
  KEY idx_plog_status (payment_status),
  CONSTRAINT fk_plog_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_plog_user  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

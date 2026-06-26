-- 0016 — Pago en línea del ANTICIPO de citas (anticipo 100% según trámite).
-- Reusa el mismo motor de pagos de los pedidos:
--   - Extiende `appointments` con el monto y el estado de pago (espejo de `orders`).
--   - Generaliza `payment_logs` para que registre TAMBIÉN citas (no solo pedidos).
--   - Siembra el catálogo de precios por trámite en `settings` (editable sin tocar código).
-- Cambios ADITIVOS y retrocompatibles: el pago de pedidos sigue intacto.
SET NAMES utf8mb4;

-- ── 1) Monto + estado de pago en la cita (mismo ENUM que orders) ──
ALTER TABLE appointments
  ADD COLUMN amount_total           DECIMAL(10,2) NULL AFTER party_size,        -- precio_unitario × personas (autoridad del servidor)
  ADD COLUMN payment_status         ENUM('pendiente','procesando','pagado','error','reembolsado')
                                     NOT NULL DEFAULT 'pendiente' AFTER amount_total,
  ADD COLUMN payment_provider       VARCHAR(40)   NULL AFTER payment_status,
  ADD COLUMN payment_reference      VARCHAR(100)  NULL AFTER payment_provider,
  ADD COLUMN payment_amount         DECIMAL(10,2) NULL AFTER payment_reference,
  ADD COLUMN payment_date           TIMESTAMP     NULL AFTER payment_amount,
  ADD COLUMN payment_transaction_id VARCHAR(190)  NULL AFTER payment_date,
  ADD KEY idx_appt_payment_status (payment_status),
  ADD KEY idx_appt_payment_reference (payment_reference);

-- ── 2) Bitácora de pagos polimórfica: pedido O cita ──
-- order_id pasa a ser NULL (un log es de un pedido o de una cita, nunca de ambos).
ALTER TABLE payment_logs
  MODIFY order_id BIGINT UNSIGNED NULL,
  ADD COLUMN appointment_id BIGINT UNSIGNED NULL AFTER order_id,
  ADD KEY idx_plog_appt (appointment_id),
  ADD CONSTRAINT fk_plog_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

-- ── 3) Catálogo de precios por trámite (MXN, por persona, IVA incluido) ──
-- Clave por trámite; pasaporte se distingue por subtipo. Los trámites NO listados
-- (pasaporte americano, i94, licencia, apostille, médica) se COTIZAN (no cobran en línea).
-- Editable desde el panel (endpoint admin/appointment-settings.php) sin redeploy.
-- ON DUPLICATE ... = value: si ya existe (re-seed), respeta lo que el admin haya ajustado.
INSERT INTO settings (`key`, `value`) VALUES
  ('appt.prices', '{"pasaporte_mexicano":200,"visa":800,"sentri":900,"ine":80,"curp":35}')
ON DUPLICATE KEY UPDATE `value` = `value`;

-- Permiso para gestionar precios (lo hereda el administrador; reusa settings.manage si existe).
INSERT INTO permissions (slug, name) VALUES
  ('appointments.pricing','Gestionar precios de trámites')
ON DUPLICATE KEY UPDATE name = VALUES(name);
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug='administrador' AND p.slug='appointments.pricing'
ON DUPLICATE KEY UPDATE role_id = role_id;

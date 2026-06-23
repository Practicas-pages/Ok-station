-- 0009 — Fecha de ENTREGA del pedido.
-- Permite que el corte de caja cuente la venta por el día en que realmente se
-- entregó/cobró (no por la fecha de creación del pedido).
SET NAMES utf8mb4;

ALTER TABLE orders
  ADD COLUMN entregado_at TIMESTAMP NULL AFTER status,
  ADD KEY idx_orders_entregado_at (entregado_at);

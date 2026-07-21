-- 0033 — Recibo/ticket PDF de compras de la TIENDA (e-commerce).
-- Espejo de orders.ticket_path (0002): el recibo se genera en el cliente tras el
-- pago exitoso, se guarda vía shop/ticket-store.php y se sirve con shop/ticket.php.
SET NAMES utf8mb4;

ALTER TABLE shop_orders
  ADD COLUMN ticket_path VARCHAR(255) NULL AFTER staff_notes;

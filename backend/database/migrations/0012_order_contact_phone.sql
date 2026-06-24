-- 0012 — Pedidos: teléfono de contacto del cliente.
-- Lo usan las trabajadoras para contactar por WhatsApp a quien hizo el pedido.
-- Cambio ADITIVO y retrocompatible (el código usa table_has_column).
SET NAMES utf8mb4;

ALTER TABLE orders
  ADD COLUMN contact_phone VARCHAR(30) NULL AFTER comments;

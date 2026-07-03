-- 0022 — Pedidos: cotización (precio a fijar por la trabajadora).
-- `needs_quote` marca un pedido cuyo precio NO se pudo calcular solo (p. ej.
-- gran formato): queda "por cotizar". `quoted_at` guarda cuándo la trabajadora
-- fijó el precio final desde el panel (y avisó al cliente por correo).
-- Cambio ADITIVO y retrocompatible (el código usa table_has_column).
SET NAMES utf8mb4;

ALTER TABLE orders
  ADD COLUMN needs_quote TINYINT(1) NOT NULL DEFAULT 0    AFTER total,
  ADD COLUMN quoted_at   TIMESTAMP  NULL     DEFAULT NULL AFTER needs_quote;

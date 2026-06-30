-- 0019 — Agrega el precio de la cita de Pasaporte Americano ($400 = formato $200 + cita)
-- al catálogo editable `appt.prices`. El default ya está en Pricing.php; esto deja la
-- clave visible/editable desde el panel y consistente con la semilla.
-- Idempotente: reescribe el JSON completo del setting con todas las claves vigentes.
SET NAMES utf8mb4;

INSERT INTO settings (`key`, `value`) VALUES
  ('appt.prices', '{"pasaporte_mexicano":200,"pasaporte_americano":400,"visa":800,"sentri":900,"ine":80,"curp":35}')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

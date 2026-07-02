-- 0021 — Agrega los precios de cita de I-94 ($200) y Licencia de conducir ($40)
-- al catálogo editable `appt.prices`. El default ya está en Pricing.php; esto deja
-- las claves visibles/editables desde el panel y consistentes con la semilla, y
-- permite cobrarlas en línea (Mercado Pago) al tener precio fijo.
-- Idempotente: reescribe el JSON completo del setting con todas las claves vigentes.
SET NAMES utf8mb4;

INSERT INTO settings (`key`, `value`) VALUES
  ('appt.prices', '{"pasaporte_mexicano":200,"pasaporte_americano":400,"visa":800,"sentri":900,"ine":80,"curp":35,"i94":200,"licencia":40}')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

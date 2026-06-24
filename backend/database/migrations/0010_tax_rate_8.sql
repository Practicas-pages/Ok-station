-- 0010 — IVA a 8 % en todo OK.station.
-- El ticket físico de mostrador desglosa "IVA 8%". Antes el seed dejaba
-- tax_rate=0.16, así que los servidores ya sembrados seguían cobrando 16 %.
-- Esta migración fuerza el valor correcto (idempotente: si no existe, lo crea).
SET NAMES utf8mb4;

INSERT INTO settings (`key`, `value`) VALUES ('tax_rate', '0.08')
  ON DUPLICATE KEY UPDATE `value` = '0.08';

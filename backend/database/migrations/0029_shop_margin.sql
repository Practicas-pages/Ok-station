-- 0029 — Margen de utilidad de la tienda (configurable, como el tax_rate).
-- Precio de venta = costo × (1 + margen) + IVA. OK.station: 30% → factor 1.30.
-- Se guarda en settings para poder ajustarlo sin tocar código.
INSERT INTO settings (`key`, `value`) VALUES ('shop_margin', '1.30')
ON DUPLICATE KEY UPDATE `key` = `key`;

-- 0031 — Precio anterior (tachado) para la categoría "Ofertas del día" de la tienda.
-- old_price lo fija OK.station (decisión propia de promoción), NO viene de Exel:
-- el runner exel-sync no toca esta columna, así las ofertas sobreviven cada sync.
-- Un producto está "en oferta" cuando old_price > price. Cambio ADITIVO.
SET NAMES utf8mb4;

ALTER TABLE products
  ADD COLUMN old_price DECIMAL(10,2) NULL AFTER price;

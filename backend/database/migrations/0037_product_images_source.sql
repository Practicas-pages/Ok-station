-- ============================================================================
-- 0037 — `product_images.source` deja de ser ENUM y pasa a VARCHAR(32)
-- ----------------------------------------------------------------------------
-- El panel ya permite que una PERSONA elija a mano la imagen de un producto entre
-- varias fuentes (Icecat, páginas de fabricante, etc.). Con
-- ENUM('icecat','exel') solo caben dos orígenes, así que una foto tomada del sitio
-- de 3M habría que guardarla como 'icecat' — mintiendo sobre su procedencia, que es
-- justo el dato que hay que poder auditar después.
--
-- Se adopta el MISMO criterio que ya tomó `product_enrichment.source` en la 0036:
--   "Texto y no ENUM a propósito: cada marca nueva sería una migración, y van a ir
--    apareciendo de a poco."
-- Así ambas tablas hablan el mismo idioma ('icecat', 'exel', 'fabricante:3m',
-- 'manual'…) y se pueden cruzar sin traducir.
--
-- ADITIVA Y REVERSIBLE: los valores que ya existen ('icecat', 'exel') siguen siendo
-- válidos tal cual y ninguna fila cambia. Para deshacer, basta con volver al ENUM
-- (siempre que no se hayan guardado orígenes nuevos).
-- ============================================================================

ALTER TABLE product_images
  MODIFY COLUMN source VARCHAR(32) NOT NULL DEFAULT 'icecat';

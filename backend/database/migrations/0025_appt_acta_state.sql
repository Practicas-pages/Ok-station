-- 0025 — Acta de Nacimiento como trámite propio, con precio por ESTADO.
-- Cambios ADITIVOS y retrocompatibles:
--  1) Columna acta_state en appointments (el estado elegido). create.php usa
--     table_has_column, así que funciona aunque esta migración no se haya corrido:
--     el cobro ya es correcto vía amount_total; solo faltaría registrar el estado.
--  2) Siembra el catálogo editable `appt.acta_prices` (mismos valores que Pricing.php)
--     para poder ajustar los precios desde el panel sin tocar código.
SET NAMES utf8mb4;

-- Estado de registro del acta (slug, p. ej. "jalisco"). Solo aplica al trámite acta.
ALTER TABLE appointments
  ADD COLUMN acta_state VARCHAR(40) NULL AFTER passport_subtype;

-- Catálogo de precios del acta por estado (MXN, IVA incluido). Idempotente.
INSERT INTO settings (`key`, `value`) VALUES
  ('appt.acta_prices', '{"aguascalientes":335,"baja_california":345,"baja_california_sur":345,"campeche":275,"chiapas":345,"chihuahua":325,"ciudad_de_mexico":300,"coahuila":370,"colima":305,"durango":345,"guanajuato":305,"guerrero":335,"hidalgo":335,"jalisco":305,"mexico":275,"michoacan":355,"morelos":310,"nayarit":285,"nuevo_leon":275,"oaxaca":325,"puebla":340,"queretaro":335,"quintana_roo":265,"san_luis_potosi":320,"sinaloa":320,"sonora":320,"tabasco":310,"tamaulipas":310,"tlaxcala":355,"veracruz":385,"yucatan":400,"zacatecas":365}')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

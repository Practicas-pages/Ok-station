-- 0020 — Precios de IMPRESIÓN editables desde el panel (settings `print.prices`).
-- Default = catálogo Hoja2 (idéntico a Pricing::PRINT_DEFAULTS). Si el setting no existe,
-- Pricing.php usa esos mismos defaults, así que NO cambia el comportamiento actual.
-- INSERT IGNORE: nunca sobrescribe ediciones del admin si la migración se reaplica.
SET NAMES utf8mb4;

INSERT IGNORE INTO settings (`key`, `value`) VALUES
  ('print.prices', '{"carta_bn_1":2,"carta_bn_2":1.5,"carta_bn_3":1.3,"carta_color_1":12,"carta_color_2":9,"carta_color_3":5,"oficio_bn_1":2.5,"oficio_bn_2":2,"oficio_bn_3":1.5,"oficio_color_1":15,"oficio_color_2":13,"oficio_color_3":10,"tabloide_bn":5,"tabloide_color":20,"foto_10x15":10,"foto_13x18":30,"enmicado_carta":20,"enmicado_tabloide":30,"engargolado":45}');

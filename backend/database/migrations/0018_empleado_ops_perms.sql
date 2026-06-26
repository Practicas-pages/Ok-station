-- 0018 — Garantiza que el rol 'empleado' pueda operar Pedidos, Citas y Reseñas.
-- Refuerzo idempotente: los grants ya existen (0004_seed para pedidos/reseñas,
-- 0006_appointments para citas), pero esto asegura que NINGÚN empleado quede sin
-- acceso a esas secciones por un seed parcial o un orden de importación distinto.
-- No otorga estadísticas/usuarios/reportes (esos siguen restringidos a admin/directivo).
SET NAMES utf8mb4;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.slug = 'empleado'
   AND p.slug IN ('orders.view','orders.update_status','orders.edit','orders.notes',
                  'appointments.view','appointments.update_status',
                  'reviews.moderate')
ON DUPLICATE KEY UPDATE role_id = role_id;

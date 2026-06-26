-- 0017 — El rol 'empleado' deja de ver estadísticas/ventas/reportes.
-- Política: el empleado gestiona pedidos/citas/reseñas, pero NO ve ventas,
-- usuarios (sección), ni reportes. Quita el permiso 'stats.view' de empleado.
-- Con esto, reports.php (require_permission stats.view) y los datos financieros
-- del dashboard quedan bloqueados para empleado, sin tocar admin/directivo.
-- Idempotente: si ya no lo tiene, no hace nada.
SET NAMES utf8mb4;

DELETE rp FROM role_permissions rp
  JOIN roles r       ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
 WHERE r.slug = 'empleado'
   AND p.slug = 'stats.view';

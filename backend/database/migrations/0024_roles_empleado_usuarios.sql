-- 0024 — Roles bien establecidos: el EMPLEADO ve Usuarios en SOLO LECTURA.
-- ============================================================================
-- Política de roles (jul 2026):
--   · Cliente      → sin panel administrativo (solo el sitio público).
--   · Empleado     → ve el panel; la pestaña Usuarios en SOLO LECTURA (lista +
--                    historial, sin desactivar cuentas ni cambiar roles); SÍ ve y
--                    edita Precios; lo ÚNICO vetado es Reportes.
--   · Administrador y Directivo → acceso total.
--
-- El listado de usuarios (users.php) ahora exige el permiso 'users.view' (no un
-- rol), y el empleado lo tiene. Precios/config (settings.manage) SÍ lo tiene el
-- empleado. Desactivar cuentas (users.deactivate) y ver reportes/estadísticas
-- (stats.view) quedan fuera de su alcance. Idempotente.
-- ============================================================================

-- (1) Garantiza que el empleado PUEDE ver usuarios (lista + user-detail.php) y
--     gestionar precios/configuración (pantalla de Precios y disponibilidad).
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p
 WHERE r.slug = 'empleado'
   AND p.slug IN ('users.view', 'settings.manage');

-- (2) Quita del empleado los permisos que NO debe tener
--     (por si algún entorno los sembró en el pasado).
DELETE rp
  FROM role_permissions rp
  JOIN roles r        ON r.id = rp.role_id
  JOIN permissions p  ON p.id = rp.permission_id
 WHERE r.slug = 'empleado'
   AND p.slug IN ('users.deactivate', 'stats.view', 'employees.manage');

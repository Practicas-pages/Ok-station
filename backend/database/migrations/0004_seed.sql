-- 0004 — Semilla idempotente (roles, permisos, settings, catálogo)
SET NAMES utf8mb4;

INSERT INTO roles (slug, name, description) VALUES
  ('cliente',       'Cliente',       'Crea y consulta sus pedidos, edita su perfil y publica reseñas.'),
  ('empleado',      'Empleado',      'Gestiona pedidos, clientes y reseñas. Sin configuración crítica.'),
  ('administrador', 'Administrador', 'Acceso total a la plataforma.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO permissions (slug, name) VALUES
  ('orders.view','Ver pedidos'),
  ('orders.update_status','Actualizar estado de pedidos'),
  ('orders.edit','Editar pedidos'),
  ('orders.notes','Agregar notas internas'),
  ('users.view','Ver usuarios'),
  ('users.edit','Editar usuarios'),
  ('users.deactivate','Activar/desactivar cuentas'),
  ('services.manage','Gestionar servicios y precios'),
  ('reviews.moderate','Moderar reseñas'),
  ('settings.manage','Gestionar configuración'),
  ('employees.manage','Gestionar empleados'),
  ('stats.view','Ver estadísticas')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Empleado
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug='empleado'
  AND p.slug IN ('orders.view','orders.update_status','orders.edit','orders.notes','users.view','users.edit','reviews.moderate','stats.view')
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Administrador (todos)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug='administrador'
ON DUPLICATE KEY UPDATE role_id = role_id;

INSERT INTO settings (`key`, `value`) VALUES
  ('tax_rate','0.16'),
  ('currency','MXN'),
  ('business_name','OK.station'),
  ('whatsapp','5216641044896')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

INSERT INTO categories (slug, name, sort_order) VALUES
  ('impresion','Impresión y copias',1),
  ('fotografia','Fotografía',2),
  ('acabados','Acabados',3),
  ('papeleria','Papelería',4)
ON DUPLICATE KEY UPDATE name = VALUES(name);

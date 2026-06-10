-- ============================================================
-- OK.station — Datos semilla (roles, permisos, settings, catálogo)
-- Importar DESPUÉS de schema.sql.
-- Los administradores NO se fijan por correo en el código:
-- se asignan por rol en BD. Los correos "bootstrap" llegan por la
-- variable de entorno ADMIN_EMAILS (ver .env) y el backend asigna
-- el rol 'administrador' la primera vez que ese correo se registra.
-- ============================================================

-- ── Roles ──
INSERT INTO roles (slug, name, description) VALUES
  ('cliente',       'Cliente',       'Crea y consulta sus pedidos, edita su perfil y publica reseñas.'),
  ('empleado',      'Empleado',      'Gestiona pedidos, clientes y reseñas. Sin configuración crítica.'),
  ('administrador', 'Administrador', 'Acceso total a la plataforma.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- ── Permisos ──
INSERT INTO permissions (slug, name) VALUES
  ('orders.view',            'Ver pedidos'),
  ('orders.update_status',   'Actualizar estado de pedidos'),
  ('orders.edit',            'Editar pedidos'),
  ('orders.notes',           'Agregar notas internas'),
  ('users.view',             'Ver usuarios'),
  ('users.edit',             'Editar usuarios'),
  ('users.deactivate',       'Activar/desactivar cuentas'),
  ('services.manage',        'Gestionar servicios y precios'),
  ('reviews.moderate',       'Moderar reseñas'),
  ('settings.manage',        'Gestionar configuración'),
  ('employees.manage',       'Gestionar empleados'),
  ('stats.view',             'Ver estadísticas')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ── Permisos del rol EMPLEADO ──
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'empleado'
  AND p.slug IN ('orders.view','orders.update_status','orders.edit','orders.notes',
                 'users.view','users.edit','reviews.moderate','stats.view')
ON DUPLICATE KEY UPDATE role_id = role_id;

-- ── Permisos del rol ADMINISTRADOR (todos) ──
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'administrador'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- (El rol CLIENTE no requiere permisos administrativos.)

-- ── Settings base ──
INSERT INTO settings (`key`, `value`) VALUES
  ('tax_rate',        '0.16'),
  ('currency',        'MXN'),
  ('business_name',   'OK.station'),
  ('whatsapp',        '5216641044896')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- ── Catálogo inicial (editable luego desde el panel) ──
INSERT INTO categories (slug, name, sort_order) VALUES
  ('impresion', 'Impresión y copias', 1),
  ('fotografia','Fotografía', 2),
  ('acabados',  'Acabados', 3),
  ('papeleria', 'Papelería', 4)
ON DUPLICATE KEY UPDATE name = VALUES(name);

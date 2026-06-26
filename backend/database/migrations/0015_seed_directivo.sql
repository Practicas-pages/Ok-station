-- 0015 — Sembrar el rol 'directivo' (faltaba en el runner de migraciones).
-- El rol ya existe en seed.sql, pero migrate.php solo corre migrations/*.sql,
-- así que en deploys por migración 'directivo' nunca se creaba — aunque todo el
-- código (authz.php, dashboard, orders, site-guard, auth.js) depende de él.
-- Idempotente: ON DUPLICATE KEY. Mismo contenido que seed.sql (no duplica lógica nueva).
SET NAMES utf8mb4;

-- ── Rol directivo ──
INSERT INTO roles (slug, name, description) VALUES
  ('directivo', 'Directivo', 'Acceso total al panel (igual que administrador) más reportes y métricas ejecutivas.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- ── Permisos del rol DIRECTIVO (todos, igual que administrador) ──
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'directivo'
ON DUPLICATE KEY UPDATE role_id = role_id;

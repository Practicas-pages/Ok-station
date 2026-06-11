<?php
/** GET /backend/api/admin/users.php — lista de usuarios REAL. Requiere staff. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');
require_role(['empleado', 'administrador']);

$rows = db()->query(
    "SELECT u.id, u.full_name AS name, u.email, u.phone, u.is_active AS active, DATE(u.created_at) AS joined,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
            (SELECT GROUP_CONCAT(r.slug) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
     FROM users u ORDER BY u.created_at DESC LIMIT 500"
)->fetchAll();

respond(['ok' => true, 'users' => $rows]);

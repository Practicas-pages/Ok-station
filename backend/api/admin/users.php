<?php
/** GET /backend/api/admin/users.php — lista de usuarios REAL.
 *  Requiere el permiso 'users.view': lo tienen empleado, administrador y directivo.
 *  El empleado SOLO ve la lista y el historial (user-detail.php); NO puede
 *  desactivar cuentas (user-toggle.php → users.deactivate) ni cambiar roles
 *  (user-role.php → rol administrador/directivo). */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');
require_permission('users.view');

$rows = db()->query(
    "SELECT u.id, u.full_name AS name, u.email, u.phone, u.is_active AS active, DATE(u.created_at) AS joined,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
            (SELECT GROUP_CONCAT(r.slug) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
     FROM users u ORDER BY u.created_at DESC LIMIT 500"
)->fetchAll();

respond(['ok' => true, 'users' => $rows]);

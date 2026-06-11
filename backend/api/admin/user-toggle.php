<?php
/** POST /backend/api/admin/user-toggle.php — activa / desactiva una cuenta. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user   = require_permission('users.deactivate');
$b      = body();
$id     = (int) ($b['id'] ?? 0);
$active = !empty($b['active']) ? 1 : 0;

$u = User::find($id);
if (!$u) fail('Usuario no encontrado.', 404);
if ((int) $u['id'] === (int) $user['id']) fail('No puedes desactivar tu propia cuenta.', 422);

User::update($id, ['is_active' => $active]);
log_activity((int) $user['id'], 'user.toggle', 'users', $id, ['active' => $active]);
respond(['ok' => true]);

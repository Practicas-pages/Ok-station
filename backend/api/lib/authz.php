<?php
/**
 * Middleware de autorización (roles y permisos en BASE DE DATOS).
 * Los administradores NO se fijan por correo en el código: se asignan
 * por rol. Los correos de ADMIN_EMAILS (.env) solo siembran el primer
 * admin al registrarse; después se gestiona por roles en BD/panel.
 *
 * Requiere _bootstrap.php (db, require_auth, fail).
 */
require_once __DIR__ . '/Model.php';

/** Usuario autenticado y activo, o corta con 401/403. */
function current_user(): array {
    $claims = require_auth();
    $u = User::find((int) $claims['sub']);
    if (!$u || (int) $u['is_active'] !== 1) fail('Cuenta inactiva o inexistente.', 403);
    return $u;
}

function user_has_role(int $userId, $roles): bool {
    $have = User::roles($userId);
    foreach ((array) $roles as $r) if (in_array($r, $have, true)) return true;
    return false;
}

/** Exige uno de los roles indicados. Devuelve el usuario. */
function require_role($roles): array {
    $u = current_user();
    if (!user_has_role((int) $u['id'], $roles)) fail('No tienes permiso para esta acción.', 403);
    return $u;
}

/** Exige un permiso concreto (p.ej. 'orders.update_status'). */
function require_permission(string $perm): array {
    $u = current_user();
    if (!in_array($perm, User::permissions((int) $u['id']), true)) {
        fail('Permiso insuficiente: ' . $perm, 403);
    }
    return $u;
}

/** Asigna roles al crear un usuario: siempre 'cliente'; 'administrador' si el correo está en ADMIN_EMAILS. */
function ensure_roles_for_new_user(int $userId, string $email): void {
    global $CONFIG;
    $assign = function (string $slug) use ($userId) {
        $role = Role::findBy('slug', $slug);
        if (!$role) return;
        db()->prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)')
            ->execute([$userId, (int) $role['id']]);
    };
    $assign('cliente');
    $admins = array_map('strtolower', $CONFIG['admin_emails'] ?? []);
    if (in_array(strtolower($email), $admins, true)) $assign('administrador');
}

/** Bitácora de actividad (nunca rompe la petición). */
function log_activity(?int $userId, string $action, ?string $entity = null, $entityId = null, array $meta = []): void {
    try {
        db()->prepare('INSERT INTO activity_logs (user_id, action, entity, entity_id, meta_json, ip) VALUES (?,?,?,?,?,?)')
            ->execute([
                $userId, $action, $entity, $entityId,
                $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
    } catch (Throwable $e) { /* el logging no debe afectar la respuesta */ }
}

<?php
/**
 * POST /backend/api/admin/user-role.php — cambia el rol de un usuario.
 * Solo administrador/directivo. Reutiliza el modelo de roles M2M existente.
 *
 * Reglas (respetan la arquitectura: todos son 'cliente'; el staff lleva UN rol extra):
 *   - 'cliente'      → quita los roles de staff (queda solo cliente).
 *   - 'empleado'     → cliente + empleado.
 *   - 'administrador'→ cliente + administrador.
 *   - 'directivo'    → cliente + directivo.
 * Salvaguardas: no puedes cambiar tu propio rol; no se puede quitar al último
 * usuario con acceso total (administrador/directivo).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$actor = require_role(['administrador', 'directivo']);
$b     = body();
$id    = (int) ($b['id'] ?? 0);
$role  = strtolower(trim((string) ($b['role'] ?? '')));

$ALLOWED = ['cliente', 'empleado', 'administrador', 'directivo'];
$STAFF   = ['empleado', 'administrador', 'directivo'];
$FULL    = ['administrador', 'directivo'];

if (!in_array($role, $ALLOWED, true)) fail('Rol no válido.');

$u = User::find($id);
if (!$u) fail('Usuario no encontrado.', 404);
if ((int) $u['id'] === (int) $actor['id']) fail('No puedes cambiar tu propio rol.', 422);

$pdo = db();

/* Salvaguarda: si el cambio le quita el acceso total y es el último con acceso total, bloquear. */
if (!in_array($role, $FULL, true)) {
    $hadFull = (int) (function () use ($pdo, $id) {
        $st = $pdo->prepare("SELECT COUNT(*) c FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                             WHERE ur.user_id = ? AND r.slug IN ('administrador','directivo')");
        $st->execute([$id]);
        return $st->fetch()['c'];
    })();
    if ($hadFull > 0) {
        $totalFull = (int) $pdo->query("SELECT COUNT(DISTINCT ur.user_id) c FROM user_roles ur
                                        JOIN roles r ON r.id = ur.role_id
                                        WHERE r.slug IN ('administrador','directivo')")->fetch()['c'];
        if ($totalFull <= 1) fail('No puedes quitarle el acceso total al último administrador.', 422);
    }
}

$roleId = function (string $slug) use ($pdo): int {
    $st = $pdo->prepare('SELECT id FROM roles WHERE slug = ?');
    $st->execute([$slug]);
    $r = $st->fetch();
    return $r ? (int) $r['id'] : 0;
};

$pdo->beginTransaction();
try {
    // 1) Garantiza 'cliente' siempre.
    $cid = $roleId('cliente');
    if ($cid) $pdo->prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)')->execute([$id, $cid]);

    // 2) Quita todos los roles de staff.
    $in = implode(',', array_fill(0, count($STAFF), '?'));
    $pdo->prepare("DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                   WHERE ur.user_id = ? AND r.slug IN ($in)")
        ->execute(array_merge([$id], $STAFF));

    // 3) Asigna el rol elegido si es de staff.
    if ($role !== 'cliente') {
        $rid = $roleId($role);
        if (!$rid) { $pdo->rollBack(); fail('El rol no existe en la base de datos. Corre las migraciones.', 500); }
        $pdo->prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)')->execute([$id, $rid]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo cambiar el rol.', 500);
}

log_activity((int) $actor['id'], 'user.role_changed', 'users', $id, ['role' => $role]);
respond(['ok' => true, 'role' => $role]);

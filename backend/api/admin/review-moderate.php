<?php
/** POST /backend/api/admin/review-moderate.php — aprueba / oculta / elimina una reseña. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user   = require_permission('reviews.moderate');
$b      = body();
$id     = (int) ($b['id'] ?? 0);
$action = (string) ($b['action'] ?? '');

$rev = Review::find($id);
if (!$rev) fail('Reseña no encontrada.', 404);

if ($action === 'approve')      Review::update($id, ['status' => 'aprobada']);
elseif ($action === 'hide')     Review::update($id, ['status' => 'oculta']);
elseif ($action === 'delete')   db()->prepare('DELETE FROM reviews WHERE id = ?')->execute([$id]);
else                            fail('Acción inválida.');

log_activity((int) $user['id'], 'review.moderate', 'reviews', $id, ['action' => $action]);
respond(['ok' => true]);

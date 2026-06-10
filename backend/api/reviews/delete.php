<?php
/**
 * POST /backend/api/reviews/delete.php  (requiere sesión; dueño o moderador)
 * body: { id }
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = current_user();
$id = (int) (body()['id'] ?? 0);

$rev = Review::find($id);
if (!$rev) fail('Reseña no encontrada.', 404);

$isOwner     = ((int) $rev['user_id'] === (int) $user['id']);
$canModerate = in_array('reviews.moderate', User::permissions((int) $user['id']), true);
if (!$isOwner && !$canModerate) fail('No puedes eliminar esta reseña.', 403);

db()->prepare('DELETE FROM reviews WHERE id = ?')->execute([$id]);
log_activity((int) $user['id'], 'review.delete', 'reviews', $id);

respond(['ok' => true]);

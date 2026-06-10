<?php
/**
 * POST /backend/api/reviews/update.php  (requiere sesión; dueño o moderador)
 * body: { id, rating, comment }
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = current_user();
$b = body();
$id      = (int) ($b['id'] ?? 0);
$rating  = (int) ($b['rating'] ?? 0);
$comment = trim((string) ($b['comment'] ?? ''));

$rev = Review::find($id);
if (!$rev) fail('Reseña no encontrada.', 404);

$isOwner     = ((int) $rev['user_id'] === (int) $user['id']);
$canModerate = in_array('reviews.moderate', User::permissions((int) $user['id']), true);
if (!$isOwner && !$canModerate) fail('No puedes editar esta reseña.', 403);

if ($rating < 1 || $rating > 5) fail('Calificación inválida.');
if (mb_strlen($comment) < 4)    fail('Escribe tu comentario.');
if (mb_strlen($comment) > 600)  fail('El comentario es demasiado largo (máx. 600).');

Review::update($id, ['rating' => $rating, 'comment' => $comment]);
log_activity((int) $user['id'], 'review.update', 'reviews', $id);

$r = Review::find($id);
$r['author'] = $user['full_name'];
$r['mine'] = $isOwner;
unset($r['user_id'], $r['status']);

respond(['ok' => true, 'review' => $r]);

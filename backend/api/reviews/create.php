<?php
/**
 * POST /backend/api/reviews/create.php  (requiere sesión)
 * body: { rating: 1..5, comment }
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = current_user();
$b = body();
$rating  = (int) ($b['rating'] ?? 0);
$comment = trim((string) ($b['comment'] ?? ''));

if ($rating < 1 || $rating > 5)        fail('Selecciona una calificación de 1 a 5 estrellas.');
if (mb_strlen($comment) < 4)           fail('Escribe tu comentario.');
if (mb_strlen($comment) > 600)         fail('El comentario es demasiado largo (máx. 600).');

$id = Review::create([
    'user_id' => (int) $user['id'],
    'rating'  => $rating,
    'comment' => $comment,
    'status'  => 'aprobada',   // se muestra de inmediato; el panel puede ocultarla
]);
log_activity((int) $user['id'], 'review.create', 'reviews', $id);

$r = Review::find($id);
$r['author'] = $user['full_name'];
$r['mine'] = true;
unset($r['user_id'], $r['status']);

respond(['ok' => true, 'review' => $r], 201);

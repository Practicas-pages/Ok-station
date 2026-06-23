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

/* Una reseña por usuario (evita spam/duplicados). */
$dup = db()->prepare('SELECT id FROM reviews WHERE user_id = ? LIMIT 1');
$dup->execute([(int) $user['id']]);
if ($dup->fetch()) fail('Ya publicaste una reseña. ¡Gracias por tu opinión!', 409);

/* MODERACIÓN: la reseña entra como PENDIENTE y NO se publica hasta que el panel la apruebe. */
$id = Review::create([
    'user_id' => (int) $user['id'],
    'rating'  => $rating,
    'comment' => $comment,
    'status'  => 'pendiente',
]);
log_activity((int) $user['id'], 'review.create', 'reviews', $id);

respond([
    'ok'      => true,
    'pending' => true,
    'message' => '¡Gracias! Tu reseña se publicará en cuanto la revisemos.',
], 201);

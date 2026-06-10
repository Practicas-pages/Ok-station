<?php
/**
 * GET /backend/api/reviews/list.php
 * Público: reseñas aprobadas (con nombre del autor) + estadísticas.
 * Si llega un token válido, marca cuáles son del usuario (campo "mine").
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$pdo = db();

$reviews = $pdo->query(
    "SELECT r.id, r.rating, r.comment, r.created_at, r.user_id, u.full_name AS author
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.status = 'aprobada'
     ORDER BY r.created_at DESC
     LIMIT 60"
)->fetchAll();

// ¿Hay sesión? Marca las propias.
$meId = 0;
$hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (preg_match('/Bearer\s+(.+)/i', $hdr, $m)) {
    $claims = jwt_verify(trim($m[1]));
    if ($claims) $meId = (int) $claims['sub'];
}
foreach ($reviews as &$r) {
    $r['mine'] = ((int) $r['user_id'] === $meId);
    unset($r['user_id']);
}
unset($r);

$stats = $pdo->query("SELECT COUNT(*) total, COALESCE(AVG(rating),0) avg FROM reviews WHERE status='aprobada'")->fetch();

respond([
    'ok'      => true,
    'reviews' => $reviews,
    'stats'   => ['total' => (int) $stats['total'], 'avg' => round((float) $stats['avg'], 1)],
]);

<?php
/** GET /backend/api/admin/reviews.php — TODAS las reseñas (moderación). Requiere permiso. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');
require_permission('reviews.moderate');

$rows = db()->query(
    "SELECT r.id, r.rating, r.comment, r.status, DATE(r.created_at) AS date, u.full_name AS name
     FROM reviews r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 300"
)->fetchAll();

respond(['ok' => true, 'reviews' => $rows]);

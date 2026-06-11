<?php
/** GET /backend/api/admin/services.php — catálogo de servicios REAL. Requiere staff. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');
require_role(['empleado', 'administrador']);

$rows = db()->query(
    "SELECT s.id, s.name, COALESCE(c.name, '—') AS category, s.base_price AS price, s.unit, s.is_active AS active
     FROM services s LEFT JOIN categories c ON c.id = s.category_id ORDER BY s.name"
)->fetchAll();

respond(['ok' => true, 'services' => $rows]);

<?php
/** GET /backend/api/services/list.php — catálogo público (para el configurador). */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

$cats = db()->query("SELECT id, slug, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name")->fetchAll();
$svc  = db()->query("SELECT id, category_id, name, description, base_price, unit, options_json FROM services WHERE is_active = 1 ORDER BY name")->fetchAll();

respond(['ok' => true, 'categories' => $cats, 'services' => $svc]);

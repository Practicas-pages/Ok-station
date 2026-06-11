<?php
/** GET /backend/api/admin/dashboard.php — métricas REALES del panel. Requiere staff. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');
require_role(['empleado', 'administrador']);

$pdo = db();
$num = function (string $sql) use ($pdo) { return $pdo->query($sql)->fetch(); };

$ordersTotal = (int) $num("SELECT COUNT(*) c FROM orders")['c'];
$pending     = (int) $num("SELECT COUNT(*) c FROM orders WHERE status IN ('recibido','en_revision')")['c'];
$usersTotal  = (int) $num("SELECT COUNT(*) c FROM users")['c'];
$salesMonth  = (float) $num("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status <> 'cancelado' AND created_at >= DATE_FORMAT(NOW(),'%Y-%m-01')")['s'];

// Deltas mes actual vs mes anterior
$oCur = (int) $num("SELECT COUNT(*) c FROM orders WHERE created_at >= DATE_FORMAT(NOW(),'%Y-%m-01')")['c'];
$oPre = (int) $num("SELECT COUNT(*) c FROM orders WHERE created_at >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH,'%Y-%m-01') AND created_at < DATE_FORMAT(NOW(),'%Y-%m-01')")['c'];
$sPre = (float) $num("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status <> 'cancelado' AND created_at >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH,'%Y-%m-01') AND created_at < DATE_FORMAT(NOW(),'%Y-%m-01')")['s'];
$uCur = (int) $num("SELECT COUNT(*) c FROM users WHERE created_at >= DATE_FORMAT(NOW(),'%Y-%m-01')")['c'];
$uPre = (int) $num("SELECT COUNT(*) c FROM users WHERE created_at >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH,'%Y-%m-01') AND created_at < DATE_FORMAT(NOW(),'%Y-%m-01')")['c'];
$pct = function ($cur, $pre) { if ($pre <= 0) return $cur > 0 ? 100 : 0; return (int) round((($cur - $pre) / $pre) * 100); };

// Ventas de los últimos 7 días
$byDate = [];
foreach ($pdo->query("SELECT DATE(created_at) d, COALESCE(SUM(total),0) v FROM orders WHERE status <> 'cancelado' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at)")->fetchAll() as $r) {
    $byDate[$r['d']] = (float) $r['v'];
}
$dow = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
$sales7 = [];
for ($i = 6; $i >= 0; $i--) {
    $ts = strtotime("-$i day");
    $sales7[] = ['d' => $dow[(int) date('w', $ts)], 'v' => $byDate[date('Y-m-d', $ts)] ?? 0];
}

// Tamaños más solicitados (desde la config de cada ítem)
$labels = ['carta' => 'Carta', 'oficio' => 'Oficio', 'tabloide' => 'Tabloide', 'a4' => 'A4', 'foto_10x15' => 'Foto 10×15', 'foto_13x18' => 'Foto 13×18', 'gran_formato' => 'Gran formato'];
$topServices = [];
try {
    foreach ($pdo->query("SELECT JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.size')) name, COUNT(*) count FROM order_items WHERE config_json IS NOT NULL GROUP BY name ORDER BY count DESC LIMIT 5")->fetchAll() as $r) {
        if ($r['name'] === null) continue;
        $topServices[] = ['name' => $labels[$r['name']] ?? $r['name'], 'count' => (int) $r['count']];
    }
} catch (Throwable $e) { /* JSON no soportado: lista vacía */ }

$pendRev = (int) $num("SELECT COUNT(*) c FROM reviews WHERE status='pendiente'")['c'];

respond([
    'ok' => true,
    'stats' => [
        'orders' => $ordersTotal, 'sales' => $salesMonth, 'users' => $usersTotal, 'pending' => $pending,
        'dOrders' => $pct($oCur, $oPre), 'dSales' => $pct((int) $salesMonth, (int) $sPre), 'dUsers' => $pct($uCur, $uPre), 'dPending' => 0,
    ],
    'sales7' => $sales7,
    'topServices' => $topServices,
    'nav' => ['pedidos' => $ordersTotal, 'resenas' => $pendRev],
]);

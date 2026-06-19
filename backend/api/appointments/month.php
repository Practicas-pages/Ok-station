<?php
/**
 * GET /backend/api/appointments/month.php?month=YYYY-MM
 * Nivel de disponibilidad (full/mid/none) por día del mes, calculado con la
 * OCUPACIÓN REAL: citas activas (pendiente/confirmada) vs. horarios del día.
 * Sirve para colorear el calendario (verde/naranja/rojo). Público.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Availability.php';
only_method('GET');

$month = trim((string) ($_GET['month'] ?? ''));
if (!preg_match('/^\d{4}-\d{2}$/', $month)) fail('Mes inválido.');
$y = (int) substr($month, 0, 4);
$m = (int) substr($month, 5, 2);
if ($m < 1 || $m > 12) fail('Mes inválido.');

$cfg         = Availability::config();
$first       = sprintf('%04d-%02d-01', $y, $m);
$daysInMonth = (int) date('t', strtotime($first));
$last        = sprintf('%04d-%02d-%02d', $y, $m, $daysInMonth);

$counts = Availability::activeCountsByDate($first, $last);

$days = [];
for ($d = 1; $d <= $daysInMonth; $d++) {
    $iso   = sprintf('%04d-%02d-%02d', $y, $m, $d);
    $hours = Availability::hoursFor($iso, $cfg);   // [] si cerrado/bloqueado/fuera de ventana
    if (!$hours) continue;
    $days[$iso] = Availability::dayLevel(count($hours), $counts[$iso] ?? 0);
}

respond(['ok' => true, 'month' => $month, 'days' => $days]);

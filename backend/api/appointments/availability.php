<?php
/**
 * GET /backend/api/appointments/availability.php
 *   - sin ?date  → devuelve la CONFIG para pintar el calendario
 *                  (horario semanal, días bloqueados, ventana, capacidad).
 *   - con ?date=YYYY-MM-DD → devuelve los HORARIOS disponibles de ese día,
 *                  ya descontando capacidad y citas existentes.
 * Público (no requiere sesión).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Availability.php';
only_method('GET');

$date = trim((string) ($_GET['date'] ?? ''));

if ($date === '') {
    $cfg = Availability::config();
    respond([
        'ok'               => true,
        'weekly'           => $cfg['weekly'],     // {"0":[],"1":["09:00",...], ...}
        'blackout'         => $cfg['blackout'],
        'max_advance_days' => $cfg['advance'],
        'capacity'         => $cfg['capacity'],
    ]);
}

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) fail('Fecha inválida.');

$slots = Availability::slotsFor($date);
respond([
    'ok'    => true,
    'date'  => $date,
    'open'  => count($slots) > 0,
    'slots' => $slots,                            // [{time:"09:00", left:2, available:true}, ...]
]);

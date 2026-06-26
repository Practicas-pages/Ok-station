<?php
/**
 * GET /backend/api/appointments/prices.php — catálogo PÚBLICO de precios de trámites.
 * Lo consume el front (assets/cita-ticket.js) para mostrar el estimado y el anticipo
 * SIEMPRE en sincronía con lo que el panel tenga configurado. Sin datos sensibles.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Pricing.php';
only_method('GET');

respond([
    'ok'              => true,
    'prices'          => Pricing::apptPrices(),          // { "pasaporte_mexicano":200, "visa":800, ... }
    'require_payment' => Pricing::apptRequirePayment(),  // ["visa","pasaporte"]
    'currency'        => 'MXN',
    'tax_rate'        => Pricing::taxRate(),
]);

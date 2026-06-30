<?php
/**
 * GET /backend/api/print-prices.php — precios de impresión PÚBLICOS (para el estimado del
 * configurador en assets/order.js). Sin datos sensibles; el cobro real lo calcula el servidor.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/lib/Pricing.php';
only_method('GET');

respond([
    'ok'       => true,
    'prices'   => Pricing::printPricesFlat(),
    'tax_rate' => Pricing::taxRate(),
    'currency' => 'MXN',
]);

<?php
/**
 * Ok.station — Prueba del cotizador de envíos de Exel.
 * -----------------------------------------------------------------------------
 * Comprueba que ExelEnvios funciona contra la API REAL, sin tocar pedidos: el
 * endpoint de fletes solo consulta, no compra ni reserva nada.
 *
 *   php backend/tools/exel-fletes-prueba.php
 *   php backend/tools/exel-fletes-prueba.php 44100        (un CP concreto)
 *
 * Necesita EXEL_API_KEY en backend/.env, la misma que usa el runner del catálogo.
 */
declare(strict_types=1);

require __DIR__ . '/../api/lib/env.php';
load_env(__DIR__ . '/../.env');
require __DIR__ . '/../api/lib/ExelEnvios.php';

echo "── Cotizador de envíos (Exel) ──\n";
echo "Origen: " . ExelEnvios::LOCALIDAD_ORIGEN . " (almacén de Exel en Tijuana)\n";

if (!ExelEnvios::configurado()) {
    fwrite(STDERR, "✗ Falta EXEL_API_KEY en backend/.env\n");
    exit(1);
}
echo "Llave: configurada\n\n";

/* Un producto real del catálogo. El id sale del feed de Exel (campo `id`); si el
   catálogo cambia, cualquier id activo sirve para la prueba. */
$items = [['id_producto' => '2', 'cantidad' => 1]];

$destinos = $argv[1] ?? '';
$pruebas = $destinos !== ''
    ? [[$destinos, 'indicado a mano']]
    : [
        ['22430', 'Tijuana · Garita de Otay (local)'],
        ['22010', 'Tijuana · Centro (local)'],
        ['44100', 'Guadalajara · Centro'],
        ['06700', 'Ciudad de México · Roma Norte'],
        ['97000', 'Mérida'],
        ['00000', 'código postal inexistente'],
    ];

$ok = 0; $fallos = 0;
foreach ($pruebas as [$cp, $etiqueta]) {
    printf("%-38s ", "$cp  $etiqueta");
    $r = ExelEnvios::cotizar($cp, $items);
    if ($r === null) { echo "sin cotización\n"; $fallos++; continue; }
    $ok++;
    $d = $r['destino'];
    echo trim(($d['ciudad'] ?? '') . ', ' . ($d['estado'] ?? ''), ', ') . "\n";
    foreach ($r['opciones'] as $o) {
        printf("      %-22s $%s\n", $o['transportista'], number_format($o['costo'], 2));
    }
}

echo "\ncotizados: $ok · sin respuesta: $fallos\n";
/* El CP inexistente DEBE quedar sin cotización: si cotizara, estaríamos cobrando
   envíos a direcciones que no existen. */
echo "(el 00000 debe salir 'sin cotización'; si cotiza, hay que revisar)\n";

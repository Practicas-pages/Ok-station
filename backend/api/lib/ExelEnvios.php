<?php
/**
 * Ok.station — Cotización del envío a domicilio con Exel del Norte.
 * -----------------------------------------------------------------------------
 * Exel embarca desde SU almacén al cliente final, así que el costo del envío lo
 * pone Exel, no nosotros. Este archivo pregunta "¿cuánto cuesta mandar esto al
 * código postal X?" y devuelve las opciones para que el cliente elija.
 *
 *   POST {EXEL_API_BASE}/fletes_y_transportistas
 *   Authorization: <EXEL_API_KEY>
 *   { "id_localidad": "TJ", "cp": "44100",
 *     "productos": [ { "id_producto": "2", "cantidad": 1 } ] }
 *
 * ── EL CONTRATO NO ESTÁ DOCUMENTADO ──
 * La página de su documentación dice "No maneja parámetros" y el ejemplo viene
 * cortado. Todo lo de aquí abajo se descubrió llamando a la API contra el catálogo
 * real, campo por campo, viendo qué reclamaba en cada intento. Si algo se cambia,
 * hay que volver a comprobarlo contra la API, no contra el manual.
 *
 * ── id_localidad es el ORIGEN, no el destino ──
 * Cuesta creerlo por el nombre, pero está comprobado:
 *   origen TJ + cp de Tijuana    → "PROPIO EXEL LOCAL 1", $130   (reparto local)
 *   origen GD + cp de Guadalajara→ "PROPIO EXEL LOCAL 1", $130   (reparto local allá)
 *   origen TJ + cp de Guadalajara→ Estafeta $145 · Envíos Baja $230 · FedEx $230
 * O sea: es la sucursal de Exel DESDE la que sale la mercancía. Para Ok.station
 * siempre es TJ (su almacén de Tijuana está en Garita de Otay). Si se pusiera el
 * de la ciudad del cliente, se cotizaría un reparto local que nadie va a hacer.
 *
 * ── Cuatro rarezas de su API que hay que respetar ──
 * 1. Cuando algo falla NO devuelve JSON: devuelve una PÁGINA HTML de error de PHP.
 *    Un json_decode a ciegas daría null y el fallo pasaría por "sin opciones".
 * 2. `resultado` cambia de tipo según el caso: `true` cuando hay tarifas, y una
 *    CADENA con el mensaje cuando falla ("ERROR: favor de enviar..."). En otros
 *    endpoints suyos es un objeto o el número 0. Aquí solo se acepta `=== true`.
 * 3. `flete` llega como texto y con espacios delante: "   130.00".
 * 4. Los nombres de campo no son los mismos que en otros endpoints suyos: aquí el
 *    producto es `id_producto`, pero en /pedido el mismo dato es `clave_producto`.
 */
declare(strict_types=1);

final class ExelEnvios
{
    /** Sucursal de Exel desde la que sale la mercancía de Ok.station. */
    const LOCALIDAD_ORIGEN = 'TJ';

    /* Corto a propósito: esto corre con un cliente esperando en el checkout. */
    const TIMEOUT_CONEXION = 3;
    const TIMEOUT_TOTAL    = 8;

    public static function configurado(): bool
    {
        return trim((string) env('EXEL_API_KEY', '')) !== '';
    }

    /**
     * Opciones de envío a un código postal.
     *
     * @param string $cp      código postal del CLIENTE (5 dígitos)
     * @param array  $items   [['id_producto' => '2', 'cantidad' => 3], …]
     * @return array|null     null si no se pudo cotizar (sin llave, sin red, error de Exel)
     *   [
     *     'destino'  => ['colonia' => …, 'ciudad' => …, 'estado' => …],
     *     'opciones' => [ ['clave','transportista','costo'], … ]   // de más barata a más cara
     *   ]
     */
    public static function cotizar(string $cp, array $items): ?array
    {
        if (!self::configurado()) return null;

        $cp = preg_replace('/\D/', '', $cp) ?? '';
        if (strlen($cp) !== 5) return null;          // sin CP válido no hay nada que preguntar

        $productos = [];
        foreach ($items as $it) {
            $id  = trim((string) ($it['id_producto'] ?? ''));
            $qty = max(1, (int) ($it['cantidad'] ?? 1));
            if ($id !== '') $productos[] = ['id_producto' => $id, 'cantidad' => $qty];
        }
        if (!$productos) return null;

        $cuerpo = json_encode([
            'id_localidad' => self::LOCALIDAD_ORIGEN,
            'cp'           => $cp,
            'productos'    => $productos,
        ], JSON_UNESCAPED_UNICODE);
        if ($cuerpo === false) return null;

        $resp = self::enviar($cuerpo);
        return $resp === null ? null : self::interpretar($resp);
    }

    /** La llamada HTTP, aislada. Nunca lanza: devuelve el cuerpo crudo o null. */
    private static function enviar(string $json): ?string
    {
        $base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
        $ch = curl_init($base . '/fletes_y_transportistas');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT_CONEXION,
            CURLOPT_TIMEOUT        => self::TIMEOUT_TOTAL,
            CURLOPT_HTTPHEADER     => [
                'Authorization: ' . (string) env('EXEL_API_KEY', ''),
                'Content-Type: application/json',
            ],
        ]);
        $resp = curl_exec($ch);
        $err  = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($err !== '' || $code !== 200 || !is_string($resp) || $resp === '') return null;
        return $resp;
    }

    /**
     * Lee la respuesta. Aparte para poder probarla con respuestas guardadas, que es
     * como se descubrió el contrato.
     */
    public static function interpretar(?string $resp): ?array
    {
        if ($resp === null) return null;

        /* Su API devuelve HTML cuando truena por dentro. Se descarta antes de
           intentar decodificar, para no confundir "se cayó" con "no hay envío". */
        if (stripos(ltrim($resp), '<html') === 0) return null;

        $j = json_decode($resp, true);
        if (!is_array($j)) return null;

        /* `true` estricto: cuando falla, `resultado` trae el TEXTO del error, y un
           `if ($j['resultado'])` daría por buena una cadena no vacía. */
        if (($j['resultado'] ?? null) !== true) return null;
        if (empty($j['datos']) || !is_array($j['datos'])) return null;

        $opciones = [];
        $destino  = [];
        foreach ($j['datos'] as $d) {
            if (!is_array($d)) continue;
            /* "   130.00" → 130.0 */
            $costo = (float) trim((string) ($d['flete'] ?? ''));
            if ($costo <= 0) continue;
            $opciones[] = [
                'clave'        => (string) ($d['id_transportista'] ?? ''),
                'transportista' => trim((string) ($d['transportista'] ?? '')),
                'costo'        => round($costo, 2),
            ];
            if (!$destino) {
                /* Exel resuelve el CP y devuelve colonia/ciudad/estado. Se aprovecha
                   para completar y validar la dirección que escribió el cliente. */
                $destino = [
                    'colonia' => trim((string) ($d['colonia'] ?? '')),
                    'ciudad'  => trim((string) ($d['ciudad'] ?? '')),
                    'estado'  => trim((string) ($d['estado'] ?? '')),
                ];
            }
        }
        if (!$opciones) return null;

        usort($opciones, fn($a, $b) => $a['costo'] <=> $b['costo']);
        return ['destino' => $destino, 'opciones' => $opciones];
    }
}

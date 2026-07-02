<?php
/**
 * DIAGNÓSTICO TEMPORAL — IP de SALIDA del servidor.
 * Sirve para saber qué IP debes AUTORIZAR en Brevo (Security → Authorized IPs).
 * Esa IP (la de salida) suele ser distinta de la IP del sitio web.
 *
 * Uso: sube este archivo y abre en el navegador:
 *   https://okstation.mx/backend/api/whatsmyip.php
 * Autoriza la IP que te muestre en Brevo y DESPUÉS BORRA este archivo.
 */
header('Content-Type: application/json; charset=utf-8');

function fetch_ip(string $url): string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $res  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($res !== false && $code >= 200 && $code < 300) return trim((string) $res);
    }
    $r = @file_get_contents($url);
    return $r === false ? '' : trim((string) $r);
}

/* Se consultan 2 servicios por si uno falla; deben coincidir. */
$ip1 = fetch_ip('https://api.ipify.org');
$ip2 = fetch_ip('https://ifconfig.me/ip');

echo json_encode([
    'ip_de_salida'        => $ip1 !== '' ? $ip1 : $ip2,
    'segunda_fuente'      => $ip2,
    'ip_del_sitio_server' => $_SERVER['SERVER_ADDR'] ?? null,
    'nota'                => 'Autoriza la "ip_de_salida" en Brevo (Security -> Authorized IPs). Luego BORRA este archivo.',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

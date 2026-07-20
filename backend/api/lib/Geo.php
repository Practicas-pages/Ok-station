<?php
/**
 * Geolocalización del cliente para el IVA de la tienda.
 * -----------------------------------------------------------------------------
 * Objetivo: saber en qué ESTADO está el cliente para aplicar la tasa de IVA
 * correcta (Baja California = 8% frontera; resto del país = 16%).
 *
 * Estrategia en CAPAS (de la más fiable a la más general), pensada para que
 * funcione igual en LOCAL (XAMPP) y en PRODUCCIÓN:
 *   0) Override de PRUEBA (?sim_state=...) — solo si APP_ENV != production, para
 *      poder probar los dos flujos (BC y nacional) en localhost.
 *   1) Cabeceras de CDN/servidor (Cloudflare: CF-IPCountry / CF-Region-Code, etc.)
 *      — instantáneo y gratis en producción si el sitio va detrás de Cloudflare.
 *   2) API de geolocalización por IP (ip-api.com), server-to-server y CACHEADA por
 *      IP para no gastar el límite gratuito.
 *   3) Respaldo: Baja California (la tienda es de Tijuana; el IVA final SIEMPRE se
 *      confirma con el DOMICILIO en el checkout, así que este default es solo la
 *      "primera pista" para mostrar precios).
 *
 * REGLA FISCAL (confírmala con el contador): el 8% es el estímulo de la región
 * fronteriza norte. Aquí: "Baja California" (norte) → 8%; cualquier otro → 16%.
 *
 * Requiere config.php ($CONFIG) para app_env y storage_path.
 */
final class Geo
{
    const IVA_FRONTERA = 0.08;   // Baja California (frontera)
    const IVA_NACIONAL = 0.16;   // resto del país
    const CACHE_TTL    = 604800; // 7 días de caché por IP

    /** Normaliza un nombre de estado (minúsculas, sin acentos). */
    public static function normState(string $s): string
    {
        $s = mb_strtolower(trim($s));
        $s = strtr($s, ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n']);
        return preg_replace('/\s+/', ' ', $s);
    }

    /** ¿El estado es Baja California (norte, frontera 8%)? BC Sur NO cuenta aquí. */
    public static function isBC(string $state): bool
    {
        $n = self::normState($state);
        if ($n === 'bc' || $n === 'b.c.' || $n === 'bcn') return true;
        return strpos($n, 'baja california') !== false && strpos($n, 'sur') === false;
    }

    /** Tasa de IVA que le corresponde a un estado. */
    public static function ivaForState(string $state): float
    {
        return self::isBC($state) ? self::IVA_FRONTERA : self::IVA_NACIONAL;
    }

    /** IP real del cliente (respeta proxy/CDN). */
    public static function clientIp(array $server): string
    {
        $xff = (string) ($server['HTTP_X_FORWARDED_FOR'] ?? '');
        if ($xff !== '') return trim(explode(',', $xff)[0]);
        return (string) ($server['REMOTE_ADDR'] ?? '');
    }

    /** ¿La IP es local/privada (no geolocalizable)? */
    private static function isReservedIp(string $ip): bool
    {
        if ($ip === '' || $ip === '::1') return true;
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }

    /**
     * Detecta la ubicación del cliente.
     * @return array ['country'=>'MX'|'', 'state'=>'Baja California'|'', 'is_bc'=>bool,
     *                'iva_rate'=>0.08|0.16, 'source'=>'sim|cdn|ip|default']
     */
    public static function detect(array $server, ?string $simState = null): array
    {
        global $CONFIG;
        $isProd = (($CONFIG['app_env'] ?? 'production') === 'production');

        // 0) Override de PRUEBA (solo fuera de producción).
        if (!$isProd && $simState !== null && trim($simState) !== '') {
            return self::pack('MX', $simState, 'sim');
        }

        // 1) Cabeceras de CDN (Cloudflare u otras).
        $country = strtoupper((string) ($server['HTTP_CF_IPCOUNTRY'] ?? ''));
        $region  = (string) ($server['HTTP_CF_REGION'] ?? $server['HTTP_CF_REGION_CODE'] ?? '');
        if ($region !== '') {
            // CF-Region trae el nombre del estado; CF-Region-Code el código ISO (MX-BCN, etc.).
            $st = (strtoupper($region) === 'BCN' || stripos($region, 'baja california') !== false) ? 'Baja California' : $region;
            return self::pack($country ?: 'MX', $st, 'cdn');
        }

        // 2) API de IP (cacheada). Solo si la IP es pública.
        $ip = self::clientIp($server);
        if (!self::isReservedIp($ip)) {
            $geo = self::ipLookup($ip);
            if ($geo && ($geo['state'] ?? '') !== '') {
                return self::pack($geo['country'] ?: 'MX', $geo['state'], 'ip');
            }
        }

        // 3) Respaldo: BC (el IVA final se confirma con el domicilio en el checkout).
        return self::pack('MX', 'Baja California', 'default');
    }

    private static function pack(string $country, string $state, string $source): array
    {
        return [
            'country'  => $country,
            'state'    => $state,
            'is_bc'    => self::isBC($state),
            'iva_rate' => self::ivaForState($state),
            'source'   => $source,
        ];
    }

    /** Consulta a ip-api.com (gratis, server-to-server) con caché por IP. */
    private static function ipLookup(string $ip): ?array
    {
        $cached = self::cacheGet($ip);
        if ($cached !== null) return $cached;

        $url = 'http://ip-api.com/json/' . rawurlencode($ip) . '?fields=status,country,countryCode,regionName&lang=es';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 4,
            CURLOPT_CONNECTTIMEOUT => 3,
        ]);
        $raw  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false || $code !== 200) return null;

        $j = json_decode((string) $raw, true);
        if (!is_array($j) || ($j['status'] ?? '') !== 'success') return null;

        $out = ['country' => (string) ($j['countryCode'] ?? ''), 'state' => (string) ($j['regionName'] ?? '')];
        self::cacheSet($ip, $out);
        return $out;
    }

    private static function cacheDir(): string
    {
        global $CONFIG;
        $d = ($CONFIG['storage_path'] ?? (__DIR__ . '/../../storage')) . '/geo_cache';
        if (!is_dir($d)) @mkdir($d, 0770, true);
        return $d;
    }
    private static function cacheGet(string $ip): ?array
    {
        $f = self::cacheDir() . '/' . hash('sha256', $ip) . '.json';
        if (!is_file($f)) return null;
        $j = json_decode((string) @file_get_contents($f), true);
        if (!is_array($j) || (int) ($j['exp'] ?? 0) < time()) { @unlink($f); return null; }
        return is_array($j['d'] ?? null) ? $j['d'] : null;
    }
    private static function cacheSet(string $ip, array $data): void
    {
        $dir = self::cacheDir();
        if (!is_dir($dir) || !is_writable($dir)) return;
        @file_put_contents($dir . '/' . hash('sha256', $ip) . '.json',
            json_encode(['d' => $data, 'exp' => time() + self::CACHE_TTL]));
    }
}

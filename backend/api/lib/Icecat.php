<?php
/**
 * Cliente de Icecat (Live JSON API) — enriquecimiento de productos.
 * -----------------------------------------------------------------------------
 * COMPLEMENTA a Exel del Norte: Exel da el catálogo base (nombre, costo, stock);
 * Icecat "viste" el producto con FICHA TÉCNICA e IMÁGENES por su código de barras
 * (GTIN/EAN/UPC). Si Icecat no tiene el producto, se cae con gracia (devuelve null)
 * y el producto se queda con lo de Exel.
 *
 * SIN dependencias ni SDK (igual que Gemini.php): REST + cURL. La llave es SECRETO
 * DE SERVIDOR: vive solo en backend/.env (ICECAT_USERNAME / ICECAT_API_TOKEN),
 * NUNCA en el navegador.
 *
 * Estrategia de ahorro: el resultado se CACHEA en disco por código (30 días), así
 * varios productos con el mismo GTIN —o reintentos— no vuelven a pegarle a la API.
 * Requiere config.php ($CONFIG['icecat']).
 *
 * Doc: https://iceclog.com/manual-for-icecat-json-product-requests/
 */
final class Icecat
{
    const BASE      = 'https://live.icecat.biz/api';
    const CACHE_TTL = 2592000;   // 30 días
    const MAX_IMAGES = 5;        // decisión de negocio: máx 5 imágenes por producto
    const HTTP_TIMEOUT = 8;      // segundos; nunca colgar la vista de un producto

    /** ¿Hay usuario de Icecat configurado? (sin usuario no se puede consultar). */
    public static function available(): bool
    {
        global $CONFIG;
        return trim((string) ($CONFIG['icecat']['username'] ?? '')) !== '';
    }

    private static function username(): string
    {
        global $CONFIG;
        return trim((string) ($CONFIG['icecat']['username'] ?? ''));
    }
    private static function apiToken(): string
    {
        global $CONFIG;
        return trim((string) ($CONFIG['icecat']['api_token'] ?? ''));
    }
    private static function lang(): string
    {
        global $CONFIG;
        $l = strtoupper(trim((string) ($CONFIG['icecat']['lang'] ?? 'ES')));
        return $l !== '' ? $l : 'ES';
    }

    private static function cacheDir(): string
    {
        global $CONFIG;
        $d = ($CONFIG['storage_path'] ?? (__DIR__ . '/../../storage')) . '/icecat';
        if (!is_dir($d)) @mkdir($d, 0770, true);
        return $d;
    }

    /**
     * Busca un producto en Icecat y devuelve datos NORMALIZADOS, o null si no lo
     * tiene / no hay usuario / falla la API. $ids: ['gtin'=>, 'brand'=>, 'code'=>].
     * Intenta por GTIN (código de barras) y, si no, por marca + código.
     *
     * Devuelve:
     *   [ 'name'=>, 'description'=>, 'brand'=>, 'category'=>,
     *     'images'=> [ ['url'=>, 'is_primary'=>bool], ... ],   // máx 5
     *     'specs'  => [ ['group'=>, 'name'=>, 'value'=>], ... ] ]
     */
    public static function fetch(array $ids): ?array
    {
        if (!self::available()) return null;

        $gtin  = preg_replace('/\D/', '', (string) ($ids['gtin'] ?? ''));
        $brand = trim((string) ($ids['brand'] ?? ''));
        $code  = trim((string) ($ids['code'] ?? ''));

        // Solo GTIN de 8/12/13/14 dígitos es válido para Icecat; los cortos son
        // códigos internos del proveedor y no sirven para el match.
        $tryGtin = (in_array(strlen($gtin), [8, 12, 13, 14], true));

        $attempts = [];
        if ($tryGtin)                  $attempts[] = ['GTIN' => $gtin];
        if ($brand !== '' && $code !== '') $attempts[] = ['Brand' => $brand, 'ProductCode' => $code];
        if (!$attempts) return null;

        foreach ($attempts as $q) {
            $cacheKey = self::lang() . '|' . implode('|', $q);
            $hit = self::cacheGet($cacheKey);
            if ($hit !== null) return $hit['found'] ? $hit['data'] : null;

            $raw = self::request($q);
            if ($raw === null) continue;                 // error de red → probar siguiente

            $norm = self::normalize($raw);
            // Cachea SIEMPRE (encontrado o "no está"), para no repreguntar lo mismo.
            self::cacheSet($cacheKey, ['found' => $norm !== null, 'data' => $norm]);
            if ($norm !== null) return $norm;
        }
        return null;
    }

    /** Una petición cruda a Icecat. Devuelve el arreglo 'data' o null. */
    private static function request(array $q): ?array
    {
        $params = array_merge([
            'lang'     => self::lang(),
            'shopname' => self::username(),
            'content'  => '',   // vacío = producto completo
        ], $q);
        $url = self::BASE . '?' . http_build_query($params);

        $ch = curl_init($url);
        $headers = ['Accept: application/json'];
        if (self::apiToken() !== '') $headers[] = 'api-token: ' . self::apiToken();
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::HTTP_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_USERAGENT      => 'OkStation/1.0 (+icecat-enrich)',
        ]);
        $res  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($res === false || $code >= 500) return null;

        $j = json_decode((string) $res, true);
        if (!is_array($j)) return null;
        // Icecat marca el error en ContentErrors / msg; 'data' vacío = no está.
        $data = $j['data'] ?? null;
        if (!is_array($data) || !$data) return null;
        return $data;
    }

    /** Extrae de la respuesta 'data' los campos que nos interesan. Null si vacío. */
    private static function normalize(array $data): ?array
    {
        $gi = $data['GeneralInfo'] ?? [];

        $name = self::str($gi['Title'] ?? '') ?: self::str($gi['ProductName'] ?? '');
        $desc = self::str(($gi['Description']['LongDesc'] ?? '')) ?: self::str(($gi['Description']['MiddleDesc'] ?? ''));
        $brand = self::str($gi['Brand'] ?? '');
        $category = self::str(($gi['Category']['Name']['Value'] ?? ''));

        // ── Imágenes: galería (preferida) + imagen principal, únicas, máx 5 ──
        $images = [];
        $seen = [];
        $push = function ($url, $isMain) use (&$images, &$seen) {
            $url = self::str($url);
            if ($url === '' || isset($seen[$url]) || count($images) >= self::MAX_IMAGES) return;
            $seen[$url] = true;
            $images[] = ['url' => $url, 'is_primary' => (bool) $isMain];
        };
        // La imagen "IsMain" primero.
        $gallery = is_array($data['Gallery'] ?? null) ? $data['Gallery'] : [];
        usort($gallery, function ($a, $b) {
            $am = !empty($a['IsMain']) ? 0 : 1; $bm = !empty($b['IsMain']) ? 0 : 1;
            if ($am !== $bm) return $am - $bm;
            return ((int) ($a['No'] ?? 0)) <=> ((int) ($b['No'] ?? 0));
        });
        foreach ($gallery as $g) {
            $url = $g['Pic500x500'] ?? ($g['Pic'] ?? ($g['LowPic'] ?? ''));
            $push($url, !empty($g['IsMain']));
        }
        // Respaldo: la imagen principal del bloque Image.
        if (!$images && isset($data['Image'])) {
            $img = $data['Image'];
            $push($img['Pic500x500'] ?? ($img['HighPic'] ?? ($img['LowPic'] ?? '')), true);
        }
        // Garantiza que al menos una sea primaria.
        if ($images && !array_filter($images, fn($i) => $i['is_primary'])) $images[0]['is_primary'] = true;

        // ── Especificaciones (ficha técnica) ──
        $specs = [];
        foreach (($data['FeaturesGroups'] ?? []) as $fg) {
            $group = self::str(($fg['FeatureGroup']['Name']['Value'] ?? ''));
            foreach (($fg['Features'] ?? []) as $f) {
                $fname = self::str(($f['Feature']['Name']['Value'] ?? ''));
                $val   = self::str($f['PresentationValue'] ?? ($f['Value'] ?? ''));
                if ($fname === '' || $val === '') continue;
                $specs[] = ['group' => $group, 'name' => $fname, 'value' => $val];
            }
        }

        // Nada útil → considéralo "no está".
        if ($name === '' && !$images && !$specs) return null;

        return [
            'name'        => $name,
            'description' => $desc,
            'brand'       => $brand,
            'category'    => $category,
            'images'      => $images,
            'specs'       => $specs,
        ];
    }

    private static function str($v): string
    {
        if (is_array($v)) return '';
        return trim((string) $v);
    }

    /* ── Caché en disco (best-effort) ── */
    private static function cachePath(string $key): string
    {
        return self::cacheDir() . '/' . hash('sha256', $key) . '.json';
    }
    private static function cacheGet(string $key): ?array
    {
        $f = self::cachePath($key);
        if (!is_file($f) || (time() - filemtime($f)) > self::CACHE_TTL) return null;
        $j = json_decode((string) @file_get_contents($f), true);
        return is_array($j) ? $j : null;
    }
    private static function cacheSet(string $key, array $val): void
    {
        $dir = self::cacheDir();
        if (!is_dir($dir) || !is_writable($dir)) return;
        @file_put_contents(self::cachePath($key), json_encode($val, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
}

<?php
/**
 * Fotos de producto desde NEXTEP — el fabricante, directo
 * =============================================================================
 * NEXTEP es la marca con MÁS productos sin foto del catálogo: 131 de 264. Su
 * sitio no se puede leer (es una aplicación de Angular que arma todo con
 * JavaScript, así que pedir el HTML devuelve una cáscara vacía), y por eso se
 * había dado por perdida. Pero detrás de esa cáscara hay una API pública que
 * devuelve JSON limpio: fallaba la puerta, no la casa.
 *
 *   GET https://nextep.com.mx/api/public/api/products/NE-168
 *       → { product: { sku, name, image, … }, images: [ … ] }
 *   GET https://nextep.com.mx/api/public/api/products?page=1&limit=50
 *       → 389 productos en 8 páginas
 *
 * POR QUÉ ESTA FUENTE SÍ CUMPLE LAS REGLAS, y las otras no:
 *   · Es EL FABRICANTE. Las fotos están en su propio servidor, con su propia
 *     convención de nombres. Cero tiendas de terceros.
 *   · Empareja por CLAVE (NE-xxx), que es el número de parte. Es exacto: o es
 *     ese producto o devuelve 404. No existe el riesgo de publicar la variante
 *     equivocada, que es lo que hacía peligroso a todo lo demás.
 *   · Gratis, sin llave, sin registro.
 *
 * EL CERTIFICADO: su servidor manda SOLO el certificado de hoja y se salta el
 * intermedio de GoDaddy, así que la verificación falla con el almacén de
 * certificados normal ("unable to get local issuer certificate"). La salida fácil
 * sería apagar CURLOPT_SSL_VERIFYPEER, y eso NO se hace: dejaría la conexión
 * abierta a que cualquiera se ponga en medio y nos devuelva otra imagen. En su
 * lugar se incluye el intermedio que falta (certs/godaddy-g2.pem, sacado de la
 * URL que el propio certificado publica) y se verifica de verdad.
 *
 * OJO: es una API interna, no documentada. Puede cambiar sin aviso. Todo aquí
 * degrada en silencio — si deja de responder, el panel sigue funcionando y las
 * fotos se ponen a mano, como antes.
 */

final class Nextep
{
    private const BASE      = 'https://nextep.com.mx';
    private const API       = self::BASE . '/api/public/api';
    private const TIMEOUT   = 20;
    private const CACHE_HRS = 24;   // su catálogo no cambia de un día para otro

    /** ¿Esta marca es NEXTEP? Exel guarda la razón social ("NEXTEP SOLUCIONES"). */
    public static function esNextep(string $marca): bool
    {
        return str_contains(mb_strtoupper(trim($marca), 'UTF-8'), 'NEXTEP');
    }

    /**
     * ¿Esta clave tiene forma de clave NEXTEP? Sus SKU son NE-###.
     * Se comprueba ANTES de salir a la red: preguntar por una clave que no puede
     * existir es gastar una petición para recibir un 404.
     */
    public static function claveValida(string $clave): bool
    {
        /* El sufijo de letra NO es opcional por capricho: es la VARIANTE. En su
           catálogo real conviven NE-428B y NE-428N (blanco y negro), y son fotos
           distintas. La primera versión de esta expresión pedía solo dígitos y
           habría descartado en silencio justo los productos donde equivocarse de
           foto es más fácil. Se vio al espejar el catálogo. */
        return (bool) preg_match('/^NE-?\d+[A-Z]{0,2}$/i', trim($clave));
    }

    /** Normaliza la clave como la espera la API (NE-168, en mayúsculas). */
    public static function normalizarClave(string $clave): string
    {
        $c = strtoupper(trim($clave));
        if (preg_match('/^NE(\d+[A-Z]{0,2})$/', $c, $m)) $c = 'NE-' . $m[1];   // NE168 → NE-168
        return $c;
    }

    /**
     * Fotos de un producto por su clave.
     * Devuelve ['imagenes' => ['url', …], 'nombre' => '…'] o null si no lo tiene.
     */
    public static function porClave(string $clave): ?array
    {
        $clave = self::normalizarClave($clave);
        if (!self::claveValida($clave)) return null;

        $j = self::pedir(self::API . '/products/' . rawurlencode($clave));
        if (!is_array($j) || empty($j['product'])) return null;

        $p    = $j['product'];
        $urls = [];

        /* La principal primero: es la que NEXTEP eligió para representar el
           producto y la que debe quedar de portada en la tienda. */
        if (!empty($p['image'])) $urls[] = self::urlImagen((string) $p['image']);
        foreach (($j['images'] ?? []) as $img) {
            $u = is_array($img) ? (string) ($img['image'] ?? $img['url'] ?? '') : (string) $img;
            if ($u !== '') $urls[] = self::urlImagen($u);
        }

        $urls = array_values(array_unique(array_filter($urls)));
        if (!$urls) return null;

        return [
            'imagenes' => $urls,
            'nombre'   => trim((string) ($p['name'] ?? '') . ' ' . (string) ($p['short_description'] ?? '')),
            'sku'      => (string) ($p['sku'] ?? $clave),
        ];
    }

    /**
     * Espejo del catálogo completo: ['NE-168' => ['url', …], …].
     * Para procesar muchos productos de golpe. Son 8 peticiones en vez de una por
     * producto, y se guarda un día en disco.
     */
    public static function catalogo(bool $forzar = false): array
    {
        $cache = sys_get_temp_dir() . '/okstation-nextep.json';
        if (!$forzar && is_file($cache) && (time() - filemtime($cache)) < self::CACHE_HRS * 3600) {
            $j = json_decode((string) file_get_contents($cache), true);
            if (is_array($j) && $j) return $j;
        }

        $out = [];
        for ($pagina = 1; $pagina <= 20; $pagina++) {     // 20 = tope de seguridad, hoy son 8
            $j = self::pedir(self::API . '/products?page=' . $pagina . '&limit=50');
            /* Los productos vienen en `data`, no en `products`. Comprobado contra
               la API: las claves de primer nivel son page, limit, total, pages, data.
               Y `pages` se calcula con el `limit` que se pidió (con limit=3 dice 130,
               con limit=50 dice 8), así que sirve para saber cuándo parar. */
            if (!is_array($j) || empty($j['data'])) break;

            foreach ($j['data'] as $p) {
                $sku = strtoupper(trim((string) ($p['sku'] ?? '')));
                if ($sku === '' || empty($p['image'])) continue;
                $out[$sku] = [self::urlImagen((string) $p['image'])];
            }
            if ($pagina >= (int) ($j['pages'] ?? 1)) break;
        }

        if ($out) @file_put_contents($cache, json_encode($out));
        return $out;
    }

    /** Ruta relativa → URL absoluta de la imagen. */
    private static function urlImagen(string $ruta): string
    {
        $ruta = trim($ruta);
        if ($ruta === '') return '';
        if (str_starts_with($ruta, 'http://') || str_starts_with($ruta, 'https://')) return $ruta;
        return self::BASE . '/' . ltrim($ruta, '/');
    }

    /** El intermedio que su servidor no manda. Sin esto no se puede verificar. */
    public static function caBundle(): string
    {
        return __DIR__ . '/certs/godaddy-g2.pem';
    }

    /** Una petición a su API. Devuelve el JSON ya decodificado o null. */
    private static function pedir(string $url): ?array
    {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_USERAGENT      => 'OkStation/1.0 (+https://okstation.mx)',
            /* Se verifica SIEMPRE. El intermedio que falta se aporta aquí. */
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];
        $ca = self::caBundle();
        if (is_file($ca)) $opts[CURLOPT_CAINFO] = $ca;
        curl_setopt_array($ch, $opts);

        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body === false || $code !== 200) return null;
        $j = json_decode((string) $body, true);
        return is_array($j) ? $j : null;
    }
}

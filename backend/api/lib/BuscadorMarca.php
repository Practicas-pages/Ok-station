<?php
/**
 * Buscador de imágenes en el SITIO OFICIAL de la marca
 * =============================================================================
 * Tercer nivel de enriquecimiento. Busca el producto en la página del fabricante
 * y devuelve las fotos que encuentra para que una persona elija en el panel.
 *
 * NO publica nada por su cuenta, y esa es la decisión de diseño más importante:
 * el riesgo de este paso nunca fue técnico, era publicar la foto EQUIVOCADA (la
 * variante azul en el producto rojo). El cliente pide, recibe otra cosa y
 * devuelve. Por eso el buscador propone y el humano dispone — y así el buscador
 * no necesita ser perfecto, solo útil.
 *
 * POR QUÉ EL SITIO DE LA MARCA Y NO UN BUSCADOR DE IMÁGENES:
 * Google Imágenes, Bing y similares devuelven fotos de terceros —tiendas, blogs,
 * marketplaces— cuyos derechos no tenemos y que muchas veces ni siquiera son del
 * producto correcto. El sitio del fabricante es la fuente autorizada: la foto es
 * suya, corresponde a su número de parte, y usarla para vender su producto es el
 * uso previsto. Por eso solo se consultan dominios de una lista blanca.
 *
 * LÍMITES QUE SE RESPETAN, sin excepción:
 *   · Solo dominios de marcas registradas abajo. Nada de marketplaces.
 *   · Se lee robots.txt ANTES de pedir nada y se obedece.
 *   · Un intento por búsqueda, con tiempo de espera corto, y caché en disco para
 *     no repetirle la consulta al sitio cada vez que alguien abre el diálogo.
 *   · Si el sitio bloquea, cambia o no responde, se devuelve vacío y el panel
 *     ofrece subir la foto a mano. Nunca se adivina.
 */

final class BuscadorMarca
{
    /** Cuánto se guarda una búsqueda antes de volver a preguntarle al sitio. */
    private const CACHE_DIAS = 7;
    private const TIMEOUT    = 12;
    private const MAX_IMGS   = 12;

    /**
     * Marcas habilitadas. `buscar` es la URL de su buscador con {q} donde va el
     * término; `dominios` son los sitios de los que se acepta descargar una imagen
     * (el suyo y su CDN, que casi siempre es otro dominio).
     *
     * Se agregan de una en una y solo tras comprobar que su buscador devuelve
     * fichas de producto. Una marca de más aquí no rompe nada — si no encuentra,
     * devuelve vacío — pero tampoco sirve de nada.
     */
    public static function marcas(): array
    {
        /* ═══ NINGUNA MARCA ACTIVA HOY, y esto NO es un olvido ═══════════════
           Se probó contra los sitios reales (22-jul-2026) con productos del
           catálogo de OK.station. Resultado, marca por marca:

             FELLOWES  su buscador REDIRIGE A LA PORTADA: /mx/es/search?q=… acaba
                       en /us/en. La URL no existe. Cero JSON-LD, cero og:image.
             ACCO      ni accobrands.com.mx ni acco.com.mx resuelven. El sitio
                       corporativo accobrands.com no tiene fichas de producto.
             3M        no responde a /3M/es_MX/p/?Ntt= ni a su ruta de búsqueda.
             XEROX     su robots.txt prohíbe la ruta de búsqueda. Se respeta.

           Sus catálogos se pintan con JavaScript, así que pedir el HTML no
           devuelve productos por más que se afine el extractor. Dejarlas
           "activas" costaba ~1.2 s de espera por producto para no encontrar
           nada, y son ~282 productos de corrido.

           El mecanismo se conserva entero —fetch, robots.txt, filtros, caché y
           la lista blanca de descarga— porque es correcto y está probado. Para
           habilitar una marca hay que COMPROBAR ANTES, con este mismo archivo,
           que su buscador devuelve fichas en el HTML. Agregar una sin probarla
           solo devuelve adornos de su plantilla, y una foto equivocada publicada
           es peor que el placeholder de marca.

           Mientras tanto la foto se pone pegándola en el panel (Ctrl+V), que
           funciona con CUALQUIER marca y no depende de sitios ajenos. */
        return [];
    }

    /** ¿Hay buscador para esta marca? Devuelve su config o null. */
    public static function config(string $marca): ?array
    {
        $m = mb_strtoupper(trim($marca), 'UTF-8');
        return self::marcas()[$m] ?? null;
    }

    /** Todos los dominios de todas las marcas (los usa ImagenSegura para permitir la descarga). */
    public static function todosLosDominios(): array
    {
        $out = [];
        foreach (self::marcas() as $c) { foreach ($c['dominios'] as $d) $out[] = $d; }
        return array_values(array_unique($out));
    }

    /**
     * Busca fotos del producto en el sitio de su marca.
     * Devuelve ['imagenes' => [ ['url'=>, 'pagina'=>], … ], 'nota' => 'motivo si vino vacío'].
     */
    public static function buscar(string $marca, string $termino): array
    {
        $cfg = self::config($marca);
        if (!$cfg) return ['imagenes' => [], 'nota' => "No hay buscador configurado para {$marca}."];

        $termino = trim($termino);
        if ($termino === '') return ['imagenes' => [], 'nota' => 'Sin término de búsqueda.'];

        $url = str_replace('{q}', rawurlencode($termino), $cfg['buscar']);

        $cache = self::cacheLeer($url);
        if ($cache !== null) return $cache;

        if (!self::robotsPermite($url)) {
            $r = ['imagenes' => [], 'nota' => "El sitio de {$marca} no permite consultas automáticas en esa ruta. Súbela a mano."];
            self::cacheEscribir($url, $r);
            return $r;
        }

        $html = self::pedir($url);
        if ($html === null) {
            /* NO se cachea el fallo de red: mañana puede funcionar y no queremos
               dejar la marca marcada como imposible por un tropiezo pasajero. */
            return ['imagenes' => [], 'nota' => "El sitio de {$marca} no respondió."];
        }

        $imgs = self::extraerImagenes($html, $url, $cfg['dominios']);
        $r = [
            'imagenes' => $imgs,
            'nota'     => $imgs ? '' : "No se encontraron fotos para «{$termino}» en el sitio de {$marca}.",
        ];
        self::cacheEscribir($url, $r);
        return $r;
    }

    /* ── robots.txt ───────────────────────────────────────────────────────────
       Lectura deliberadamente simple: se juntan las reglas de User-agent: * y se
       mira si alguna Disallow cubre la ruta. No implementa el estándar completo
       (comodines, Allow que gana a Disallow), y ante la duda PROHÍBE. Es la
       dirección correcta del error: dejar de traer una foto es un inconveniente,
       ignorar un robots.txt es faltar al acuerdo con un sitio ajeno. */
    private static function robotsPermite(string $url): bool
    {
        $p = parse_url($url);
        if (!$p || empty($p['host'])) return false;
        $robots = $p['scheme'] . '://' . $p['host'] . '/robots.txt';

        $txt = self::pedir($robots, 6);
        if ($txt === null) return true;   // sin robots.txt accesible, se asume permitido

        $ruta = ($p['path'] ?? '/') . (isset($p['query']) ? '?' . $p['query'] : '');
        $aplica = false;
        foreach (preg_split('/\R/', $txt) as $linea) {
            $linea = trim($linea);
            if ($linea === '' || $linea[0] === '#') continue;
            if (preg_match('/^user-agent:\s*(.+)$/i', $linea, $m)) {
                $aplica = (trim($m[1]) === '*');
                continue;
            }
            if (!$aplica) continue;
            if (preg_match('/^disallow:\s*(.*)$/i', $linea, $m)) {
                $dis = trim($m[1]);
                if ($dis === '') continue;                 // "Disallow:" vacío = permite todo
                if (str_starts_with($ruta, $dis)) return false;
            }
        }
        return true;
    }

    /** Una petición HTTP sencilla. Devuelve el cuerpo o null. */
    private static function pedir(string $url, int $timeout = self::TIMEOUT): ?string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            /* Identificarse de verdad es lo correcto: el dueño del sitio puede ver
               quién lo consulta y bloquearnos si le estorba. Disfrazarse de Chrome
               sería justo lo contrario. */
            CURLOPT_USERAGENT      => 'OkStationBot/1.0 (+https://okstation.mx; buscador de fotos de producto)',
            CURLOPT_ENCODING       => '',
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body === false || $code < 200 || $code >= 300) return null;
        return (string) $body;
    }

    /**
     * Saca las URLs de imagen del HTML y descarta lo que claramente no es un
     * producto. Se filtra por dominio DE LA MARCA: si la página trae anuncios o
     * iconos de terceros, se quedan fuera solos.
     */
    private static function extraerImagenes(string $html, string $base, array $dominios): array
    {
        $urls = [];

        /* og:image primero: cuando existe, es la foto que el propio sitio eligió
           para representar la página. Suele ser la buena. */
        if (preg_match_all('/<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']/i', $html, $m)) {
            foreach ($m[1] as $u) $urls[] = $u;
        }
        /* JSON-LD schema.org: "image" puede ser texto o lista. */
        if (preg_match_all('/"image"\s*:\s*(?:"([^"]+)"|\[([^\]]+)\])/i', $html, $m, PREG_SET_ORDER)) {
            foreach ($m as $g) {
                if (!empty($g[1])) { $urls[] = $g[1]; continue; }
                if (!empty($g[2]) && preg_match_all('/"([^"]+)"/', $g[2], $mm)) {
                    foreach ($mm[1] as $u) $urls[] = $u;
                }
            }
        }
        /* Y las <img> de la página. data-src cubre las que cargan al hacer scroll. */
        if (preg_match_all('/<img[^>]+(?:data-src|data-original|src)=["\']([^"\']+)["\']/i', $html, $m)) {
            foreach ($m[1] as $u) $urls[] = $u;
        }

        $out = []; $vistos = [];
        foreach ($urls as $u) {
            $u = html_entity_decode(trim($u), ENT_QUOTES, 'UTF-8');
            if ($u === '' || str_starts_with($u, 'data:')) continue;
            $abs = self::absoluta($u, $base);
            if ($abs === null) continue;
            if (!self::esDeLaMarca($abs, $dominios)) continue;
            if (!self::pareceProducto($abs)) continue;
            $clave = strtok($abs, '?');                 // sin query: evita la misma foto repetida
            if (isset($vistos[$clave])) continue;
            $vistos[$clave] = true;
            $out[] = ['url' => $abs, 'pagina' => $base];
            if (count($out) >= self::MAX_IMGS) break;
        }
        return $out;
    }

    /** Convierte una URL relativa en absoluta contra la página de origen. */
    private static function absoluta(string $u, string $base): ?string
    {
        if (str_starts_with($u, 'http://') || str_starts_with($u, 'https://')) {
            return str_starts_with($u, 'https://') ? $u : null;   // solo https
        }
        $b = parse_url($base);
        if (!$b || empty($b['host'])) return null;
        if (str_starts_with($u, '//'))  return 'https:' . $u;
        if (str_starts_with($u, '/'))   return 'https://' . $b['host'] . $u;
        $dir = rtrim(dirname($b['path'] ?? '/'), '/');
        return 'https://' . $b['host'] . $dir . '/' . $u;
    }

    private static function esDeLaMarca(string $url, array $dominios): bool
    {
        $h = strtolower((string) parse_url($url, PHP_URL_HOST));
        foreach ($dominios as $d) {
            if ($h === $d || str_ends_with($h, '.' . $d)) return true;
        }
        return false;
    }

    /**
     * Descarta lo que casi nunca es la foto de un producto. No pretende acertar
     * siempre: los falsos positivos los descarta la persona de un vistazo, que es
     * precisamente por qué este flujo tiene a alguien mirando.
     */
    private static function pareceProducto(string $url): bool
    {
        $ruta = strtolower(strtok($url, '?'));
        $n    = basename($ruta);

        /* RUTAS de plantilla del sitio. Esto salió de probar contra los sitios de
           verdad: la búsqueda de Fellowes devolvía 12 "imágenes" que eran todas
           adornos del tema (/_layouts/…/fgimg.png y /_includes/…). Mostrar eso en
           el panel sería peor que no mostrar nada: alguien le da clic a un logo
           creyendo que es el producto y acaba publicado en la tienda. */
        foreach (['/_layouts/', '/_includes/', '/templates/', '/assets/repositories/',
                  '/static/', '/theme/', '/skin/', '/ui/', '/common/'] as $mala) {
            if (str_contains($ruta, $mala)) return false;
        }
        foreach (['logo', 'icon', 'sprite', 'banner', 'placeholder', 'pixel', 'spacer',
                  'favicon', 'avatar', 'bandera', 'flag', 'arrow', 'bullet', 'fgimg',
                  'header', 'footer', 'nav', 'bg-', 'background'] as $mala) {
            if (str_contains($n, $mala)) return false;
        }
        /* Muchos sitios ponen el tamaño en el nombre (foto_50x50.jpg). Si lo dice y
           es diminuto, es un icono. */
        if (preg_match('/(\d{2,4})x(\d{2,4})/', $n, $m) && ((int) $m[1] < 150 || (int) $m[2] < 150)) return false;
        return (bool) preg_match('/\.(jpe?g|png|webp)$/i', $n) || !str_contains($n, '.');
    }

    /* ── Caché en disco ──────────────────────────────────────────────────────
       Evita repetirle la misma consulta al sitio del fabricante cada vez que
       alguien abre el diálogo. Es cortesía con ellos y velocidad para nosotros. */
    private static function cachePath(string $url): string
    {
        $dir = sys_get_temp_dir() . '/okstation-marcas';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        return $dir . '/' . sha1($url) . '.json';
    }
    private static function cacheLeer(string $url): ?array
    {
        $f = self::cachePath($url);
        if (!is_file($f) || (time() - filemtime($f)) > self::CACHE_DIAS * 86400) return null;
        $j = json_decode((string) file_get_contents($f), true);
        return is_array($j) ? $j : null;
    }
    private static function cacheEscribir(string $url, array $datos): void
    {
        @file_put_contents(self::cachePath($url), json_encode($datos));
    }
}

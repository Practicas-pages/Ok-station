<?php
/**
 * Propone fotos candidatas de un producto — Google Custom Search JSON API
 * =============================================================================
 * Lo que el dueño pidió: que el panel PROPONGA imágenes y la persona elija una
 * con un clic, o suba la suya.
 *
 * POR QUÉ ESTA API Y NO LEER EL BUSCADOR DIRECTAMENTE:
 * Se comprobó el robots.txt de los dos buscadores grandes y AMBOS lo prohíben:
 *   Google      Disallow: /search
 *   DuckDuckGo  Disallow: /*?      ("# No search result pages")
 * Leer sus páginas de resultados sería pasar por encima de eso. La API de Google
 * Custom Search es la puerta que ellos mismos abren para esto: documentada,
 * gratuita hasta 100 consultas al día, y sin tarjeta.
 *
 * QUÉ DEVUELVE Y QUÉ NO:
 * Devuelve candidatas para que una PERSONA escoja. Nunca publica nada sola, y esa
 * es la línea que hace esto seguro: el riesgo real de este paso siempre fue
 * publicar la foto equivocada —la variante azul en el producto rojo—, y ninguna
 * heurística lo resuelve como alguien mirando la foto dos segundos.
 * Cada candidata viene con el SITIO de donde sale, para que se pueda preferir la
 * del fabricante sobre la de una tienda cualquiera.
 *
 * CONFIGURACIÓN (una sola vez, gratis y sin tarjeta) en backend/.env:
 *   GOOGLE_CSE_KEY=...   clave de API
 *   GOOGLE_CSE_ID=...    id del motor de búsqueda
 * Sin eso, el panel sigue funcionando: enseña los pasos para conseguirlas y deja
 * pegar o subir la foto a mano, que es la vía que nunca falla.
 */

final class BuscadorImagenes
{
    private const ENDPOINT   = 'https://www.googleapis.com/customsearch/v1';
    private const CACHE_DIAS = 30;   // la cuota es de 100/día: repetir una consulta es caro
    private const TIMEOUT    = 12;
    private const MAX        = 8;    // caben 8 en la cuadrícula sin tener que bajar
    /** Mismo mínimo que ImagenSegura::MIN_LADO: por debajo es un ícono, no una foto. */
    private const MIN_LADO   = 200;
    /* Versión de la caché. Súbela cada vez que cambie QUÉ se pide a Google o CÓMO
       se filtra lo que responde: la caché dura 30 días, así que sin esto un arreglo
       en esta clase tarda un mes en notarse y no hay forma de distinguir "no sirvió"
       de "lo tapó la caché". (v2: se quitó imgSize=medium y se filtra por MIN_LADO.) */
    private const CACHE_VER  = 2;

    public static function configurado(): bool
    {
        return trim((string) env('GOOGLE_CSE_KEY', '')) !== ''
            && trim((string) env('GOOGLE_CSE_ID', '')) !== '';
    }

    /** Pasos exactos para conseguir las credenciales, para enseñarlos en el panel. */
    public static function comoConfigurar(): array
    {
        return [
            'Entra a https://programmablesearchengine.google.com/ y crea un motor de búsqueda '
                . 'con la opción "Buscar en toda la web" y la BÚSQUEDA DE IMÁGENES activada. Copia su ID.',
            'Entra a https://developers.google.com/custom-search/v1/introduction y toca "Get a Key". '
                . 'Es gratis y no pide tarjeta.',
            'Pon las dos en backend/.env como GOOGLE_CSE_KEY y GOOGLE_CSE_ID, y vuelve a cargar el panel.',
            'Son 100 búsquedas gratis al día. Cada producto gasta una y se recuerda 30 días, '
                . 'así que volver a abrirlo no gasta otra.',
        ];
    }

    /**
     * Busca fotos del producto.
     * Devuelve ['imagenes' => [['url','miniatura','sitio','ancho','alto'], …], 'nota' => '…'].
     */
    public static function buscar(string $consulta): array
    {
        $consulta = trim($consulta);
        if ($consulta === '')      return ['imagenes' => [], 'nota' => 'Sin texto que buscar.'];
        if (!self::configurado())  return ['imagenes' => [], 'nota' => 'no_configurado'];

        $cache = self::cacheLeer($consulta);
        if ($cache !== null) return $cache;

        $url = self::ENDPOINT . '?' . http_build_query([
            'key'        => trim((string) env('GOOGLE_CSE_KEY', '')),
            'cx'         => trim((string) env('GOOGLE_CSE_ID', '')),
            'q'          => $consulta,
            'searchType' => 'image',
            'num'        => self::MAX,
            'safe'       => 'active',
            /* NO se manda imgSize. En esta API no es un mínimo sino un tamaño
               EXACTO: pedir 'medium' descartaba las grandes, que son justo las
               buenas para la ficha. Las chiquitas se filtran abajo por el tamaño
               que el propio Google reporta, y la validación de bytes las vuelve a
               revisar al descargarlas. */
            'gl'         => 'mx',      // sesgo a México: el catálogo es de aquí
            'hl'         => 'es',
        ]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_USERAGENT      => 'OkStation/1.0 (+https://okstation.mx)',
        ]);
        $resp = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($resp === false) return ['imagenes' => [], 'nota' => 'No se pudo consultar el buscador.'];

        $j = json_decode((string) $resp, true);

        /* 429 = se acabaron las 100 del día. Se distingue de un error de verdad
           porque no hay nada que arreglar: mañana vuelve solo. NO se cachea, o el
           "se acabó" quedaría guardado 30 días. */
        if ($code === 429 || (isset($j['error']['errors'][0]['reason']) && $j['error']['errors'][0]['reason'] === 'rateLimitExceeded')) {
            return ['imagenes' => [], 'nota' => 'Se acabaron las 100 búsquedas de hoy. Mañana se reinicia; '
                                              . 'mientras tanto puedes pegar la foto con Ctrl+V.'];
        }
        if ($code !== 200) {
            $m = (string) ($j['error']['message'] ?? "El buscador respondió {$code}.");
            return ['imagenes' => [], 'nota' => 'Buscador: ' . mb_strimwidth($m, 0, 140, '…')];
        }

        $out = [];
        foreach (($j['items'] ?? []) as $it) {
            $u = (string) ($it['link'] ?? '');
            /* Solo https: la descarga posterior también lo exige, así que ofrecer
               una http sería enseñar una candidata que luego no se puede guardar. */
            if ($u === '' || !str_starts_with($u, 'https://')) continue;
            $ctx = $it['image'] ?? [];
            /* Fuera los íconos y logos. Se usa el tamaño que reporta Google para no
               gastar una descarga en algo que la validación de bytes va a rechazar
               por chico de todos modos. */
            $an = (int) ($ctx['width'] ?? 0);
            $al = (int) ($ctx['height'] ?? 0);
            if ($an > 0 && $al > 0 && ($an < self::MIN_LADO || $al < self::MIN_LADO)) continue;
            $out[] = [
                'url'       => $u,
                'miniatura' => (string) ($ctx['thumbnailLink'] ?? $u),
                'sitio'     => preg_replace('/^www\./', '', (string) parse_url((string) ($ctx['contextLink'] ?? $u), PHP_URL_HOST)),
                'pagina'    => (string) ($ctx['contextLink'] ?? ''),
                'ancho'     => (int) ($ctx['width'] ?? 0),
                'alto'      => (int) ($ctx['height'] ?? 0),
            ];
        }

        $r = ['imagenes' => $out, 'nota' => $out ? '' : 'El buscador no encontró fotos de este producto.'];
        self::cacheEscribir($consulta, $r);
        return $r;
    }

    /* ── Caché en disco. Con 100 consultas al día, repetir una es caro. ─────── */
    private static function cachePath(string $q): string
    {
        $dir = sys_get_temp_dir() . '/okstation-imgbusca';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        return $dir . '/' . sha1(self::CACHE_VER . '|' . $q) . '.json';
    }
    private static function cacheLeer(string $q): ?array
    {
        $f = self::cachePath($q);
        if (!is_file($f) || (time() - filemtime($f)) > self::CACHE_DIAS * 86400) return null;
        $j = json_decode((string) file_get_contents($f), true);
        return is_array($j) ? $j : null;
    }
    private static function cacheEscribir(string $q, array $d): void
    {
        @file_put_contents(self::cachePath($q), json_encode($d));
    }
}

<?php
/**
 * Validación y guardado de imágenes de producto
 * =============================================================================
 * Lo usan el panel (cuando un trabajador elige una foto) y, más adelante, el
 * buscador por marca. Concentra aquí las comprobaciones porque son las mismas
 * siempre y porque una imagen mal validada tiene consecuencias reales:
 *
 *   · Una URL arbitraria traída del navegador es un SSRF de manual: si alguien
 *     manda http://169.254.169.254/… el servidor se lo pide a sí mismo y puede
 *     filtrar credenciales de la nube. Por eso solo HTTPS, solo dominios de una
 *     lista blanca, y se resuelve la IP para rechazar redes privadas.
 *   · Un archivo que "termina en .jpg" no es una imagen. Se comprueba el
 *     contenido real con getimagesize(), no la extensión ni el Content-Type.
 *   · Un logotipo de 60x60 en la ficha se ve peor que el placeholder de marca.
 *     Por eso hay tamaño mínimo.
 */

final class ImagenSegura
{
    /** Formatos que el sitio ya sabe servir. SVG queda FUERA: puede traer scripts. */
    public const MIMES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

    public const MIN_LADO   = 200;              // px; por debajo suele ser un ícono o un logo
    public const MAX_BYTES  = 8 * 1024 * 1024;  // 8 MB; más que eso no es una foto de producto

    /**
     * Dominios de los que SÍ se acepta descargar. No es una lista de "sitios buenos":
     * es la lista de sitios de los que este negocio ya obtiene contenido legítimamente
     * (su proveedor y la base de fichas que ya usa), más las marcas que se vayan
     * habilitando una por una tras comprobarlas.
     * Se compara por sufijo de dominio, así cubre sus subdominios y su CDN.
     */
    public static function dominiosPermitidos(): array
    {
        $extra = array_filter(array_map('trim', explode(',', (string) env('IMG_DOMINIOS_EXTRA', ''))));
        /* Los dominios de las marcas salen de BuscadorMarca, que es donde se
           registran. Si estuvieran duplicados aquí, habilitar una marca nueva
           exigiría acordarse de tocar DOS archivos y tarde o temprano alguien
           habilitaría el buscador y no la descarga. */
        $marcas = class_exists('BuscadorMarca') ? BuscadorMarca::todosLosDominios() : [];
        return array_merge([
            'exeldelnorte.com.mx',   // el proveedor: fuente de nivel 1
            'icecat.biz',            // la base de fichas que ya se consulta
            'iceimg.net',            // CDN de imágenes de Icecat
            /* NEXTEP sirve sus fotos desde su propio sitio. Es EL FABRICANTE —
               fuente autorizada según la regla del negocio— y sus imágenes se
               emparejan por número de parte, así que no puede colarse la de otro
               producto. Ver lib/Nextep.php. */
            'nextep.com.mx',
        ], $marcas, $extra);
    }

    /**
     * ¿Esta URL se puede pedir sin riesgo?
     * Devuelve [true, ''] o [false, 'motivo legible'].
     */
    /**
     * @param bool $elegidaPorPersona  true cuando un administrador la escogió en el
     *        panel viéndola. Entonces NO se exige la lista blanca de dominios — sí
     *        todo lo demás.
     *
     * Por qué esa distinción: la lista blanca protege la PROCEDENCIA, no la
     * seguridad. Sirve para que un proceso automático no publique una foto de
     * cualquier sitio. Pero cuando una persona ve la imagen y decide usarla, esa
     * garantía ya la da ella — y de hecho ya puede pegar cualquier imagen con
     * Ctrl+V, así que bloquear por dominio aquí no protege nada y solo impide
     * elegir una candidata que tiene enfrente.
     * Lo que NO se relaja nunca es la protección contra SSRF: solo https, y jamás
     * una dirección de red interna, venga de donde venga.
     */
    public static function urlPermitida(string $url, bool $elegidaPorPersona = false): array
    {
        $p = parse_url($url);
        if (!$p || empty($p['scheme']) || empty($p['host'])) return [false, 'La dirección no es válida.'];
        if (strtolower($p['scheme']) !== 'https')            return [false, 'Solo se aceptan direcciones https.'];

        $host = strtolower($p['host']);
        if (!$elegidaPorPersona) {
            $ok = false;
            foreach (self::dominiosPermitidos() as $d) {
                if ($host === $d || str_ends_with($host, '.' . $d)) { $ok = true; break; }
            }
            if (!$ok) return [false, "El dominio {$host} no está en la lista de fuentes autorizadas."];
        }

        /* Resolver la IP y rechazar redes internas. Un dominio de la lista blanca
           podría apuntar (por error o por ataque) a 127.0.0.1 o a la IP de metadatos
           de la nube; sin esta comprobación el servidor se consultaría a sí mismo. */
        $ip = gethostbyname($host);
        if ($ip === $host) return [false, 'No se pudo resolver el dominio.'];
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return [false, 'El dominio apunta a una dirección interna.'];
        }
        return [true, ''];
    }

    /**
     * Descarga una imagen de una URL ya validada. Devuelve [bytes, ''] o [null, 'motivo'].
     * NO sigue redirecciones: una redirección puede saltar fuera de la lista blanca y
     * ahí se pierde toda la protección de arriba.
     */
    public static function descargar(string $url, bool $elegidaPorPersona = false): array
    {
        [$ok, $motivo] = self::urlPermitida($url, $elegidaPorPersona);
        if (!$ok) return [null, $motivo];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_USERAGENT      => 'OkStation/1.0 (+panel)',
            /* Corta la descarga si el servidor manda algo enorme, sin esperar a
               tenerlo entero en memoria. */
            CURLOPT_NOPROGRESS     => false,
            CURLOPT_PROGRESSFUNCTION => function ($r, $bajado) { return $bajado > self::MAX_BYTES ? 1 : 0; },
        ]);

        /* Certificados intermedios que ALGUNOS servidores no mandan.
           El de nextep.com.mx solo envía su certificado de hoja y se salta el
           intermedio de GoDaddy, así que la verificación falla con el almacén
           normal ("unable to get local issuer certificate"). La salida fácil sería
           apagar CURLOPT_SSL_VERIFYPEER, y eso NO se hace nunca: dejaría la
           conexión abierta a que alguien se meta en medio y nos devuelva otra
           imagen. Se aporta el intermedio que falta y se verifica de verdad. */
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if (str_contains($host, 'nextep.com.mx') && is_file(__DIR__ . '/certs/godaddy-g2.pem')) {
            curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/certs/godaddy-g2.pem');
        }

        $data = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($data === false)  return [null, 'No se pudo descargar la imagen.'];
        if ($code !== 200)    return [null, "El servidor respondió {$code}."];
        return [$data, ''];
    }

    /**
     * Comprueba que los bytes SEAN una imagen usable y devuelve sus datos.
     * Devuelve [['ext','mime','w','h','bytes'], ''] o [null, 'motivo'].
     */
    public static function validarBytes(string $data): array
    {
        if (strlen($data) > self::MAX_BYTES) return [null, 'La imagen pesa más de 8 MB.'];

        /* getimagesize lee la CABECERA real del archivo. No se confía ni en la
           extensión ni en el Content-Type: los dos los controla quien manda el archivo. */
        $info = @getimagesizefromstring($data);
        if (!$info) return [null, 'El archivo no es una imagen que podamos leer.'];

        [$w, $h] = $info;
        $mime = (string) ($info['mime'] ?? '');
        if (!isset(self::MIMES[$mime])) {
            return [null, 'Formato no aceptado. Usa JPG, PNG, WEBP o GIF.'];
        }
        if ($w < self::MIN_LADO || $h < self::MIN_LADO) {
            return [null, "La imagen es muy chica ({$w}×{$h}). Mínimo " . self::MIN_LADO . "×" . self::MIN_LADO . " px."];
        }
        return [['ext' => self::MIMES[$mime], 'mime' => $mime, 'w' => $w, 'h' => $h, 'bytes' => strlen($data)], ''];
    }

    /**
     * Guarda la imagen en disco y devuelve la ruta pública (/assets/img/products/…).
     * Mismo esquema de carpetas que download-product-images.php, para que la tienda
     * la sirva sin cambiar nada.
     */
    public static function guardar(int $productId, string $data, string $ext): string
    {
        $webRoot = dirname(__DIR__, 3);                       // …/okstation.mx
        $dir     = $webRoot . '/assets/img/products/' . $productId;
        if (!is_dir($dir)) @mkdir($dir, 0775, true);

        /* Nombre estable y sin sorpresas: id del producto + huella del contenido. La
           huella evita pisar una foto distinta y, de paso, detecta duplicados. */
        $fname = $productId . '-' . substr(sha1($data), 0, 10) . '.' . $ext;
        file_put_contents($dir . '/' . $fname, $data);
        return '/assets/img/products/' . $productId . '/' . $fname;
    }
}

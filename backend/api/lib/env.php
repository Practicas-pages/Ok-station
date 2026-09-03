<?php
/**
 * Cargador de .env sin dependencias.
 * Lee pares CLAVE=valor a getenv()/$_ENV. Ignora comentarios (#) y vacíos.
 */
function load_env(string $path): void {
    /* SI NO ESTA DONDE SE PIDIO, SE BUSCA HACIA ARRIBA (3-sep-2026).
     *
     * Antes esto era `if (!is_file($path)) return;` y ahi se acababa: sin archivo, la
     * aplicacion arrancaba con TODOS los valores por omision y sin decir una palabra. El
     * sintoma no es un error, es peor — el sitio levanta, y lo que falla es lo que depende
     * de una llave: los correos no salen y nadie sabe por que.
     *
     * Y pasa de verdad. Comprobado en el servidor de produccion: el `.env` vive en
     * /home/okstation/.env —FUERA de la raiz web, que es donde debe estar por seguridad—
     * mientras config.php lo pedia en backend/.env. Ahi no habia nada, asi que
     * BREVO_API_KEY llegaba vacia y Ok.station no podia enviar un solo correo.
     *
     * Poner el .env dentro de la raiz web para que lo encuentre seria arreglarlo al reves:
     * ese archivo lleva la llave de Brevo y las credenciales de Mercado Pago. Lo que tiene
     * que ceder es el buscador, no el escondite.
     *
     * Se sube hasta tres niveles. Mas seria salirse de la cuenta del sitio. */
    if (!is_file($path)) {
        $nombre = basename($path);
        $dir    = dirname($path);
        for ($i = 0; $i < 3; $i++) {
            $dir = dirname($dir);
            if ($dir === '' || $dir === '/' || $dir === dirname($dir)) break;
            if (is_file($dir . '/' . $nombre)) { $path = $dir . '/' . $nombre; break; }
        }
    }
    if (!is_file($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        $pos = strpos($line, '=');
        if ($pos === false) continue;
        $k = trim(substr($line, 0, $pos));
        $v = trim(substr($line, $pos + 1));
        // Quitar comentario en línea (espacio + #), salvo valores entre comillas.
        if ($v !== '' && $v[0] !== '"' && $v[0] !== "'") {
            $v = preg_replace('/\s+#.*$/', '', $v);
            if (isset($v[0]) && $v[0] === '#') $v = '';
            $v = trim($v);
        }
        if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'")) {
            $v = substr($v, 1, -1);
        }
        if (getenv($k) === false) { putenv("$k=$v"); $_ENV[$k] = $v; }
    }
}

function env(string $key, $default = null) {
    $v = getenv($key);
    return $v === false ? $default : $v;
}

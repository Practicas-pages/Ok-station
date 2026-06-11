<?php
/**
 * Cargador de .env sin dependencias.
 * Lee pares CLAVE=valor a getenv()/$_ENV. Ignora comentarios (#) y vacíos.
 */
function load_env(string $path): void {
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

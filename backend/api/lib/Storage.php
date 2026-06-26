<?php
/**
 * Almacenamiento de archivos (PDFs de clientes, imágenes, tickets).
 * Usa STORAGE_PATH del .env (idealmente FUERA de la raíz pública).
 * Crea subcarpetas bajo demanda y nombres seguros y únicos.
 */
final class Storage
{
    /**
     * Carpeta base de almacenamiento. Resiliente al hosting: intenta primero la
     * ruta de STORAGE_PATH (.env); si no existe o no se puede escribir, usa como
     * respaldo `backend/storage` (que viaja con el despliegue y casi siempre es
     * escribible por el usuario del sitio). Así las subidas no se rompen aunque
     * STORAGE_PATH apunte a una ruta inválida en este servidor.
     */
    public static function base(): string
    {
        global $CONFIG;
        static $resolved = null;
        if ($resolved !== null) return $resolved;

        $candidates = [];
        $configured = trim((string) ($CONFIG['storage_path'] ?? ''));
        if ($configured !== '') $candidates[] = rtrim($configured, '/');
        /* Respaldo siempre disponible: <proyecto>/backend/storage */
        $candidates[] = rtrim(dirname(__DIR__, 2), '/') . '/storage';

        foreach ($candidates as $p) {
            if (!is_dir($p)) @mkdir($p, 0775, true);
            if (is_dir($p) && is_writable($p)) {
                self::protect($p);
                return $resolved = $p;
            }
        }
        /* Ninguna escribible: devolvemos la 1ª (el endpoint mostrará un error claro). */
        return $resolved = ($candidates[0] ?? (rtrim(dirname(__DIR__, 2), '/') . '/storage'));
    }

    /** Bloquea el acceso web directo a la carpeta (defensa en profundidad, Apache). */
    private static function protect(string $dir): void
    {
        $ht = $dir . '/.htaccess';
        if (!file_exists($ht)) {
            @file_put_contents(
                $ht,
                "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
                "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n"
            );
        }
        $idx = $dir . '/index.html';
        if (!file_exists($idx)) @file_put_contents($idx, '');
    }

    public static function dir(string $sub): string
    {
        $p = self::base() . '/' . trim($sub, '/');
        if (!is_dir($p)) @mkdir($p, 0775, true);
        return $p;
    }

    private static function safeName(string $name, ?string $forceExt = null): string
    {
        $base = preg_replace('/[^A-Za-z0-9._-]/', '_', pathinfo($name, PATHINFO_FILENAME));
        $ext  = $forceExt !== null
            ? $forceExt
            : strtolower(preg_replace('/[^A-Za-z0-9]/', '', pathinfo($name, PATHINFO_EXTENSION)));
        return date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '_' . $base . ($ext !== '' ? '.' . $ext : '');
    }

    /** Guarda contenido en memoria (p. ej. un ticket PDF generado). Devuelve la ruta. */
    public static function put(string $sub, string $filename, string $contents): string
    {
        $path = self::dir($sub) . '/' . self::safeName($filename);
        file_put_contents($path, $contents);
        return $path;
    }

    /**
     * Detecta el MIME REAL del archivo a partir de su contenido. Nunca usa el
     * tipo que envía el cliente ($_FILES['file']['type']), que es falsificable
     * (un atacante podría declarar image/jpeg para colar otro contenido).
     * Devuelve '' si no se puede determinar; el llamador debe rechazar en ese caso.
     */
    public static function detectMime(string $tmpPath): string
    {
        if (is_readable($tmpPath) && class_exists('finfo')) {
            $fi = new finfo(FILEINFO_MIME_TYPE);
            $m  = $fi->file($tmpPath);
            if (is_string($m) && $m !== '' && $m !== 'application/octet-stream') return $m;
        }
        if (function_exists('mime_content_type')) {
            $m = @mime_content_type($tmpPath);
            if (is_string($m) && $m !== '') return $m;
        }
        return '';
    }

    /** Mueve un archivo subido ($_FILES[...]). $forceExt fuerza una extensión segura. */
    public static function moveUploaded(string $sub, array $file, ?string $forceExt = null): string
    {
        $path = self::dir($sub) . '/' . self::safeName($file['name'], $forceExt);
        if (!move_uploaded_file($file['tmp_name'], $path)) {
            throw new RuntimeException('No se pudo guardar el archivo.');
        }
        return $path;
    }
}

<?php
/**
 * Almacenamiento de archivos (PDFs de clientes, imágenes, tickets).
 * Usa STORAGE_PATH del .env (idealmente FUERA de la raíz pública).
 * Crea subcarpetas bajo demanda y nombres seguros y únicos.
 */
final class Storage
{
    public static function base(): string
    {
        global $CONFIG;
        $p = $CONFIG['storage_path'] ?? (__DIR__ . '/../../storage');
        if (!is_dir($p)) @mkdir($p, 0775, true);
        return rtrim($p, '/');
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
        $dir  = self::dir($sub);
        $path = $dir . '/' . self::safeName($file['name'], $forceExt);
        $tmp  = (string) ($file['tmp_name'] ?? '');

        /* ── DIAGNÓSTICO TEMPORAL (quitar cuando se resuelva el HTTP 500) ──
           Escribe en el error_log de PHP-FPM toda la información del intento. */
        error_log('[OKS-UPLOAD] sub=' . $sub . ' dir=' . $dir . ' dir_writable=' . (is_writable($dir) ? '1' : '0'));
        error_log('[OKS-UPLOAD] _FILES=' . json_encode($file));
        error_log('[OKS-UPLOAD] dest=' . $path);
        error_log('[OKS-UPLOAD] is_uploaded_file=' . (is_uploaded_file($tmp) ? '1' : '0') . ' tmp=' . $tmp);

        $ok = move_uploaded_file($tmp, $path);
        error_log('[OKS-UPLOAD] move_uploaded_file=' . ($ok ? '1' : '0'));

        if (!$ok) {
            $tmpDir = ini_get('upload_tmp_dir') ?: sys_get_temp_dir();
            error_log('[OKS-UPLOAD] error_get_last=' . json_encode(error_get_last()));
            error_log('[OKS-UPLOAD] file_error=' . ($file['error'] ?? 'n/a')
                . ' upload_max_filesize=' . ini_get('upload_max_filesize')
                . ' post_max_size=' . ini_get('post_max_size')
                . ' upload_tmp_dir=' . (ini_get('upload_tmp_dir') ?: '(vacío)')
                . ' sys_get_temp_dir=' . sys_get_temp_dir()
                . ' tmp_dir_writable=' . (is_writable($tmpDir) ? '1' : '0'));
            throw new RuntimeException(
                'move_uploaded_file=false; dest=' . $path . '; tmp=' . $tmp .
                '; is_uploaded_file=' . (is_uploaded_file($tmp) ? '1' : '0') .
                '; file_error=' . ($file['error'] ?? 'n/a') .
                '; tmp_dir=' . $tmpDir . '; tmp_dir_writable=' . (is_writable($tmpDir) ? '1' : '0')
            );
        }
        return $path;
    }
}

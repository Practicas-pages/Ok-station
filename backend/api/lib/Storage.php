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

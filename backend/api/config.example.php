<?php
/**
 * OK.station — Configuración del backend (lee de .env)
 * --------------------------------------------------------------
 * PASOS:
 *   1) Copia  backend/.env.example  a  backend/.env  y complétalo.
 *   2) Copia este archivo como  config.php  (no requiere edición:
 *      toma todo desde .env).
 *
 * Ni .env ni config.php se suben al repositorio (ver .gitignore).
 * --------------------------------------------------------------
 */
require_once __DIR__ . '/lib/env.php';
load_env(__DIR__ . '/../.env');   // backend/.env

return [
    'db' => [
        'host'    => env('DB_HOST', '127.0.0.1'),
        'port'    => (int) env('DB_PORT', 3306),
        'name'    => env('DB_NAME', 'okstation'),
        'user'    => env('DB_USER', 'root'),
        'pass'    => env('DB_PASS', ''),
        'charset' => 'utf8mb4',
    ],
    'jwt_secret'   => env('JWT_SECRET', 'CAMBIA_ESTA_CLAVE'),
    'jwt_ttl'      => (int) env('JWT_TTL', 604800),
    'cors_origin'  => env('CORS_ORIGIN', '*'),
    'app_url'      => env('APP_URL', 'https://okstation.mx'),
    'dev_mode'     => env('APP_ENV', 'production') !== 'production',
    'admin_emails' => array_filter(array_map('trim', explode(',', (string) env('ADMIN_EMAILS', '')))),
    'storage_path' => env('STORAGE_PATH', __DIR__ . '/../storage'),
    'max_upload_mb' => (int) env('MAX_UPLOAD_MB', 25),
];

<?php
/**
 * OK.station — Configuración del backend (lee de .env)
 * --------------------------------------------------------------
 * 1) Copia  backend/.env.example  a  backend/.env  y complétalo.
 * 2) Copia este archivo como  config.php  (no se edita: todo sale del .env).
 *
 * Ni .env ni config.php se suben al repositorio (ver .gitignore).
 * NUNCA hay credenciales fijas en el código.
 * --------------------------------------------------------------
 */
require_once __DIR__ . '/lib/env.php';
load_env(__DIR__ . '/../.env');   // backend/.env

return [
    'db' => [
        'host'    => env('DATABASE_HOST', '127.0.0.1'),
        'port'    => (int) env('DATABASE_PORT', 3306),
        'name'    => env('DATABASE_NAME', 'okstation'),
        'user'    => env('DATABASE_USER', 'root'),
        'pass'    => env('DATABASE_PASSWORD', ''),
        'charset' => 'utf8mb4',
    ],

    'jwt_secret'    => env('JWT_SECRET', ''),
    'jwt_ttl'       => (int) env('JWT_TTL', 604800),

    'app_url'       => env('APP_URL', 'https://okstation.mx'),
    'app_env'       => env('APP_ENV', 'production'),
    'cors_origin'   => env('CORS_ORIGIN', 'https://okstation.mx'),
    'dev_mode'      => env('APP_ENV', 'production') !== 'production',

    'admin_emails'  => array_filter(array_map('trim', explode(',', (string) env('ADMIN_EMAILS', '')))),

    'storage_path'  => rtrim((string) env('STORAGE_PATH', __DIR__ . '/../storage'), '/'),
    'max_upload_mb' => (int) env('MAX_UPLOAD_MB', 25),

    'smtp' => [
        'host'      => env('SMTP_HOST', ''),
        'port'      => (int) env('SMTP_PORT', 587),
        'user'      => env('SMTP_USER', ''),
        'pass'      => env('SMTP_PASSWORD', ''),
        'from'      => env('SMTP_FROM', env('SMTP_USER', 'no-reply@okstation.mx')),
        'from_name' => env('SMTP_FROM_NAME', 'OK.station'),
    ],
];

<?php
/**
 * Ok.station — Configuración del backend (lee de .env)
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

    /* Reseñas de Google (Places API). Si quedan vacías, el sitio solo muestra
       las reseñas propias (no rompe nada). */
    'google_places_api_key' => env('GOOGLE_PLACES_API_KEY', ''),
    'google_place_id'       => env('GOOGLE_PLACE_ID', ''),

    'storage_path'  => rtrim((string) env('STORAGE_PATH', __DIR__ . '/../storage'), '/'),
    'max_upload_mb' => (int) env('MAX_UPLOAD_MB', 25),

    'smtp' => [
        'host'      => env('SMTP_HOST', ''),
        'port'      => (int) env('SMTP_PORT', 587),
        'user'      => env('SMTP_USER', ''),
        'pass'      => env('SMTP_PASSWORD', ''),
        'from'      => env('SMTP_FROM', env('SMTP_USER', 'no-reply@okstation.mx')),
        'from_name' => env('SMTP_FROM_NAME', 'Ok.station'),
    ],

    /* Correo transaccional con Brevo (API HTTP, permite ADJUNTAR el comprobante PDF).
       Si BREVO_API_KEY queda vacío, el sistema usa el SMTP de arriba (sin adjuntos).
       El remitente DEBE estar verificado en Brevo (Senders, Domains & IPs). */
    'brevo' => [
        'api_key'   => env('BREVO_API_KEY', ''),
        'from'      => env('MAIL_FROM', env('SMTP_FROM', env('SMTP_USER', 'no-reply@okstation.mx'))),
        'from_name' => env('MAIL_FROM_NAME', env('SMTP_FROM_NAME', 'Ok.station')),
    ],

    /* Pago en línea. Por defecto 'sandbox' (checkout local de demo, sin pasarela).
       Para cobrar de verdad: PAYMENT_PROVIDER=stripe y completa las llaves. */
    'payment' => [
        'provider'              => env('PAYMENT_PROVIDER', 'sandbox'),   // sandbox | stripe | mercadopago
        'currency'              => env('PAYMENT_CURRENCY', 'MXN'),
        'sandbox_secret'        => env('PAYMENT_SANDBOX_SECRET', ''),     // secreto del webhook de sandbox
        'stripe_secret'         => env('STRIPE_SECRET_KEY', ''),
        'stripe_webhook_secret' => env('STRIPE_WEBHOOK_SECRET', ''),
        /* Mercado Pago (Checkout Pro). access_token = secreto de servidor;
           public_key solo se usa si el front llega a usar el SDK/Bricks de MP. */
        'mp_access_token'       => env('MP_ACCESS_TOKEN', ''),
        'mp_public_key'         => env('MP_PUBLIC_KEY', ''),
        'mp_webhook_secret'     => env('MP_WEBHOOK_SECRET', ''),
    ],
];

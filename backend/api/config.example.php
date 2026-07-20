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

    /* Correo del NEGOCIO: recibe un aviso cuando entra un pedido o una cita nueva.
       Si no se define, el código usa 'station@okdock.mx' por defecto. */
    'business_email' => env('BUSINESS_EMAIL', 'station@okdock.mx'),

    /* Reseñas de Google (Places API). Si quedan vacías, el sitio solo muestra
       las reseñas propias (no rompe nada). */
    'google_places_api_key' => env('GOOGLE_PLACES_API_KEY', ''),
    'google_place_id'       => env('GOOGLE_PLACE_ID', ''),

    'storage_path'  => rtrim((string) env('STORAGE_PATH', __DIR__ . '/../storage'), '/'),
    /* Tope por archivo. 100 MB para permitir documentos grandes (100–200 pág).
       OJO: el php.ini del servidor también debe permitir upload_max_filesize y
       post_max_size >= este valor, si no PHP rechaza la subida antes. */
    'max_upload_mb' => (int) env('MAX_UPLOAD_MB', 100),

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

    /* Chatbot OKi (Claude / Anthropic). La llave es SECRETO DE SERVIDOR: solo
       backend, nunca en el navegador. Si ANTHROPIC_API_KEY queda vacío, OKi
       responde con su mensaje de respaldo y deriva a WhatsApp (no rompe el sitio).
       Modelo por defecto: claude-opus-4-8 (máxima inteligencia). Para mucho
       volumen y menor costo puedes cambiarlo a claude-haiku-4-5 en el .env. */
    'anthropic' => [
        'api_key' => env('ANTHROPIC_API_KEY', ''),
        'model'   => env('ANTHROPIC_MODEL', 'claude-opus-4-8'),
    ],

    /* Cerebro IA GRATIS de OKi (Google Gemini). Llave SOLO en backend/.env
       (GEMINI_API_KEY). Vacío = OKi usa su cerebro por reglas + WhatsApp. */
    'gemini' => [
        'api_key' => env('GEMINI_API_KEY', ''),
        'model'   => env('GEMINI_MODEL', 'gemini-flash-lite-latest'),
    ],

    /* Icecat — enriquece los productos de la tienda con ficha técnica e imágenes.
       COMPLEMENTA a Exel del Norte (match por código de barras GTIN/EAN). Secreto de
       servidor: solo backend/.env. Vacío = los productos se quedan con lo de Exel
       (no rompe la tienda).
         · ICECAT_USERNAME  = usuario/shopname de Icecat (Open Icecat: 'openicecat-live').
         · ICECAT_API_TOKEN = token de API (solo Full Icecat; Open no lo requiere).
         · ICECAT_LANG      = idioma de la ficha (por defecto ES). */
    'icecat' => [
        'username'  => env('ICECAT_USERNAME', ''),
        'api_token' => env('ICECAT_API_TOKEN', ''),
        'lang'      => env('ICECAT_LANG', 'ES'),
    ],
];

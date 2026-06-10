<?php
require __DIR__ . '/_bootstrap.php';
only_method('POST');
// Con JWT sin estado, el "logout" se realiza en el cliente borrando el token.
// Este endpoint existe por consistencia y para futuras listas de revocación.
require_auth();
respond(['ok' => true, 'message' => 'Sesión cerrada.']);

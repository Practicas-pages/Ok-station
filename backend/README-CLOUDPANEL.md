# OK.station — Backend de cuentas (PHP + MySQL) · Guía CloudPanel

API sin dependencias (PHP puro + PDO) lista para CloudPanel (Nginx + PHP-FPM + MySQL/MariaDB).
Implementa la **Fase 1: cuentas** (registro, login, perfil, cambio y recuperación de contraseña) con **JWT**.

## Estructura
```
backend/
├─ schema.sql                 ← base de datos (importar una vez)
├─ README-CLOUDPANEL.md       ← esta guía
└─ api/
   ├─ config.example.php      ← copiar a config.php y completar
   ├─ _bootstrap.php          ← CORS, PDO, JWT y helpers
   ├─ register.php   POST     ← crear cuenta
   ├─ login.php      POST     ← iniciar sesión
   ├─ me.php         GET/PUT  ← ver / actualizar perfil (requiere token)
   ├─ change-password.php POST← cambiar contraseña (requiere token)
   ├─ forgot-password.php POST← solicitar enlace de reseteo
   ├─ reset-password.php  POST← fijar nueva contraseña con token
   └─ logout.php     POST     ← cierre de sesión
```

## Pasos en CloudPanel (cuando tengas acceso)

1. **Crear el sitio**
   - CloudPanel → *Add Site* → PHP (Nginx). Usa tu dominio (p. ej. `okstation.mx`).
   - PHP 8.1+ recomendado.

2. **Crear la base de datos**
   - CloudPanel → *Databases* → *Add Database*. Anota: nombre, usuario y contraseña.
   - Importa `schema.sql` (phpMyAdmin → Importar, o `mysql < schema.sql`).

3. **Subir los archivos**
   - Sube la carpeta `backend/` a la raíz del sitio (queda accesible como `https://tudominio/backend/api/...`).
   - El front (`index.html`, `cuenta.html`, etc.) va en la raíz pública del sitio.

4. **Configurar credenciales**
   - Copia `api/config.example.php` a `api/config.php`.
   - Rellena `db` (host `127.0.0.1`, nombre, usuario, contraseña).
   - Cambia `jwt_secret` por una cadena larga:
     `php -r "echo bin2hex(random_bytes(48));"`
   - `cors_origin`: pon tu dominio real (p. ej. `https://okstation.mx`).
   - `dev_mode` → `false` en producción.
   - `config.php` está en `.gitignore` (no se sube al repo).

5. **Apuntar el front al API**
   - En `assets/auth.js`, la constante `API_BASE` por defecto es `/backend/api`
     (correcto si front y API están en el mismo dominio). Cámbiala solo si difieren.

6. **Header Authorization (si hiciera falta)**
   - Algunos Nginx no pasan el header. Si `me.php` responde 401 con token válido,
     añade en el vhost (CloudPanel → *Vhost*):
     ```
     fastcgi_param HTTP_AUTHORIZATION $http_authorization;
     ```

7. **Correo de recuperación (opcional pero recomendado)**
   - `forgot-password.php` usa `mail()`. Para entrega fiable, configura SMTP
     (p. ej. PHPMailer + tu proveedor). Mientras tanto, con `dev_mode=true`
     el enlace de reseteo se devuelve en la respuesta para pruebas.

## Probar rápido (con curl)
```bash
# Registro
curl -X POST https://tudominio/backend/api/register.php \
  -H "Content-Type: application/json" \
  -d '{"full_name":"María González","email":"maria@ej.com","phone":"6640000000","password":"clave1234","password_confirm":"clave1234"}'

# Login (guarda el "token")
curl -X POST https://tudominio/backend/api/login.php \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@ej.com","password":"clave1234"}'

# Perfil (usa el token)
curl https://tudominio/backend/api/me.php -H "Authorization: Bearer EL_TOKEN"
```

## Seguridad incluida
- Contraseñas con `password_hash` (bcrypt) y `password_verify`.
- Consultas **preparadas** (PDO) → sin inyección SQL.
- JWT firmado (HS256) con tu secreto.
- Mensajes genéricos en login y recuperación (no filtran si un correo existe).
- Tokens de reseteo **hasheados** en BD y con expiración (1 h).
- `config.php` fuera del control de versiones.

## Pendiente (siguientes fases)
- Fase 2: configurador de impresión + pedidos (`orders`, `order_files`) + ticket PDF/QR.
- Fase 3: reseñas (`reviews`) + panel de estados para el personal.
Las tablas ya están en `schema.sql` para no re-migrar.

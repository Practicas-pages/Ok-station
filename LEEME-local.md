# Correr Ok.station en tu compu (Laragon)

Laragon es solo un entorno de desarrollo local: **no cambia el código ni el deploy**.
Producción sigue igual.

> Ya te dejé preparado y **funcionando**:
> - Base de datos local `okstation` creada, con las 37 migraciones aplicadas.
> - `backend/.env` local (pagos en sandbox, sin llaves reales) y `backend/api/config.php`.
> - El `.env` de producción con las llaves reales está en `backend/.env.produccion.bak`
>   (git lo ignora). **No lo compartas.**
> - El sitio corriendo en **http://localhost:8000**

## El sitio ya está corriendo
Ábrelo en el navegador: **http://localhost:8000**
Regístrate con tu correo. Para entrar al panel (`/admin.html`) tu cuenta necesita el
rol **Administrador**; registrarse solo te deja como Cliente. Para dártelo en local:

    INSERT IGNORE INTO user_roles (user_id, role_id)
    SELECT u.id, r.id FROM users u, roles r
    WHERE u.email = 'TU-CORREO' AND r.slug = 'administrador';

¿Olvidaste la contraseña? En local no se manda correo, pero en modo desarrollo el
endpoint te devuelve el enlace de restablecimiento en la propia respuesta:

    curl -X POST http://localhost:8000/backend/api/forgot-password.php ^
      -H "Content-Type: application/json" -d "{\"email\":\"TU-CORREO\"}"

Abre el `dev_reset_link` que viene en la respuesta (vale 1 hora, un solo uso).

## Cómo prender / apagar el servidor local
Se sirve con el PHP de Laragon en el puerto 8000. (Se usa 8000 en vez del dominio
`okstation.test` porque el vhost de Apache pide agregar una línea al archivo `hosts`
de Windows, y eso necesita permisos de administrador.)

Abre la **Terminal de Laragon** en la carpeta del proyecto.

Prender (si no está corriendo):

    php -S 127.0.0.1:8000 -t .

Apagar: cierra esa terminal, o desde PowerShell:

    Get-NetTCPConnection -LocalPort 8000 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }

## Encender OKi (el chatbot con IA)
Pon tu llave de Anthropic en `backend/.env`:

    ANTHROPIC_API_KEY=sk-ant-...     (sácala en https://console.anthropic.com)

**Importante:** después de pegar la llave, **reinicia el servidor** (apágalo y vuelve
a correr `php -S ...`), porque las variables del `.env` se leen al arrancar.
Sin llave, OKi igual responde con su mensaje de respaldo que deriva a WhatsApp.

Prueba rápida del endpoint (PowerShell):

    Invoke-WebRequest http://localhost:8000/backend/api/oki/chat.php -Method POST `
      -Body '{"message":"cuanto cuesta una foto para pasaporte?"}' `
      -ContentType "application/json" | Select -Expand Content

## Catálogo de la tienda en local (Exel + Icecat)

La tienda se alimenta de la tabla `products`, que llena el runner del proveedor **Exel**.
Sin la API key de Exel puedes probar con el feed de muestra que ya viene en el repo:

    php backend/tools/exel-sync.php --file=backend/tools/sample-exel-feed.json

Luego "vístelos" con **Icecat** (ficha técnica + imágenes, máx 5 por producto):

    php backend/tools/icecat-enrich.php

Para que Icecat funcione, pon esto en `backend/.env` (es un usuario gratis de pruebas,
no requiere token):

    ICECAT_USERNAME=openicecat-live
    ICECAT_LANG=ES

### Windows: los certificados de PHP (esto falla EN SILENCIO)
El PHP de Laragon **no trae el bundle de certificados**, así que cualquier llamada HTTPS
desde PHP falla (Icecat, Exel, Mercado Pago...). Lo engañoso: el enricher lo reporta como
*"no está en Icecat"* cuando en realidad es un error de SSL (`errno 60`).

Arréglalo **una sola vez** en el `php.ini` de Laragon
(`C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.ini`), descomentando estas dos líneas
y poniéndoles la ruta:

    curl.cainfo = "C:\laragon\etc\ssl\cacert.pem"
    openssl.cafile="C:\laragon\etc\ssl\cacert.pem"

Reinicia el servidor (y Laragon, si sirves con Apache). Para comprobar que quedó:

    php -r "var_dump(ini_get('curl.cainfo'));"

En el servidor Linux esto no pasa: usa los certificados del sistema.

## Si otro día vuelves a empezar de cero
1. Laragon → Start All (Apache + MySQL).
2. Crear la base `okstation` en HeidiSQL (si no existe).
3. `php backend/database/migrate.php`  (aplica migraciones; es idempotente).
4. `php -S 127.0.0.1:8000 -t .`  y abre http://localhost:8000

## Notas
- `backend/.env`, `backend/api/config.php` y la base local son TUYOS: git los ignora.
  No chocan con el trabajo de tu compañero.
- Pagos en local: modo **sandbox** (sin cargos reales). Las llaves reales de Mercado
  Pago solo viven en producción y en tu respaldo.
- Los correos no se envían en local (SMTP vacío a propósito). Es normal.
- Para integrar cambios entre los dos: rama nueva → Pull Request contra `main`.
- ¿Quieres el dominio bonito `http://okstation.test`? Crea un acceso en
  `C:\laragon\www\okstation` apuntando a esta carpeta, agrega `127.0.0.1 okstation.test`
  al archivo hosts (como administrador), dale **Reload** en Laragon, y regresa
  `APP_URL`/`CORS_ORIGIN` del `.env` a `http://okstation.test`. No es necesario.

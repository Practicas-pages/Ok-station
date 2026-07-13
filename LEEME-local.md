# Correr Ok.station en tu compu (Laragon)

Laragon es solo un entorno de desarrollo local: **no cambia el código ni el deploy**.
Producción sigue igual.

> Ya te dejé preparado y **funcionando**:
> - Base de datos local `okstationv2` creada, con las 28 migraciones aplicadas.
> - `backend/.env` local (pagos en sandbox, sin llaves reales) y `backend/api/config.php`.
> - El `.env` de producción con las llaves reales está en `backend/.env.produccion.bak`
>   (git lo ignora). **No lo compartas.**
> - El sitio corriendo en **http://localhost:8000**

## El sitio ya está corriendo
Ábrelo en el navegador: **http://localhost:8000**
Regístrate con tu correo (`aguirre@okdock.mx` ya está como administrador).

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

## Si otro día vuelves a empezar de cero
1. Laragon → Start All (Apache + MySQL).
2. Crear la base `okstationv2` en HeidiSQL (si no existe).
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

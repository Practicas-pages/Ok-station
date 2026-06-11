# OK.station — Puesta en PRODUCCIÓN (CloudPanel)

Guía paso a paso para conectar la base de datos real y dejar el sitio funcional.
Todo usa **variables de entorno** (`backend/.env`); **no hay credenciales en el código**.

---

## 0. Resumen de lo que se conecta
- **Funcional contra BD real ahora:** registro, login, recuperación de contraseña (SMTP), perfil, reseñas (crear/editar/eliminar), roles/permisos/administradores/empleados (todo desde la BD).
- **Preparado (esquema + storage listos, falta el flujo de captura):** pedidos, archivos vinculados y tickets PDF → ver §8.

---

## 1. Subir archivos
- Front (raíz pública): `index.html`, `cuenta.html`, `perfil.html`, `recuperar.html`, `restablecer.html`, `admin.html`, `styles.css`, `app.js`, `assets/`, `robots.txt`, `sitemap.xml`.
- Backend: carpeta `backend/` completa.
- **No subir** a producción: `serve.ps1`, `.claude/`, `screenshots/`, `backend/schema.sql` (versión vieja simple — usa las migraciones).

## 2. Crear la base de datos (CloudPanel → Databases → Add)
Anota: **host** (normalmente `127.0.0.1`), **puerto** (`3306`), **nombre**, **usuario**, **contraseña**.

## 3. Configurar variables de entorno
```bash
cp backend/.env.example backend/.env
nano backend/.env
```
Rellena `DATABASE_*`, `APP_URL`, `CORS_ORIGIN`, `ADMIN_EMAILS`, `SMTP_*`, `STORAGE_PATH` y genera el secreto:
```bash
php -r "echo bin2hex(random_bytes(48));"   # pégalo en JWT_SECRET
```
> `STORAGE_PATH` debe apuntar **fuera de la raíz pública** (p. ej. `/home/<sitio>/storage`).

## 4. Importar la base de datos (migraciones)
Desde la terminal del sitio en CloudPanel:
```bash
bash deploy/deploy.sh
```
Esto crea `config.php`, **aplica todas las migraciones** (`0001`–`0004`, con índices, FKs, restricciones y seed de roles/permisos) y prepara el storage.
> Alternativa manual: `php backend/database/migrate.php`
> Alternativa por phpMyAdmin: importa `backend/database/migrations/` en orden (0001→0004).

## 5. HTTPS
- CloudPanel emite y renueva el certificado **Let's Encrypt** automáticamente (botón *SSL/TLS* del sitio).
- En el **Vhost** del sitio, pega las directivas de `deploy/nginx-seguridad.conf`
  (HSTS, CSP, compresión, caché) y **muy importante** para el login (JWT), añade en el bloque PHP:
  ```nginx
  fastcgi_param HTTP_AUTHORIZATION $http_authorization;
  ```
- Asegúrate de que `APP_URL` y `CORS_ORIGIN` usen `https://`.

## 6. SMTP (recuperación de contraseña)
- En CloudPanel puedes usar el SMTP de tu dominio o un proveedor (Zoho, Brevo, Mailgun, Google Workspace…).
- Rellena `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS recomendado), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
- Prueba: usa "¿Olvidaste tu contraseña?" en `cuenta.html`; debe llegar el correo con el enlace.
- Con `APP_ENV=development` el enlace de reseteo se devuelve en la respuesta para depurar.

## 7. Backups
- **CloudPanel** trae backups del sitio y de la BD (configúralos en el panel: frecuencia y retención).
- Backup manual de BD:
  ```bash
  mysqldump -u USUARIO -p NOMBRE_BD > okstation_$(date +%F).sql
  ```
- Cron diario (crontab del sitio):
  ```bash
  0 3 * * * mysqldump -u USUARIO -pCONTRASEÑA NOMBRE_BD | gzip > /home/<sitio>/backups/db_$(date +\%F).sql.gz
  ```
- Incluye también `STORAGE_PATH` en tus backups (archivos de clientes y tickets).

## 8. Pendiente para 100% (pedidos / archivos / tickets)
El **esquema** (`orders`, `order_items`, `uploaded_files`, `orders.ticket_path`) y el **almacenamiento** (`lib/Storage.php`) ya están listos. Falta construir:
- El **configurador de impresión** (front) que arma el pedido y sube archivos.
- Endpoints `orders/*` (crear pedido + items + subir archivos a `uploads/`) y la **generación del ticket PDF** (a `tickets/`, guardando la ruta en `orders.ticket_path`).
Es la siguiente fase; el resto ya queda productivo.

## 9. Verificación rápida
```bash
# Registro (usa tu correo de ADMIN_EMAILS)
curl -X POST https://TU_DOMINIO/backend/api/register.php -H "Content-Type: application/json" \
  -d '{"full_name":"Admin OK","email":"TU_CORREO","phone":"6640000000","password":"clave1234","password_confirm":"clave1234"}'
# Debe devolver token y user con roles incluyendo "administrador".
```
Luego entra a `admin.html` → debe permitirte el acceso. Publica una reseña en la home → se guarda en la BD.

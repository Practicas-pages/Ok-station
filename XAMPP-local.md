# Correr el proyecto en local con XAMPP

Guía para levantar OK.station en tu PC usando **XAMPP** (Apache + MySQL + PHP).
Ya quedó configurado el 13-jul-2026. Aquí queda escrito por si hay que repetirlo
o para tus compañeros.

> Nota: XAMPP se maneja desde su **Panel de Control** (Apache / MySQL con botones
> Start/Stop). No hace falta pagar nada, ni licencias.

---

## 1. Cómo se sirve el proyecto

El proyecto se sirve en **http://localhost:8000** (no en el 80).
Se eligió el **8000** a propósito, porque es el mismo que ya tenía tu
`backend/.env` (`APP_URL=http://localhost:8000`), así **no hay que cambiar nada**
del backend ni se rompe el CORS.

- **http://localhost:8000** → el sitio (OK.station).
- **http://localhost** (puerto 80) → sigue mostrando el dashboard de XAMPP y
  **phpMyAdmin** (http://localhost/phpmyadmin). No se tocó.

Esto se logró con un **Virtual Host** agregado en:
`C:\xampp\apache\conf\extra\httpd-vhosts.conf`

(Se dejó un respaldo del original en `httpd-vhosts.conf.bak-20260713`.)
No se modificó el `httpd.conf` principal, así que es fácil de revertir: borra el
bloque "OK.station" de ese archivo (o restaura el `.bak`) y reinicia Apache.

El bloque agregado usa la **ruta corta 8.3** de la carpeta
(`C:\Users\USUARIO\DOWNLO~1\OKSTAT~1`) para que Apache no se confunda con el
espacio y el acento de "OKStation Página Web".

---

## 2. Encender / apagar

En el **Panel de Control de XAMPP**:

1. Botón **Start** en **Apache** → ya sirve el sitio en http://localhost:8000
2. Botón **Start** en **MySQL** → para la base de datos (login, citas, pedidos)

Para apagar, botón **Stop** en cada uno.

> Si alguna vez el puerto 80 está ocupado por otra cosa (por ejemplo Laragon),
> ciérrala. Solo un programa puede usar el puerto 80 a la vez.

---

## 3. Base de datos — YA QUEDÓ LISTA (13-jul-2026)

La base `okstationv2` **ya se reconstruyó** en la MariaDB de XAMPP con las 28
migraciones del proyecto. El backend (`backend/.env`) usa:

```
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=okstationv2
DATABASE_USER=root
DATABASE_PASSWORD=   (vacío — el root de XAMPP no trae contraseña; coincide con el .env)
```

Como el `.env` ya tenía la contraseña **vacía**, coincide con el root de XAMPP y
**no hubo que cambiar nada**.

### Cómo se hizo (por si hay que repetirlo o para un compañero)

```bat
:: 1) crear la base (MySQL de XAMPP encendido)
C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS okstationv2 CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"

:: 2) correr las migraciones (desde la carpeta del proyecto)
C:\xampp\php\php.exe backend\database\migrate.php
```

El runner es **idempotente**: si lo corres otra vez, no repite nada.

> **Nota:** los datos de prueba viejos vivían en la MySQL de Laragon (MySQL 8.4).
> Al desinstalar Laragon se perdió ese motor y MariaDB 10.4 no puede leer esos
> archivos, así que la base quedó **con el esquema y los seeds, pero sin los datos
> de prueba anteriores** (eran solo locales). La base ya tiene roles, settings y
> precios; **aún no hay usuarios** → crea tu cuenta desde la página (cuenta.html)
> para probar login/citas/pedidos. phpMyAdmin sigue en http://localhost/phpmyadmin.

---

## 4. Comprobar que todo jala

Con Apache encendido:

- http://localhost:8000 → debe abrir el sitio.
- http://localhost:8000/tienda → la tienda (URL limpia, sin `.html`).
- El astronauta **OKi** aparece abajo a la derecha y responde.

Ya se probó end-to-end el 13-jul-2026: home, URLs limpias del `.htaccess`,
la tienda y el cerebro de OKi (`/backend/api/oki/chat.php`) responden bien.

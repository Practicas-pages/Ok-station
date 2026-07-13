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

## 3. Base de datos (solo si necesitas login / citas / pedidos / admin)

La parte pública (home, tienda, OKi, precios) **funciona sin base de datos**.
Pero login, agendar citas, pedidos y el panel de admin **sí** la necesitan.

El backend (`backend/.env`) espera:

```
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=okstationv2
DATABASE_USER=root
DATABASE_PASSWORD=(la que tengas en tu .env)
```

**Ojo:** el MySQL de XAMPP trae el usuario `root` **sin contraseña** por defecto.
Tienes dos caminos:

- **A)** Dejar el `.env` con `DATABASE_PASSWORD=` (vacío) y usar el root sin
  contraseña de XAMPP. (Lo más rápido en local.)
- **B)** Ponerle a MySQL de XAMPP la misma contraseña que tiene tu `.env`.

Y en cualquier caso hay que **crear la base `okstationv2`** en el MySQL de XAMPP
e importar/migrar las tablas (antes vivían en el MySQL de Laragon, que es otro
motor distinto). Esto se hace desde **phpMyAdmin** (http://localhost/phpmyadmin)
o corriendo las migraciones del proyecto.

> Si quieres, pídeme que te ayude a dejar la base lista en XAMPP y lo hacemos paso a paso.

---

## 4. Comprobar que todo jala

Con Apache encendido:

- http://localhost:8000 → debe abrir el sitio.
- http://localhost:8000/tienda → la tienda (URL limpia, sin `.html`).
- El astronauta **OKi** aparece abajo a la derecha y responde.

Ya se probó end-to-end el 13-jul-2026: home, URLs limpias del `.htaccess`,
la tienda y el cerebro de OKi (`/backend/api/oki/chat.php`) responden bien.

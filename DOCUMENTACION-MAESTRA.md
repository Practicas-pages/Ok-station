# Ok.station — Documentación maestra

> **Qué es este archivo.** La descripción completa del proyecto: qué es, con qué está hecho,
> cómo está armado por dentro, qué algoritmos usa, cómo se trabaja en él y cómo se publica.
> Es el documento de entrada: si algo de aquí contradice a otro `.md` del repo, **manda éste**
> (y avísalo, para corregir el otro).
>
> **Verificado contra el código el 2026-07-31**, sobre la rama **`desarrollo`** (commit `39e47dd`).
> Las cifras (40 migraciones, 123 endpoints, 27 librerías) son de esa fecha: si no cuadran, el
> código avanzó — no confíes en el número, confía en el criterio que lo acompaña.

> ⚠️ **Este documento describe `desarrollo`, y `main` NO es igual.**
> Al 31-jul-2026, `origin/main` va **9 commits por delante** de `desarrollo` (y `desarrollo` cero
> por delante de `main`). Es al revés de lo normal: alguien trabajó directo sobre `main` sin
> regresarlo a la rama de trabajo. Lo que difiere no es cosmético — **IVA por código postal**,
> **tarifa de envío de respaldo**, y un **checkout en página propia** (`carrito.html` +
> `checkout.html`) que en `desarrollo` todavía vive dentro de `tienda.html`.
> Las secciones afectadas (§9.3, §9.12, §6.6c) marcan explícitamente qué rama describen.
> **Antes de tocar envíos, IVA o checkout: comprueba en qué rama estás.** Ver §20.

---

## Índice

1. [Qué es Ok.station](#1-qué-es-okstation)
2. [Equipo, repositorio y ramas](#2-equipo-repositorio-y-ramas)
3. [Stack y versiones](#3-stack-y-versiones)
4. [Arquitectura general](#4-arquitectura-general)
5. [Estructura de carpetas](#5-estructura-de-carpetas)
6. [El frontend](#6-el-frontend)
7. [El backend](#7-el-backend)
8. [La base de datos](#8-la-base-de-datos)
9. [Los algoritmos](#9-los-algoritmos)
10. [Integraciones externas](#10-integraciones-externas)
11. [OKi, el chatbot](#11-oki-el-chatbot)
12. [Seguridad](#12-seguridad)
13. [Despliegue e infraestructura](#13-despliegue-e-infraestructura)
14. [Entorno local](#14-entorno-local)
15. [Flujo de trabajo con Git](#15-flujo-de-trabajo-con-git)
16. [Operación diaria](#16-operación-diaria)
17. [Estado del proyecto y deuda técnica](#17-estado-del-proyecto-y-deuda-técnica)
18. [Mapa de los demás documentos](#18-mapa-de-los-demás-documentos)
19. [Glosario](#19-glosario)
20. [Divergencia entre `main` y `desarrollo`](#20-divergencia-entre-main-y-desarrollo)

---

## 1. Qué es Ok.station

**Ok.station** (`okstation.mx`) es la plataforma web de una papelería y centro de servicios
en **Tijuana, Baja California**. No es un solo producto: son **cuatro negocios** viviendo en
el mismo sitio, y esa es la razón de casi toda la complejidad del código.

| Línea de negocio | Qué hace el cliente | Dónde vive |
|---|---|---|
| **Citas para trámites** | Agenda una cita para pasaporte, visa, SENTRI, INE, CURP, acta, licencia, I-94, apostilla o médica. Sube sus documentos por adelantado. Paga anticipo si el trámite lo exige. | `index.html#citas` → `appointments/*` |
| **Pedidos de impresión** | Sube archivos, elige tamaño/color/acabado, ve el precio al instante, paga y recoge. | `index.html#fotos` → `orders/*` |
| **Tienda en línea (e-commerce)** | Compra papelería del catálogo real del distribuidor, con carrito, direcciones, IVA por zona y envío o recolección. | `tienda.html`, `producto.php` → `shop/*` |
| **Servicios de mostrador** | Pago de luz, agua, telecom, casetas, tesorerías. Solo informativo, se cierra por WhatsApp. | `assets/pagos-servicios.js` |

Alrededor de eso hay: **panel de administración** para el personal, **OKi** (un chatbot
astronauta), **13 landings de SEO local** apuntando a búsquedas de Tijuana, páginas legales,
y un conjunto de **runners** que sincronizan el catálogo del proveedor cada noche.

**Datos del negocio que están cableados en el código:**

- WhatsApp: `664 719 4117` (`https://wa.me/526647194117`) — es el *escape hatch* universal:
  cuando algo falla o el sistema no sabe, deriva ahí.
- Correo del negocio: `station@okdock.mx` (variable `BUSINESS_EMAIL`).
- IVA: **8 % en la franja fronteriza (Baja California), 16 % en el resto del país.**
- No se abre los **sábados** para citas (regla fija en `Availability::hoursFor`).

---

## 2. Equipo, repositorio y ramas

**Repositorio:** `https://github.com/Practicas-pages/Ok-station` (privado).
**Copia local de trabajo:** `C:\Users\USUARIO\quincejunio\Ok-station`.
**Primer commit:** 2026-06-10. **799 commits** al 2026-07-23.

### Quién ha escrito qué

| Autor | Commits | Territorio |
|---|---|---|
| Oscar Madrazo | 298 | `tienda.html`, checkout, `oki.js`/`oki.css`, catálogo |
| Prácticas Académicas (`practicas@okdock.mx`) | 284 | transversal |
| ZequiDev (Ezequiel) | 212 | backend, citas, pedidos, deploy, seguridad |
| Marely, Valeria | 5 | puntual |

> **Regla de convivencia establecida:** `tienda.html` y el checkout son de Oscar; `oki.js` y
> `oki.css` también. Antes de tocarlos, coordinar. El contrato entre ambos territorios es el
> objeto global `window.OKtienda` y los eventos `oktienda:carrito` / `oktienda:deseados`
> (documentado en `OKi-tienda-integracion.md`). Ese contrato existe justamente para no tener
> que editar el archivo del otro.

### Ramas

```
main                       ← producción. Solo entra por Pull Request.
desarrollo                 ← rama de trabajo compartida. Es donde se está hoy.
feat/navbar-boton-tienda   ← ramas de característica
feat/tienda-barras-empujan
oki-astronauta
preview-oki-tienda
rediseno-idea
```

**No hay entorno de staging.** `desarrollo` → PR → `main` → el servidor hace `git pull` de `main`.
Eso significa que **lo que se fusiona a `main` es lo que verá el cliente en la siguiente publicación**.

---

## 3. Stack y versiones

La decisión de fondo, y hay que entenderla antes de tocar nada:

> **Este proyecto no tiene dependencias.** No hay Composer. No hay npm. No hay framework.
> No hay bundler. No hay autoloader. No hay build step.
> HTML, CSS y JavaScript a mano; PHP puro con PDO; SQL a mano.

Eso tiene un costo (todo se escribe desde cero, incluido el JWT y el cliente SMTP) y una
ventaja enorme para este contexto: **se despliega con un `git pull` y no se rompe nunca por
una actualización de dependencia**. No lo cambies sin una razón muy fuerte.

| Componente | Versión / valor | Nota |
|---|---|---|
| **Servidor** | Linux VPS con **CloudPanel** | systemd, cron, nftables |
| **Servidor web** | **nginx** (CloudPanel) | **No hay Apache en producción** |
| **Caché HTTP** | **Varnish**, heredado del vhost | `/backend/` lo esquiva a propósito |
| **PHP** | **8.1+** (local: 8.3.30 con Laragon) | `declare(strict_types=1)` en todo el backend |
| **Extensiones PHP** | `pdo_mysql`, `fileinfo`, `openssl`, `json`, `mbstring`, `curl`, `gd` (con WebP) | verificadas por `backend/api/health.php` |
| **Base de datos** | **MySQL 8 / MariaDB 10.4+** | InnoDB, `utf8mb4_unicode_ci`, columnas `JSON` |
| **Composer** | **no existe** | ni en la raíz ni en `backend/` |
| **Node / npm** | **no existe** | no hay `package.json` en ningún nivel |
| **CDN / WAF** | **Cloudflare** | parcialmente aplicado — ver §13.4 |
| **Front vendorizado** | solo **Leaflet** (`assets/vendor/leaflet/`) | autohospedado a propósito, por el CSP |
| **Fuente** | **Poppins** 400–800, Google Fonts | única dependencia externa de estilo |
| **PDF en el navegador** | **jsPDF 2.5.1** + **qrcodejs 1.0.0** (cdnjs) | solo en `admin.html` y `perfil.html` |

### Servicios externos que consume

| Servicio | Para qué | Variable de entorno |
|---|---|---|
| **Exel del Norte** | Catálogo, precios y stock de la tienda | `EXEL_API_KEY`, `EXEL_API_BASE`, `EXEL_WAREHOUSE` |
| **Icecat** | Ficha técnica e imágenes de producto | `ICECAT_USERNAME`, `ICECAT_API_TOKEN`, `ICECAT_LANG` |
| **NEXTEP** | Fotos directas del fabricante | (sin llave, API pública) |
| **Google Custom Search** | Fotos candidatas (las elige una persona) | `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID` |
| **Mercado Pago** | Cobro con tarjeta | `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` |
| **Stripe** | Cobro alternativo (implementado, no activo) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Brevo** | Correo transaccional **con adjuntos** | `BREVO_API_KEY`, `MAIL_FROM` |
| **SMTP genérico** | Correo de respaldo, **sin adjuntos** | `SMTP_HOST`, `SMTP_USER`, … |
| **Google Gemini** | Cerebro de IA de OKi (respaldo) | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| ~~Anthropic Claude~~ | **Configuración muerta**: las variables existen, ningún PHP las lee. Ver §11.6 | ~~`ANTHROPIC_API_KEY`~~ |
| **Google Places / Featurable** | Reseñas de Google | `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` |
| **ip-api.com** | Geolocalización por IP → IVA | (sin llave, tier gratis) |
| **Nominatim (OSM)** | Geocodificación inversa del mapa | (sin llave, vía `shop/geo-reverse.php`) |

---

## 4. Arquitectura general

### El camino de una petición en producción

```
Visitante
   │
   ▼
Cloudflare  ─────────────────── CDN + WAF + IP real (CF-Connecting-IP)
   │
   ▼
nginx :443  ─────────────────── TLS, headers de seguridad, CSP
   │
   ├── /backend/…  ──────────►  PHP-FPM        (DIRECTO, sin Varnish: nunca se
   │                                            cachea un estado de pago)
   │
   └── todo lo demás  ───────►  Varnish  ───►  nginx :8080  ───►  PHP-FPM
                                                    │
                                                    └── HTML/CSS/JS estáticos
```

### Las capas del código

```
┌─────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                   │
│  HTML estático + JS vanilla (IIFE, sin módulos)              │
│  Estado en localStorage: okstation.token, okstation.user,    │
│                          okstation_cart, okstation_wishlist  │
└──────────────────────────┬──────────────────────────────────┘
                           │  fetch() + Authorization: Bearer <JWT>
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  backend/api/**.php   — 123 endpoints, un archivo por acción │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ _bootstrap.php  → CORS, JSON, $CONFIG, db(), helpers,  │ │
│  │                   JWT, respond()/fail()                │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ lib/authz.php   → current_user, require_role,          │ │
│  │                   require_permission                   │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ lib/*.php       → 27 librerías de dominio              │ │
│  │                   (Pricing, Payments, Availability…)   │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ lib/Model.php   → mini Active-Record sobre PDO         │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
                     MySQL / MariaDB
                     27 tablas, 40 migraciones

           ┌───────────────────────────────────────┐
           │  backend/tools/*.php  — runners CLI    │
           │  cron los ejecuta; nunca por web       │
           │  (guarda: PHP_SAPI !== 'cli' → 403)    │
           └───────────────────────────────────────┘
```

### Principios que sostienen el diseño

Estos se repiten en el código y **no son negociables**:

1. **El servidor manda en el precio.** Cualquier monto que envíe el cliente se ignora y se
   recalcula. Está escrito literalmente en `orders/create.php`, `shop/create.php`,
   `Pricing.php` y `Payments.php`.
2. **Toda integración externa degrada a `null`.** Si Icecat, Gemini, ip-api o el sitio de una
   marca no responden, el flujo sigue. Solo dos cosas abortan: **los pagos** (es dinero) y el
   **sync de Exel con feed incompleto** (borraría el catálogo).
3. **Los correos y las notificaciones son best-effort.** Van en `try/catch` con `error_log`.
   Un fallo de correo nunca tumba un pedido.
4. **Resiliencia a migraciones no aplicadas.** El helper `table_has_column()` deja que un
   endpoint funcione aunque falte una columna opcional. Por eso el sitio no se cae si alguien
   publica código antes de migrar.
5. **La docblock de cabecera de cada endpoint ES su documentación.** Método, ruta, body,
   permiso y efectos. Si escribes un endpoint nuevo, escribe la suya.

---

## 5. Estructura de carpetas

```
Ok-station/
├── DOCUMENTACION-MAESTRA.md   ← este archivo
│
├── index.html                 ← la portada: hero + wizard de citas + pedido de impresión
├── tienda.html                ← la tienda completa (263 KB, monolito con CSS/JS inline)
├── tienda-dinamica.html       ← "compra rápida", vista de tabla para pedidos grandes
├── producto.php               ← ficha de producto renderizada en servidor (SEO)
├── categoria.php              ← página de categoría en servidor (SEO)
├── pago.html                  ← página de cobro unificada (pedido | cita | compra)
├── perfil.html                ← mi cuenta: pedidos, compras, citas, direcciones
├── cuenta.html                ← login + registro
├── recuperar.html             ← solicitar enlace de recuperación
├── restablecer.html           ← fijar contraseña nueva
├── admin.html                 ← panel de administración (SPA de vistas)
├── maintenance.html           ← pantalla de mantenimiento con login de staff
├── *-tijuana.html             ← 13 landings de SEO local
├── quienes-somos.html, contactanos.html
├── aviso-privacidad.html, terminos.html
├── 403.html, 404.html, 500.html
│
├── app.js                     ← 131 KB: wizard de citas (62 % del archivo) + subida de fotos
├── styles.css                 ← 235 KB: tokens de diseño + 52 secciones acumuladas
│
├── assets/
│   ├── oknav.{html,css,js}    ← navbar unificado (el .html es plantilla, NO se inyecta)
│   ├── oki.{css,js}           ← el chatbot astronauta
│   ├── admin.js, admin-fotos.js, admin.css
│   ├── order.js, shop-cart.js, producto.js, catalogo.js …
│   ├── theme.js               ← modo claro/oscuro
│   ├── site-guard.js          ← modo mantenimiento (guard de cliente)
│   ├── img/                   ← logos, íconos de pago, placeholder
│   │   └── products/          ← fotos descargadas por el runner (IGNORADO por git)
│   └── vendor/leaflet/        ← mapa autohospedado
│
├── backend/
│   ├── .env                   ← SECRETOS (ignorado por git)
│   ├── .env.example           ← catálogo de variables, sí versionado
│   ├── api/
│   │   ├── _bootstrap.php     ← lo incluyen TODOS los endpoints
│   │   ├── config.php         ← lee el .env y devuelve $CONFIG (ignorado por git)
│   │   ├── login.php, register.php, me.php, …
│   │   ├── admin/             ← 27 endpoints del panel
│   │   ├── appointments/      ← citas
│   │   ├── orders/            ← pedidos de impresión
│   │   ├── shop/              ← tienda
│   │   ├── payments/          ← pagos
│   │   ├── reviews/, services/
│   │   ├── oki/               ← chatbot: chat.php, brain.php, prompt.php
│   │   └── lib/               ← 27 librerías de dominio
│   ├── database/
│   │   ├── migrate.php        ← runner de migraciones (idempotente)
│   │   ├── migrations/        ← 39 archivos .sql, la fuente de verdad del esquema
│   │   ├── seed.sql, schema.sql
│   │   └── make-admin.php     ← da rol de administrador (solo CLI)
│   ├── tools/                 ← 15 runners CLI (sync, enriquecimiento, auditoría)
│   └── storage/               ← subidas, tickets, cachés (IGNORADO por git)
│
└── deploy/
    ├── PRODUCCION.md          ← procedimiento de instalación
    ├── CLOUDFLARE.md          ← el documento más importante de infraestructura
    ├── deploy.sh              ← primera instalación
    ├── publicar.sh            ← publicación del día a día
    ├── actualizar-catalogo.sh ← cron nocturno
    ├── actualizar-precios.sh  ← cron cada 2 h
    ├── update-cf-ips.sh       ← cron semanal
    └── nginx-*.conf           ← plantillas y parches del vhost
```

---

## 6. El frontend

### 6.1 Cómo está hecho

**Multipágina estática + PHP puntual.** Cada página es un `.html` completo servido por nginx.
El JavaScript es vanilla, en IIFE (`(function(){ "use strict"; … })()`), mayormente ES5
(`var`, `function`, sin módulos ES). No hay compilación de ningún tipo.

Solo **cuatro archivos** se renderizan en el servidor: `producto.php`, `categoria.php`,
`sitemap-productos.php` y `sitemap-categorias.php`. No usan el bootstrap del backend (ese manda
cabeceras JSON): abren su propio PDO desde `backend/api/config.php` y hacen `require` manual de
`lib/ShopProduct.php`, porque **no hay autoloader**. El puente al navegador es `window.OK_PDP` y
`window.OK_PDP_RELATED`, inyectados con `json_encode` inline.

`categoria.php` **sirve dos cosas con el mismo archivo**: las categorías y las **familias**
(`subcategory`). Con categorías puras esa página existía una sola vez —una URL indexable para
miles de productos, y nadie busca "oficina y escolar"—; sirviendo también las familias pasa de
una página a decenas (`/categoria/marcadores`, `/categoria/cuadernos-profesionales`…), cada una
peleando por una búsqueda de compra concreta. Resuelve **primero categoría, luego familia**: si
algún día un nombre se repitiera, gana la categoría y la URL sigue significando lo que
significaba ayer. La columna del `WHERE` se interpola por **nombre de columna**, decidido en ese
`if` — nunca sale de la URL. *(El listado sigue con `LIMIT 200`, así que en una familia de más
de 200 productos no todas las fichas quedan enlazadas.)*

### 6.2 El navbar unificado (`oknav`)

`assets/oknav.html` es la **copia maestra del marcado**, y **NO se inyecta por JavaScript**.
El comentario de cabecera explica por qué: *los enlaces de navegación deben venir en el HTML
para que Google los siga*. Consecuencia: **el HTML del header está duplicado literalmente en
28 páginas** (más el fragmento maestro), y cualquier cambio hay que replicarlo a mano en cada una.
Quedan fuera las páginas de error, `maintenance.html`, `admin.html` y los stubs.

`oknav.js` funciona en dos modos:
- **MODO TIENDA** — si existe `window.OKtienda`, los botones actúan sobre la página actual.
- **MODO ENLACE** — navega a `/tienda.html` dejando el recado en `sessionStorage`
  (`okstation_q`, `okstation_ir_cat`, `okstation_ir_brand`).

Conviven cuatro encabezados distintos por razones históricas: `.oknav` (el nuevo),
`.site-header`/`.header-bar` (portada y landings), `.shopbar` (ficha de producto) y
`.topbar`/`.td-top` (tienda). `theme.js` maneja eso con una tabla de SLOTS agrupados para no
inyectar dos botones de tema en la misma barra.

### 6.3 Cache-busting

Manual, por query string: `?v=20260721a`. **En producción `publicar.sh` lo reescribe
automáticamente** con el hash corto del commit. Por eso los `.html` del servidor siempre salen
modificados en `git status`, y por eso hay que correr `git checkout -- '*.html'` antes de
cualquier `git pull` manual ahí.

### 6.4 Los scripts de `assets/`

| Archivo | Qué hace | Endpoints que llama |
|---|---|---|
| `oknav.js` | Navbar: buscador con sugerencias (debounce 220 ms), contadores de carrito, menú de categorías, ubicación de entrega | `shop/products`, `shop/categories`, `shop/addresses` |
| `theme.js` | Modo claro/oscuro. Va en `<head>` **sin defer a propósito** (evita el parpadeo). Inyecta el botón sol/luna en el primer slot disponible | — |
| `site-guard.js` | Modo mantenimiento del lado cliente. Ver §12.5 | — |
| `auth.js` | Login, registro, perfil, cambio y restablecimiento de contraseña. **Escribe `okstation.token` y `okstation.user`** | `login`, `register`, `logout`, `me`, `change-password`, `forgot-password`, `reset-password` |
| `session-nav.js` | Sustituye "Cuenta" por avatar + menú cuando hay sesión. Muestra "Panel" solo a staff | — |
| `order.js` | Configurador de pedidos de impresión. Trae la tabla de precios en cliente para mostrar el costo en vivo; **el servidor recalcula** | `orders/upload`, `orders/create`, `orders/ticket-store`, `print-prices` |
| `orders-history.js` | "Mis pedidos". Maneja `needs_quote`/`quoted_at` y hace polling del estado de pago | `orders/list`, `orders/get`, `orders/ticket` |
| `cita-expediente.js` | Se engancha al wizard de citas **sin tocar su lógica**: requisitos por trámite, subida de documentos por persona, venta cruzada | — (los sube `app.js`) |
| `cita-ticket.js` | Genera el comprobante PDF de cita (jsPDF + QR). Reutilizado por el wizard, el perfil y el panel | `appointments/prices` |
| `appointments-history.js` | "Mis citas". **Polling cada 4 s, máx. 6 intentos** mientras el pago esté en `procesando` (el webhook tarda) | `appointments/mine` |
| `shop-cart.js` | Publica `window.OKtienda` **fuera** de la tienda, para que el carrito sea el mismo en toda la web | `shop/products` |
| `shop-header.js` | Barra de e-commerce fuera de la tienda (hoy, la ficha) | `shop/products`, `shop/categories` |
| `shop-history.js` | "Mis compras". Cuando una compra está pagada y sin recibo: **genera el PDF, lo sube al servidor y el servidor se lo manda por correo al cliente** | `shop/list`, `shop/get`, `shop/ticket`, `shop/ticket-store` |
| `shop-ticket.js` | Recibo PDF de compra. Reduce el logo a 640 px para que el PDF pese ~200 KB | — |
| `producto.js` | Galería con zoom, cantidad, agregar al carrito, favoritos, puente con OKi | `shop/stock-alert` |
| `catalogo.js` | Llena `window.OK_PRODUCTS` con el catálogo real. **Si el API falla deja el array vacío a propósito**, para que OKi no invente precios | `shop/products` |
| `address-book.js` | Libreta de direcciones para páginas que no son la tienda. Autocontenido (inyecta su CSS) | `shop/addresses`, `shop/address-save`, `shop/address-default` |
| `oki.js` | El chatbot. 61 KB. Ver §11 | `oki/chat`, `shop/products` |
| `admin.js` | Todo el panel: 2 388 líneas | `admin/*` |
| `admin-fotos.js` | Asignar fotos a un producto: **selección múltiple** con portada, cola de trabajo para procesar cientos seguidos, y pegado/arrastre como vía que nunca falla | `admin/image-candidates`, `admin/image-set`, `admin/image-set-batch` |
| `reviews.js` | CRUD de reseñas ligado al login | `reviews/*` |
| `pago-return.js` | Aviso al volver del checkout. **Deliberadamente no afirma que el cobro fue exitoso** (los parámetros de URL son manipulables); la verdad es el webhook | — |
| `pagos-servicios.js` | Modal de servicios de mostrador. **Catálogo hardcodeado, sin backend**; cierra por WhatsApp | — |
| `phone-cc.js` | Selector 🇲🇽 +52 / 🇺🇸 +1 sobre todo `input type=tel` | — |
| `ok-anim.js` | Animaciones compartidas (`fly`, `pulse`, `toast`, `skeleton`). Respeta `prefers-reduced-motion` | — |

**Código muerto identificado** (no lo carga nadie): `critical.css`, `assets/maintenance.js`,
`image-slot.js` (32 KB, duplicado en la raíz y en `uploads/`, es un artefacto de otro proyecto),
y `estructura.txt`.

### 6.5 Sistema de diseño

Los tokens viven en `:root` al inicio de `styles.css`, tomados del brand book de OK Dock con
referencias Pantone:

```css
--brand-blue    #066CFF   (PANTONE 285 C)      --brand-purple  #9C1DFF  (2582 C)
--brand-cyan    #00C6FF   (2985 C, secundario) --brand-orange  #FF7C19  (1495 C, secundario)
--brand-gray    #DBDBDB   (Cool Gray 1 C)      --brand-black   #000000
```

Más gradientes oficiales (`--grad-oficial` es de 4 paradas: cyan → azul → púrpura → naranja),
superficies (`--surface-page #F2F4F8`, `--surface-card #FFF`), escala de texto
(`--text-primary #12141C` → `--text-faint #9BA3BA`), semánticos (success/warning/error/info +
WhatsApp `#25D366`), espaciado `--space-1..24` (4→96 px), radios y sombras.

**Tipografía:** Poppins 400/500/600/700/800.
**Breakpoints:** predominantemente *desktop-first* (`max-width`); el dominante es **768 px**.
Hay `min-width` hasta 2560 para ultrawide/4K, y 8 bloques de `prefers-reduced-motion`.
**Tema oscuro:** al final de `styles.css`, 53 bloques `html[data-theme="dark"]` que redefinen
los tokens. Detalle bien pensado: en oscuro el hover **aclara** en vez de oscurecer.

**El amarillo de compras.** El rediseño de la tienda introdujo `#FFE200` como color de acción de
compra (hover de tarjetas, botones de agregar, carrito). No está en el brand book de OK Dock:
convive con la paleta de marca como color funcional del e-commerce, no como color corporativo.

**Los logos de medios de pago son de formato mixto, a propósito.** `assets/img/pay/` alimenta la
sección "Medios de pago" de la ficha. Los dibujos provisionales (`visa.svg`, `amex.svg`) **se
borraron** y se reemplazaron por el **arte oficial** de cada marca, en el formato que publica
cada una: `visa.png` (con transparencia), `amex.jpg` (trae su propio fondo blanco), y
`mastercard.svg` / `mercadopago.svg` (esas dos sí ofrecen vector). No fue una conversión de SVG
a bitmap: fue cambiar arte provisional por arte oficial. En `producto.php` el array `$pagos`
**lleva la extensión completa** y el `<img>` se pinta a `height="32"` sin `width` fijo; si un
archivo falta, un `onerror` lo sustituye por texto de la misma altura para que el bloque no dé
un salto. Para reemplazar un logo basta **sobrescribir el archivo**.

**Hojas por página:** `admin.css` (panel, estética SaaS), `auth.css`, `oki.css` (autocontenido,
puentea las variables), `oknav.css` (**sin ningún degradado, deliberado**), `order.css`,
`producto.css`, `shop-header.css` (define sus propios tokens `--sb-*` para no depender de
`tienda.html`).

> ⚠️ **Deuda técnica de CSS.** `styles.css` declara un índice de 19 secciones pero en la
> práctica tiene ~52, con números repetidos (dos "27", dos "28", tres "35") porque se
> acumularon capas de rediseño superpuestas que se pisan con `!important`. Los propios
> comentarios del archivo lo admiten. Antes de agregar una capa más, considera limpiar.

### 6.6 Los flujos de usuario, paso a paso

#### (a) Agendar una cita

1. `index.html#citas` → **`app.js` módulo 05** monta el wizard de 6 pasos:
   *Servicio → ¿Cuántas personas? → Datos de cada persona → Fecha → Tus datos → Confirmar*.
   (La licencia de conducir omite el paso 1 y muestra "PASO N DE 5".)
2. **`cita-expediente.js`** inyecta en paralelo los requisitos del trámite y el panel de
   subida de documentos por persona (máx. 10 MB, PDF/JPG/PNG). Bloquea "Continuar" hasta que
   todas las personas estén completas.
3. **Disponibilidad:** `GET appointments/availability.php` (sin `?date` → días; con
   `?date=…&party=N` → horarios reales). El calendario pinta puntos verde/naranja/rojo.
4. El borrador se guarda en `sessionStorage["okstation.cita.draft"]` — **no localStorage,
   por privacidad**.
5. Confirmar → `POST appointments/create.php` → documentos por `appointments/upload.php`
   (un `fetch` por archivo, best-effort: si falla, la cita sigue viva).
6. Comprobante PDF con **`cita-ticket.js`** → `appointments/send-receipt.php` lo manda por correo.
7. Anticipo opcional → `pago.html?appt=<id>`.
8. Seguimiento en `perfil.html#citas`.

#### (b) Pedido de impresión

1. `index.html#fotos` → **`order.js`**.
2. Drop de archivos → `POST orders/upload.php`. **Subir y ver precios NO requiere sesión**, por diseño.
3. Configuración **independiente por archivo**: tamaño, color/BN, una o doble cara, acabados.
4. Costo en vivo con la tabla en cliente; los precios oficiales se refrescan de `print-prices.php`.
5. **Enviar sí exige sesión**: guarda `sessionStorage.oks_intended` y manda a `cuenta.html`;
   `auth.js` regresa al volver.
6. `POST orders/create.php` → ticket PDF con QR → `orders/ticket-store.php` → `pago.html?order=<id>`.

#### (c) Compra en la tienda

1. Entrada por `tienda.html`, `tienda-dinamica.html`, `producto.php` o `categoria.php`.
2. Carrito = `localStorage.okstation_cart` = `{ id: cantidad }`. Deseados = `okstation_wishlist` = `[id, …]`.
   **Es el mismo carrito en las cuatro superficies**, gracias al contrato `window.OKtienda`.
3. Dirección de entrega con geolocalización, Leaflet y `shop/geo-reverse.php`.
4. Checkout en 2 pasos dentro de `tienda.html`: calcula IVA (**retiro → 8 % siempre, porque se
   recoge en Tijuana; envío → según el CP de entrega**, ver §9.3) y **cotiza el envío con el
   proveedor** (§9.12). *(En `origin/main` este paso ya no vive en `tienda.html`: son páginas
   propias, `carrito.html` y `checkout.html`. Ver §20.)*
5. `POST shop/create.php` → vacía el carrito → `pago.html?shop=<id>`.
6. `payments/create.php` decide proveedor → brick de Mercado Pago / redirección a Stripe /
   sandbox. Polling a `payments/status.php` (10 intentos × 3 s).
7. Retorno → `perfil.html?pago=ok#tienda`. **`shop-history.js`** genera y sube el recibo.

#### Vista rápida (el ojo de la tarjeta)

Con el rediseño, **la tarjeta entera pasó a ser un enlace real** a la ficha
(`/producto/49-toner-hp-85a`): una capa-enlace invisible (`.pcover`, `inset:0`, `opacity:0`) que
cubre la tarjeta en `z-index:1`, para que funcionen el clic normal y el "abrir en pestaña nueva",
y para que Google siga el enlace. Los botones van por encima y no le roban el clic.

La **vista rápida** quedó en su propio botón —el ojo, `.quick`—: abre imagen, marca, SKU,
familia, precio con el ahorro, existencia, descripción y ficha técnica **sin salir del catálogo**.
Los datos se refrescan contra `shop/product.php` (precio y stock frescos de la base; **no** se
llama a Exel en vivo). Aparece al pasar el mouse y, en pantallas táctiles (`@media (hover:none)`),
se queda siempre visible, porque ahí no hay hover.

Detalle de posicionamiento: el modal no usa `--oknav-h` a secas sino `--pv-top`, que mide **la
parte realmente visible de la navbar en el momento de abrir**. Al final del catálogo la barra
puede haber salido de la ventana, y reservarle sus 158 px empujaba la ficha hacia abajo como si
se hubiera atorado.

> ⚠️ **La "Tienda rápida" (`tienda-dinamica.html`) se quedó atrás y su envío está roto.**
> El carrito sigue siendo el mismo en las cuatro superficies —`window.OKtienda` cumple—, pero el
> **checkout** no. Desde que el envío pasó a cotizarse (28-jul-2026), esa página:
>
> - sigue mostrando **"Envío · $99.00"** desde su propia constante de JavaScript
>   (`var SHIP_COST = 99`), un precio que ya no existe en ninguna parte del servidor, y
> - manda el pedido **sin `address_id` ni `transportista`**.
>
> `shop/create.php` exige `address_id` cuando `ship_mode = 'envio'`, así que la compra muere en
> **422 "Elige una dirección de envío guardada"** justo después de que el cliente pulsó *Pagar $…*
> — y el mensaje aparece pese a haber elegido ya una dirección, así que es un callejón sin salida:
> nada en esa página lo desbloquea salvo cambiar a "recoger". El camino **"recoger en tienda" sí
> funciona**. Está enlazada desde la navbar de toda la web, así que no es una pantalla escondida:
> o se le porta el flujo de cotización, o se le quita la opción de envío.

#### (d) Registro / login / recuperación

- `cuenta.html` + `auth.js`. Tras login guarda token y usuario, y decide destino con
  `afterAuthDest()`: `?next=` → `sessionStorage.oks_intended` → `perfil.html`. Si es staff → `admin.html`.
- `recuperar.html` → `forgot-password.php`. En modo desarrollo el backend devuelve el enlace
  (`dev_reset_link`) en la propia respuesta, porque en local no se manda correo.
- `restablecer.html` → `reset-password.php`. **Ambas están en `BYPASS_PATHS` del guard de
  mantenimiento**, para que un admin que olvidó su contraseña no quede encerrado.

### 6.7 El panel de administración

`admin.html` + `admin.js` + `admin-fotos.js`. Es una SPA de vistas (`showView()` alterna
secciones con render perezoso). Nueve entradas en el sidebar:

| Vista | Qué permite |
|---|---|
| **Dashboard** | KPIs, gráfico de ventas de 7 días, citas próximas y pedidos recientes |
| **Pedidos** | Filtros por estado y por pago. Detalle, descarga de archivos del cliente, cambio de estado, **fijar precio** de pedidos por cotizar, marcar pago manual |
| **Tienda** | Compras del e-commerce con los mismos dos ejes de filtro. Regeneración del recibo PDF |
| **Catálogo** | **Solo lectura** (viene de Exel). Filtro por cobertura fotográfica: *sin fotos / pocas (1-2) / completas (3+)* |
| ↳ *asignar fotos* | `admin-fotos.js`: cuadrícula de candidatas, búsqueda en el sitio de la marca, pegar con Ctrl+V o arrastrar. **Cola de trabajo** para procesar cientos seguidos |
| **Citas** | Filtros por estado, datos por persona, documentos subidos, fijar precio, marcar pago, reimprimir comprobante |
| **Usuarios** | Detalle con historial, asignar rol, activar/desactivar. **Oculto para el empleado puro** |
| **Reseñas** | Moderación con badge de pendientes |
| **Reportes** | Corte por día/semana/mes con descarga en PDF. **Oculto para el empleado puro** |
| **Precios** | **Solo administrador/directivo.** Los 19 precios de impresión + IVA. Guardar exige **confirmación por contraseña** |

**Control de acceso por rol:** al empleado puro se le ocultan Usuarios y Reportes, se le esconde
la tarjeta de ventas, y `showView()` lo devuelve al Dashboard si fuerza la URL. El propio código
lo llama *"defensa en profundidad"* — **el backend también bloquea esos endpoints**, que es lo
que de verdad protege.

*Nota histórica: la vista "Servicios" se retiró en julio 2026 porque la tabla `services` nunca
se llenó; los precios reales viven en la pestaña Precios.*

---

## 7. El backend

### 7.1 El bootstrap — `backend/api/_bootstrap.php`

Lo incluye **todo** endpoint. En orden:

1. Carga `config.php` (500 si falta).
2. **CORS**: `Access-Control-Allow-Origin` con el valor de `CORS_ORIGIN`, `Vary: Origin`,
   `Content-Type: application/json; charset=utf-8`, y **`OPTIONS` → 204 y salir**.
   No hay `Allow-Credentials` porque **no se usan cookies**.
3. **Guard crítico:** si `jwt_secret` está vacío o mide menos de 32 caracteres → **500**.
   Todo el API queda muerto. Es intencional: mejor caído que inseguro.
4. Define los helpers globales.

**Los helpers que verás en todas partes:**

| Helper | Qué hace |
|---|---|
| `respond($data, $code = 200)` | JSON + `exit` |
| `fail($msg, $code = 400, $extra = [])` | Devuelve `ok: false` con el mensaje |
| `body()` | Decodifica el JSON del cuerpo |
| `only_method('POST')` | 405 si no coincide |
| `db()` | **Singleton PDO.** `ERRMODE_EXCEPTION`, `FETCH_ASSOC` y **`EMULATE_PREPARES => false`** (prepared statements reales del servidor) |
| `table_has_column($t, $c)` | Consulta `information_schema` con caché estática. **Patrón central de resiliencia** |
| `jwt_make()` / `jwt_verify()` | JWT HS256 propio |
| `require_auth()` | Lee el header, 401 si falta o es inválido |
| `valid_password()` | Política NIST: 8–64 caracteres, **sin reglas de complejidad**, más lista negra |
| `user_public($id)` | Datos del usuario **sin el hash**, con sus roles |

### 7.2 Autenticación: JWT stateless

**No hay sesiones PHP ni cookies.** Es un **JWT HS256 escrito a mano**, enviado en
`Authorization: Bearer <token>` y guardado por el navegador en `localStorage`.

- Claims: `sub` (id de usuario), `email`, `name`, `iat`, `exp` (= `iat + JWT_TTL`, 7 días).
- Firma: HMAC-SHA256 sobre `header.payload`, base64url sin padding.
- Verificación: **fija `alg=HS256` y `typ=JWT`** — eso bloquea el ataque `alg:none` y la
  confusión de algoritmo. Compara con `hash_equals` (tiempo constante). Valida `exp`.
- **No hay refresh token ni lista de revocación.** `logout.php` es simbólico: con JWT
  stateless, cerrar sesión es borrar el token en el cliente. El endpoint existe "para futuras
  listas de revocación".

> **Nota importante:** el JWT **no lleva el rol**. Quien necesita el rol (como `site-guard.js`)
> lo lee de `localStorage.okstation.user.roles`. Eso está bien porque el rol del lado cliente
> es cosmético: **la autorización real la hace `authz.php` en el servidor, en cada petición**.

### 7.3 Autorización: `lib/authz.php`

| Función | Qué hace |
|---|---|
| `current_user()` | `require_auth()` + busca el usuario. **403 si la cuenta está inactiva** |
| `require_role($roles)` | 403 si el usuario no tiene ninguno |
| `require_permission($perm)` | 403 con el nombre del permiso faltante |
| `ensure_roles_for_new_user()` | Siempre `cliente`; además `administrador` si el correo está en `ADMIN_EMAILS` |
| `log_activity(...)` | Escribe en `activity_logs`. **En try/catch vacío: el logging nunca rompe la petición** |

**Cuatro roles:**

| Rol | Alcance |
|---|---|
| `cliente` | Sin panel |
| `empleado` | Pedidos, citas y reseñas. `users.view` de solo lectura y `settings.manage`. **Sin** `stats.view`, `users.deactivate` ni `employees.manage` |
| `administrador` | Todo |
| `directivo` | Todo |

**Detalle de diseño:** `user_has_permission()` hace short-circuit — `administrador` y `directivo`
tienen **todos** los permisos por definición, sin depender de que la tabla `role_permissions`
esté correctamente sembrada. Eso evita quedarse fuera del propio sistema por un seed incompleto.

**Permisos existentes:** `orders.view|update_status|edit|notes`, `users.view|edit|deactivate`,
`services.manage`, `reviews.moderate`, `settings.manage`, `employees.manage`, `stats.view`,
`appointments.view|update_status|manage|pricing`, `shop.view|update_status`.

### 7.4 Anatomía de un endpoint

Siempre la misma forma:

```php
<?php
/** POST /backend/api/<area>/<accion>.php — qué hace, quién puede, body y efectos. */
require __DIR__ . '/../_bootstrap.php';      // 1. CORS + JSON + $CONFIG + db() + helpers
require __DIR__ . '/../lib/authz.php';       // 2. dependencias EXPLÍCITAS (no hay autoloader)
require __DIR__ . '/../lib/Pricing.php';
only_method('POST');                          // 3. método (405 si no)

$user = require_permission('orders.update_status');   // 4. authn + authz (401/403)
$b    = body();                                       // 5. entrada
$id   = (int) ($b['id'] ?? 0);

if (!in_array($status, $valid, true)) fail('Estado inválido.');   // 6. validación → 400/422
$o = Order::find($id);
if (!$o) fail('Pedido no encontrado.', 404);

// 7. lógica (transacción si toca varias tablas; el precio SIEMPRE lo calcula el servidor)
// 8. efectos best-effort en try/catch (correo, notificación, bitácora)
log_activity((int) $user['id'], 'order.status', 'orders', $id, [...]);
respond(['ok' => true]);                              // 9. salida
```

**Códigos HTTP, con significado fijo en este proyecto:**

| Código | Cuándo |
|---|---|
| **400** | Validación genérica |
| **401** | No autenticado / credenciales malas |
| **403** | Sin permiso, cuenta inactiva, endpoint deshabilitado |
| **404** | Recurso inexistente |
| **405** | Método equivocado |
| **409** | **Conflicto**: correo duplicado, slot de cita ocupado, precio cambió >3 %, pago ya en curso |
| **422** | Entidad no procesable (id faltante, archivo ajeno) |
| **429** | Rate limit |
| **500** | Fallo interno, con mensaje genérico (nunca filtra el error real) |

**Otras convenciones firmes:**

- Toda respuesta es JSON con `ok: true|false`; los errores llevan `error` en español,
  redactado para el usuario final.
- Los endpoints que sirven binarios (`orders/ticket.php`, `orders/file.php`,
  `appointments/file.php`, `shop/ticket.php`) hacen `header_remove('Content-Type')` para pisar
  el JSON del bootstrap.

### 7.5 La capa de datos — `lib/Model.php`

Un **mini Active-Record estático sobre PDO**. No hay ORM ni query builder.
El comentario de cabecera dice: *"Mapea 1:1 a Eloquent (Laravel) si se migra"*.

| Método | SQL |
|---|---|
| `find($id)` | `SELECT * FROM t WHERE pk = ? LIMIT 1` |
| `findBy($col, $val)` | Igual, y **valida `$col` con una expresión regular de identificador** |
| `all($orderBy)`, `where($conds, $orderBy)` | |
| `create($data)` | `INSERT`, devuelve `lastInsertId()` |
| `update($id, $data)`, `count($conds)` | |

**Patrón de seguridad:** los **valores** siempre van por placeholders `?`; los **nombres de
columna** se interpolan. Eso es seguro aquí porque las claves de los arrays son literales
internos del código, nunca entrada del usuario. `findBy()` valida el identificador por si acaso.

**Modelos declarados:** `User` (con `roles()` y `permissions()`), `Role`, `Review`, `Service`,
`Category`, `UploadedFile`, `Notification`, `Order` (con `items()`), `OrderItem`, `Appointment`,
`AppointmentFile`, `ShopOrder` (con `items()`), `ShopOrderItem`.

**Transacciones:** patrón uniforme — abrir, y en el `catch` revertir si sigue abierta.
Las usan `orders/create`, `orders/repeat`, `appointments/create` (con `SELECT … FOR UPDATE`),
`shop/create`, `shop/cancel`, `admin/user-role`, `admin/image-set`, `Addresses`,
`Payments::finalize` y `ProductEnricher`.

### 7.6 Las 27 librerías de `backend/api/lib/`

*(28 en `origin/main`, que añade `EnvioRespaldo.php` — ver §9.12 y §20.)*

| Librería | Qué resuelve |
|---|---|
| **`Pricing.php`** | Autoridad del servidor sobre el precio de impresión y trámites. §9.1 |
| **`Payments.php`** | Motor de pagos: 3 pasarelas, 3 entidades cobrables, máquina de estados. §9.6 |
| **`ExelEnvios.php`** | **Cotizador de envíos** contra la paquetería del proveedor. §9.12 |
| **`RescateImagenes.php`** | Tercera pasada automática de fotos, por coincidencia exacta. §9.5 |
| **`Availability.php`** | Disponibilidad de citas. §9.4 |
| **`Geo.php`** | Estado o CP del cliente → tasa de IVA. §9.3 |
| **`ShopCatalog.php`** | El margen del catálogo (30 %). §9.2 |
| **`ShopProduct.php`** | Definición compartida de "producto público" entre el API y `producto.php`. Genera el slug de la URL |
| **`Addresses.php`** | Libreta de direcciones. Máx. 10 por usuario. La regla "una sola predeterminada" se impone **en una transacción**, porque MySQL no admite índice único parcial |
| **`Model.php`** | §7.5 |
| **`authz.php`** | §7.3 |
| **`RateLimit.php`** | Ventana deslizante calculada en MySQL. §9.7 |
| **`Storage.php`** | Escritura bajo `STORAGE_PATH`. **Detecta el MIME por contenido (`finfo`), nunca por lo que declare el cliente** |
| **`ImagenSegura.php`** | Validación anti-SSRF de imágenes. §12.4 |
| **`ProductEnricher.php`** | Orquesta el enriquecimiento con Icecat. §9.5 |
| **`EnrichLog.php`** | Bitácora y cola de trabajo del enriquecimiento, con política de reintento |
| **`Icecat.php`** | Cliente de Icecat Live. Caché 30 días. Máx. 5 imágenes |
| **`Nextep.php`** | Fotos del fabricante NEXTEP por número de parte |
| **`BuscadorMarca.php`** | Busca en el sitio oficial de la marca. **Lee y obedece `robots.txt`** |
| **`BuscadorImagenes.php`** | Google Custom Search. **Nunca publica solo**: propone, elige una persona |
| **`CatalogoAlcance.php`** | Única fuente de verdad de qué categorías de Exel entran a la tienda |
| **`Mail.php`** | Fachada: Brevo si hay API key, si no SMTP. Nunca lanza excepción |
| **`Brevo.php`** | API HTTP de Brevo. **El único transporte que adjunta archivos** (el PDF) |
| **`Mailer.php`** | Cliente SMTP escrito a mano (`fsockopen` + STARTTLS + AUTH LOGIN). Sin adjuntos |
| **`Emails.php`** | 16 plantillas HTML compatibles con Gmail/Outlook (tablas + estilos en línea) |
| **`Gemini.php`** | Cerebro de IA de respaldo de OKi, con presupuesto en disco |

### 7.7 Mapa de endpoints

**Raíz** — `register`, `login`, `me` (GET/PUT), `logout`, `change-password`,
`forgot-password`, `reset-password`, `print-prices`, `health`.

**`admin/`** (31) — `dashboard`, `orders`, `order-status`, `order-price`, `order-payment`,
`appointments`, `appointment-status`, `appointment-price`, `appointment-payment`,
`appointment-settings`, `print-prices`, `users`, `user-detail`, `user-toggle`, `user-role`,
`reviews`, `review-moderate`, `services`, `reports`, `shop-orders`, `shop-order-status`,
`shop-order-payment`, `shop-pricing`, `catalog`, `product-detail`, `product-image`,
`image-candidates`, `image-set`, **`image-set-batch`**, **`image-rescue`**,
**`image-rescue-report`**.

| Endpoint nuevo | Método | Permiso | Qué hace |
|---|---|---|---|
| `image-set-batch` | POST | `shop.update_status` | Guarda hasta 5 fotos elegidas de una vez, con portada, en una transacción |
| `image-rescue` | POST | `shop.update_status` | Corre un lote (1..25; el panel manda 10) del rescate automático |
| `image-rescue-report` | GET | `shop.view` | Cola e historial: hasta 500 productos con estado, miniatura y % de certeza |

**`appointments/`** — `availability` (público), `month` (público), `prices` (público),
`create` (público, acepta invitados), `mine`, `upload` (público, con candados), `file`,
`confirm` (responde **HTML**, no JSON), `send-receipt`.

**`orders/`** — `create`, `list`, `get`, `cancel`, `repeat`, `upload` (sesión **opcional**),
`file`, `ticket-store`, `ticket`, `confirm`.

**`shop/`** (20) — `products`, `product`, `categories`, `brands`, `subcategories` (todos
públicos), `create`, `list`, `get`, `cancel`, `ticket-store`, `ticket`, `addresses`,
`address-save`, `address-default`, **`envio-opciones`** (POST, con sesión), `geo`, `geo-reverse`,
**`geo-state`** (GET, **público**), `stock-alert`. Más `_synonyms.php`, que **no es un
endpoint**: es el motor de búsqueda con sinónimos (tinta↔cartucho, pluma↔bolígrafo).

**`GET shop/products.php` — el contrato no cambió; el orden sí.** Parámetros, envoltura y campos
por ítem son los mismos. Lo nuevo: **en una búsqueda los productos con foto van primero** —una
lista encabezada por recuadros vacíos se lee como catálogo incompleto—. Los que no tienen foto
**no se ocultan, solo bajan**. Se aplica bajo dos condiciones, y las dos importan: solo cuando
hay `q` (en el catálogo normal manda el orden del catálogo), y solo con el `sort` por omisión
(si el cliente pidió "precio: menor a mayor", el más barato sale primero **aunque no tenga
foto**: para eso lo eligió). Ese `ORDER BY … EXISTS(…) DESC` es lo que motiva la migración 0038.

**`payments/`** — `create`, `process`, `webhook`, `sandbox-confirm`, `status`.

**`reviews/`** — `list` (público), `create`, `update`, `delete`, `google` (proxy server-side
para evitar CORS, cacheado ~24 h).

**`oki/`** — `chat`, más `brain.php` y `prompt.php`, que son librerías, no endpoints.

**Detalles de endpoints que vale la pena conocer:**

- `orders/upload.php` acepta **sesión opcional**: sin token el archivo queda con `user_id` nulo.
  `create.php` valida la propiedad, así que un archivo anónimo no puede colarse en un pedido ajeno.
- `appointments/send-receipt.php` manda el comprobante **solo al correo guardado en la cita**,
  nunca a uno que llegue en la petición. Es una medida anti-spam.
- `admin/user-role.php` **no permite cambiar el rol propio ni dejar el sistema sin último admin**.
- `admin/appointment-status.php` **bloquea pasar a `confirmada`/`completada` si el trámite exige
  anticipo y no está pagado**.

---

## 8. La base de datos

### 8.1 Cómo se construye el esquema

**La fuente de verdad son las migraciones**, no ningún `schema.sql`.

```bash
php backend/database/migrate.php
```

El runner:
1. Crea `schema_migrations (filename PK, applied_at)` si no existe.
2. Lee las ya aplicadas.
3. `glob(migrations/*.sql)` + **orden alfabético**.
4. Por cada archivo no aplicado: lo ejecuta y lo registra.
5. Ante cualquier error: escribe a STDERR y **se detiene** (`exit 1`). No sigue con las siguientes.

**Es idempotente** a nivel de runner (registro por nombre de archivo). **No hay `down` ni
rollback.** Los `.sql` están escritos para tolerar reejecución (`CREATE TABLE IF NOT EXISTS`,
`INSERT … ON DUPLICATE KEY UPDATE`, `INSERT IGNORE`), salvo los `ALTER TABLE ADD COLUMN`, que
fallarían si se reaplicaran a mano.

> ⚠️ **Dos archivos `schema.sql` que NO debes usar:**
> - `backend/database/schema.sql` — está desfasado; le faltan 9 tablas.
> - `backend/schema.sql` (raíz) — es un esquema **legacy** de otra época (tiene `order_files`).
>   `health.php` lo detecta explícitamente como error de instalación (`old_schema_detected`).
>
> Instala siempre por `migrate.php`.

### 8.2 Las 40 migraciones

| # | Archivo | Qué hace |
|---|---|---|
| 0001 | `core_auth` | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `password_resets` |
| 0002 | `catalog_orders` | `categories`, `services`, `orders`, `uploaded_files`, `order_items` |
| 0003 | `reviews_ops` | `reviews`, `review_replies`, `notifications`, `settings`, `activity_logs` |
| 0004 | `seed` | Roles, 12 permisos, grants, settings base, 4 categorías |
| 0005 | `security` | `login_attempts` (anti fuerza bruta) |
| 0006 | `appointments` | `appointments` + permisos + settings del calendario |
| 0007 | `appointment_services` | Amplía `tramite` a 9 valores; `passport_subtype`, `party_size` |
| 0008 | `payments` | Campos `payment_*` en `orders`; crea `payment_logs` |
| 0009 | `order_delivered_at` | `orders.entregado_at` (corte de caja por fecha de entrega) |
| 0010 | `tax_rate_8` | Fuerza `settings.tax_rate = 0.08` |
| 0011 | `appointment_guests` | `appointments.guests_json` |
| 0012 | `order_contact_phone` | `orders.contact_phone` |
| 0013 | `appointment_services_files` | `services_json`; crea `appointment_files` |
| 0014 | `appointment_file_guest` | `guest_index`/`guest_name`; `uploaded_files.user_id` pasa a NULL (invitados) |
| 0015 | `seed_directivo` | Rol `directivo` + permisos (faltaba en el seed) |
| 0016 | `appointment_payments` | Pago de citas; `payment_logs` gana FK a `appointment_id` |
| 0017a | `email_confirmation` | `confirm_token` + `client_confirmed_at` en citas y pedidos |
| 0017b | `empleado_no_stats` | Quita `stats.view` al empleado |
| 0018a | `appt_require_payment` | Siembra `appt.require_payment = ["visa","pasaporte"]` |
| 0018b | `empleado_ops_perms` | Refuerza grants del empleado |
| 0019 | `appt_price_pasaporte_americano` | Añade `pasaporte_americano: 400` |
| 0020 | `print_prices` | Siembra las 19 claves de `print.prices` (INSERT IGNORE: no pisa ediciones) |
| 0021 | `appt_price_i94_licencia` | Añade `i94: 200` y `licencia: 40` |
| 0022 | `order_quote` | `orders.needs_quote`, `quoted_at` |
| 0023 | `appointment_quote` | Espejo de 0022 en citas |
| 0024 | `roles_empleado_usuarios` | Empleado gana `users.view` y `settings.manage`; pierde 3 permisos |
| 0025 | `appt_acta_state` | `acta_state` + precios de acta por los 32 estados |
| 0026 | `appt_tramite_acta` | Añade `'acta'` al ENUM de trámites |
| 0027 | `shop_orders` | `shop_orders`, `shop_order_items`; `payment_logs` gana su 3ª FK |
| 0028 | `shop_orders_iva_geo` | `iva_rate` y `ship_state` |
| 0029 | `shop_margin` | Siembra `settings.shop_margin = 1.30` |
| 0030 | `shop_products` | Crea `products` (catálogo Exel) y `product_images` |
| 0031 | `shop_old_price` | `products.old_price` (ofertas; el sync no la pisa) |
| 0032 | `user_addresses` | Libreta estructurada de direcciones |
| 0033 | `shop_ticket` | `shop_orders.ticket_path` |
| 0034 | `shop_contact_email` | `shop_orders.contact_email` |
| 0035 | `stock_alerts` | "Avísame cuando llegue" |
| 0036 | `product_enrichment` | Bitácora por producto+fuente, **con backfill** de lo ya enriquecido |
| 0037 | `product_images_source` | `source` pasa de ENUM a VARCHAR (permite `fabricante:3m`, `manual`…) |
| 0038 | `product_images_primary_idx` | Índice para el nuevo orden "con foto primero" de las búsquedas y para la consulta de imagen principal. **Aditiva y reversible**: es una optimización, el `ORDER BY` funciona sin ella, solo más lento |

> ⚠️ Hay **números duplicados** (`0017` y `0018` aparecen dos veces cada uno). Funciona porque
> el orden es alfabético por nombre completo y las parejas son independientes, pero es frágil.
> **Al crear una migración nueva, verifica primero el número más alto.**

### 8.3 Las tablas

**Identidad y autorización**

| Tabla | Contenido clave |
|---|---|
| `users` | `full_name`, `email` UNIQUE, `password_hash`, `phone`, `address`, `is_active`, `last_login_at` |
| `roles` | `slug` UNIQUE: `cliente｜empleado｜administrador｜directivo` |
| `permissions` | `slug` UNIQUE |
| `role_permissions` | PK `(role_id, permission_id)`, CASCADE |
| `user_roles` | PK `(user_id, role_id)`, CASCADE. **Relación M2M** |
| `password_resets` | `token_hash` CHAR(64) — **solo el SHA-256**, nunca el token —, `expires_at`, `used_at` |
| `login_attempts` | `ip`, `email`, `attempts`, `locked_until`, **UNIQUE `(ip, email)`** |

**Pedidos de impresión**

| Tabla | Contenido clave |
|---|---|
| `orders` | `code` UNIQUE (`OKS-2026-000123`), `status` ENUM(recibido, en_revision, en_produccion, listo, entregado, cancelado), `entregado_at`, montos, `needs_quote`/`quoted_at`, bloque `payment_*`, `ticket_path`, `confirm_token` |
| `uploaded_files` | `original_name`, `stored_path`, `mime_type`, `size_bytes`, `pages`. `user_id` **NULLABLE** (invitados) |
| `order_items` | `config_json`, `qty`, `unit_price`, `line_total`. FK a `services` y `uploaded_files` |
| `categories`, `services` | Catálogo de servicios. **`services` nunca se llenó**; los precios viven en `settings` |

**Citas**

| Tabla | Contenido clave |
|---|---|
| `appointments` | `code` UNIQUE (`CITA-2026-000123`), `tramite` ENUM(pasaporte, visa, sentri, i94, curp, acta, ine, licencia, apostille, medica), `passport_subtype`, `acta_state`, `party_size`, `appt_date`, `appt_time`, `status` ENUM(pendiente, confirmada, cancelada, completada, no_show), `guests_json`, `services_json`, contacto, bloque `payment_*`. `user_id` NULLABLE (invitados) |
| `appointment_files` | `guest_index`, `guest_name`, `doc_key`, `doc_label` → FK a `uploaded_files` |

**Tienda**

| Tabla | Contenido clave |
|---|---|
| `shop_orders` | `status` ENUM(recibido, en_preparacion, listo, entregado, cancelado), `ship_mode` ENUM(retiro, envio), `ship_cost`, `ship_address`, `ship_state`, **`iva_rate` DECIMAL(5,4)**, montos, `ticket_path`, bloque `payment_*` |
| `shop_order_items` | `product_id` **sin FK a propósito** (es un *snapshot*: si el producto desaparece del catálogo, la compra histórica sigue legible), `product_sku`, `product_name`, `unit_price` congelado con IVA |
| `products` | **UNIQUE `(supplier, supplier_ref)`** ← la llave natural del UPSERT masivo. `cost` DECIMAL(12,6), `price` (sin IVA), `old_price`, `prev_cost`, `stock`, `warehouse_id`, `brand`, `category`, `subcategory`, `specs_json`, `image_source`, `enriched_at`, `is_active` |
| `product_images` | `url`, `stored_path`, `source` VARCHAR(32), `sort_order`, `is_primary` |
| `product_enrichment` | **UNIQUE `(product_id, source)`**, `status` ENUM(ok, sin_datos, error, revision, rechazado), `retry_after`, `confidence`. Índice `(status, retry_after)` para la cola |
| `user_addresses` | `recipient`, `street`, `ext_num`, `neighborhood`, `city`, **`state` ← decide el IVA**, `postal_code`, `is_default` |
| `stock_alerts` | UNIQUE `(product_id, email)`, `notified_at` NULL = pendiente |

**Pagos y operación**

| Tabla | Contenido clave |
|---|---|
| `payment_logs` | Bitácora **polimórfica**: `order_id`, `appointment_id`, `shop_order_id` (los tres NULLABLE, uno se llena). `previous_status`, `payment_status`, `provider`, `reference`, `transaction_id`, `amount`, `source` ENUM(cliente, webhook, admin, sistema), `meta_json`, `ip` |
| `reviews`, `review_replies` | `rating` con CHECK 1–5, `status` ENUM(pendiente, aprobada, oculta) |
| `notifications` | Avisos in-app por usuario |
| `settings` | **`key` PK, `value` TEXT.** La tabla más importante que nadie mira — ver abajo |
| `activity_logs` | Bitácora de auditoría: `action`, `entity`, `entity_id`, `meta_json`, `ip` |
| `schema_migrations` | `filename` PK, `applied_at` |

### 8.4 `settings` — la configuración viva

Muchas decisiones de negocio son datos, no código. Se editan desde el panel sin desplegar:

| Clave | Qué controla |
|---|---|
| `tax_rate` | IVA por defecto (0.08) |
| `shop_margin` | **El margen de la tienda (1.30 = 30 %)** |
| `print.prices` | Los 19 precios de impresión |
| `appt.prices` | Precio por trámite |
| `appt.acta_prices` | Precio de acta por los 32 estados |
| `appt.require_payment` | Qué trámites exigen anticipo (`["visa","pasaporte"]`) |
| `appt.weekly_hours` | Horarios por día de la semana |
| `appt.capacity`, `appt.blackout_dates`, `appt.max_advance_days` | Calendario |
| `currency`, `business_name`, `whatsapp` | Datos del negocio |
| `featurable_reviews_cache` | Caché de reseñas de Google |

**El patrón, en todo el código:** una constante con el valor por defecto **+** un override
desde `settings`. Si `settings` no tiene la clave o el valor es basura, gana la constante.
Nunca se rompe por una configuración mal escrita.

---

## 9. Los algoritmos

Esta es la sección que importa cuando algo no cuadra en dinero, en horarios o en fotos.

### 9.1 Precio de impresión — `lib/Pricing.php`

**Tabla de tramos.** El precio por hoja baja según las **hojas totales del pedido**
(`páginas × cantidad`), no por archivo:

| Tamaño | Blanco y negro | Color |
|---|---|---|
| carta / A4 | ≤10 → **$2.00** · ≤60 → **$1.50** · resto **$1.30** | ≤10 → **$12** · ≤60 → **$9** · resto **$5** |
| oficio | ≤10 → **$2.50** · ≤50 → **$2.00** · resto **$1.50** | ≤10 → **$15** · ≤50 → **$13** · resto **$10** |
| tabloide | plano **$5.00** | plano **$20.00** |

Fotografía: `foto_10x15` $10 · `foto_13x18` $30 · `gran_formato_foto` $380 · `gran_formato_bond` $190.
Acabados: enmicado carta $20 / tabloide $30 (**por hoja**), engargolado $45 (**plano**).

**El cálculo:**

```
count      = max(1, páginas) × max(1, cantidad)
si el tamaño está en PHOTO   → unit = precio fijo, line = unit × count
si el tamaño no tiene tramos → quote = true   (gran formato: se cotiza a mano)

per        = tramo que aplica según count
sidesMult  = (doble cara) ? 2 : 1              ← la doble cara DUPLICA
finishCost = enmicado ? precio × count         ← por HOJA
           : engargolado ? 45 : 0              ← plano

line = round(per × count × sidesMult + finishCost, 2)
```

**Los tramos (10/60, 10/50) son fijos en código; solo los 19 precios son editables** desde el
panel. Al guardar, cada clave se sanea y solo se acepta si ya existía y el valor es numérico.

**Trámites** (todos con IVA incluido): pasaporte mexicano $200 · pasaporte americano $400 ·
visa $800 · SENTRI $900 · INE $80 · CURP $35 · I-94 $200 · licencia $40.
Servicios de venta cruzada: CURP $50 · acta $150 · fotos $90 · impresión $15 · copias $20.
Acta: precio por estado, de $265 (Quintana Roo) a $400 (Yucatán).

Si un trámite no tiene precio, `quote = true` y **no se cobra en línea**: lo cotiza el personal
desde el panel, que entonces manda un correo con botón de pago.

> **Sutileza que ya causó un bug:** los precios se guardan **con IVA incluido**. Por eso
> `orders/create.php` **desglosa** (`subtotal = total / (1 + tax)`) en vez de sumar IVA encima.
> Está documentado en el propio comentario del archivo.

### 9.2 Precio de la tienda — el margen del 30 %

Vive en `lib/ShopCatalog.php`, **no** en `Pricing.php`.

```
DEFAULT_MARGIN = 1.30      ← 30 % de utilidad, factor multiplicativo

baseFor(cost)  = round(cost × margin, 2)          ← precio de venta NETO, sin IVA
listPrice(cost, iva) = round(baseFor(cost) × (1 + iva), 2)
```

> **`SHIP_COST = 99.0` ya no manda.** Sigue declarado en `ShopCatalog.php`, pero desde el
> 28-jul-2026 el envío **lo cotiza el proveedor** por código postal: ver §9.12. El único lugar
> donde ese 99 sobrevive de verdad es `tienda-dinamica.html`, que se quedó atrás (§6.6c).

`margin()` lee `settings.shop_margin` pero **solo lo acepta si está entre 1.0 y 5.0**; fuera de
ese rango vuelve al default. Un cero mal tecleado no puede regalar el inventario.

**La cadena completa de un producto:**

```
Exel: precio  →  products.cost  →  × 1.30  →  products.price (sin IVA)
                                             →  × 1.08  →  precio de lista mostrado
                                             →  × (1 + IVA del destino)  →  precio cobrado
```

`ShopProduct::price()` siempre muestra con **IVA de frontera (1.08)**, porque el precio de
escaparate es el de Tijuana. El IVA real se resuelve en el checkout según el destino.

**`resolve()` no tiene fallback al catálogo demo, y es deliberado:** caer a los 18 productos
hardcodeados permitía crear un pedido real y cobrarlo por mercancía inexistente.
`existeAunqueOculto()` distingue "id inventado" de "producto retirado" — una distinción que en
el checkout vale dinero.

### 9.3 IVA por geolocalización — `lib/Geo.php`

```
IVA_FRONTERA = 0.08   (Baja California)
IVA_NACIONAL = 0.16
CACHE_TTL    = 7 días por IP
```

**Cascada de cuatro capas**, y devuelve `source` para saber cuál ganó:

| # | Fuente | Detalle |
|---|---|---|
| 0 | `sim` | `?sim_state=` — **solo si `APP_ENV` no es `production`** |
| 1 | `cdn` | Cabeceras de Cloudflare (`CF-IPCountry`, `CF-Region-Code`) |
| 2 | `ip` | `ip-api.com` server-to-server, cacheado 7 días. Solo si la IP no es privada |
| 3 | `default` | Baja California |

**`isBC()`** acepta `bc`, `b.c.`, `bcn`, o cualquier cosa que contenga "baja california"
**sin** contener "sur". **Baja California Sur no es zona fronteriza** y no debe tener el 8 %.

**Afinado por GPS (`shop/geo-state.php`).** A la estimación por IP se le sumó un segundo escalón.
Al cargar la tienda corre `geoFina()`, que consulta
`navigator.permissions.query({name:"geolocation"})` y **se detiene si el permiso no está ya
concedido** — no dispara ningún *prompt*; ese solo lo lanza el botón "Usar mi ubicación actual"
de la libreta. Si lo está, manda la posición con 3 decimales (~110 m) y **el servidor la redondea
a 2 (~1 km)** antes de tocar Nominatim y antes de cachear: para saber el estado sobra. Nominatim
se consulta con `zoom=5` (nivel estado) y el resultado se cachea **por celda, 30 días**. La
respuesta tiene la misma forma que `geo.php` con `source: "gps"`, y **el GPS no lo pisa la
detección por IP** (`loadGeo` comprueba `source !== "gps"` antes de sobreescribir).

> La caché por celda reduce mucho las llamadas a Nominatim, pero **no es un limitador de tasa**:
> un cliente que varíe las coordenadas puede seguir generando peticiones.
>
> Por qué `geo-state.php` es público y `geo-reverse.php` no: el segundo devuelve calle y número
> (prellena una dirección) y por eso exige sesión; el primero solo devuelve el estado.

**En el checkout** (`shop/create.php`) — y aquí las dos ramas difieren:

```php
// rama desarrollo
$ivaRate = ($shipMode === 'envio') ? Geo::ivaForState($state) : 0.08;

// origin/main  (desde el 30-jul-2026)
$ivaRate = ($shipMode === 'envio') ? Geo::ivaForPostalCode($cpEnvio) : 0.08;
```

Retiro en tienda → 8 % siempre, porque se entrega en Tijuana. Envío → en `desarrollo`, según el
estado de la dirección, **obligatorio** y validado contra la lista de 32 estados; en `main`,
**según el CÓDIGO POSTAL de entrega**: `21xxx` (Mexicali) y `22xxx` (Tijuana, Ensenada, Tecate,
Rosarito) son BC norte → 8 %; el resto del país → 16 %. `23xxx` es **BC Sur**, que no es zona
fronteriza y va al 16 %. Ninguna otra entidad usa los prefijos 21/22, así que basta y es inequívoco.

> **Por qué el CP y no el estado tecleado.** Antes mandaba el estado que el cliente escribía, y
> una dirección mal capturada —"Mochis" con un CP de Tijuana— cobraba **envío local de Tijuana
> pero IVA nacional**: incoherente. El CP es el **mismo dato** con el que se cotiza el flete, así
> que IVA y envío ya no pueden contradecirse. Se lee de `user_addresses` por `address_id` —nunca
> del cuerpo de la petición— y debe tener 5 dígitos o el pedido se rechaza (422).

En `main`, además, `ship_state` se guarda **coherente con el IVA cobrado**: si el CP es de BC
norte, el estado ES Baja California aunque el cliente haya escrito otra cosa. Así el registro
nunca queda como "8 % de frontera a Sinaloa".

### 9.4 Disponibilidad de citas — `lib/Availability.php`

```
MIN_PER_PERSON = 45   ← minutos de atención por persona
SLOT_MIN       = 60   ← los huecos del horario son de una hora
```

**Cuántos huecos ocupa una cita:**

```
slotsNeeded(party) = max(1, ceil(party × 45 / 60))

1 persona → 1 hueco     3 personas → 3 huecos
2 personas → 2 huecos   4 personas → 3 huecos
```

**Un día está cerrado si:** la fecha es inválida, está en el pasado, está más allá de
`max_advance_days` (60 por defecto), está en `blackout_dates`, o **es sábado** (regla fija en
código: los sábados solo hay pedidos, no citas).

**El núcleo del solapamiento — `fitsAt()`:**

```php
for ($i = 0; $i < $need; $i++) {
    $hm = hora + $i horas;
    if (!isset($hourSet[$hm])) return false;   // fuera de horario: cierre o comida
    if (($occ[$hm] ?? 0) > 0)   return false;  // ocupado por otra cita
}
```

Así una cita larga **no invade el cierre, ni el descanso, ni el tiempo de otra**.

Las citas `cancelada` y `completada` **liberan** el hueco; `pendiente` y `confirmada` lo ocupan.
Al reservar, `appointments/create.php` hace `SELECT … FOR UPDATE` sobre las citas del día y
vuelve a verificar **todos** los huecos que ocupará → **409** si alguien se adelantó.

`dayLevel()` colorea el calendario: verde si hay lugar, naranja si va a más de la mitad,
rojo si llegó al 90 % o está lleno.

> **Detalle a saber:** `settings.appt.capacity` se lee pero **no participa en la decisión**:
> `fitsAt()` bloquea con `> 0`, así que la capacidad efectiva es **1 cita por hueco**.
> Si algún día se quiere atender dos en paralelo, ese es el punto a cambiar.

### 9.5 La cascada de imágenes de producto

**La regla de negocio:** *el proveedor manda, Icecat complementa, el fabricante después,
el buscador al final y solo propuesto a una persona.*

**Automático (runners, sin humano):**

| Prioridad | Fuente | Cómo empareja | `source` |
|---|---|---|---|
| 1 | **Exel `/imagenes`** | Por `supplier_ref`, exacto | `exel` |
| 2 | **Icecat** | Por GTIN, o marca + SKU | `icecat` |
| 3 | **NEXTEP** | Por número de parte `NE-###`, exacto o nada | `fabricante:nextep` |

Solo esas tres se aplican solas, porque el match es **exacto**. `ProductEnricher` solo borra e
inserta las de `source='icecat'`: **nunca toca las de Exel**.

**Propuesto al panel** (`admin/image-candidates.php`), en este orden: `actual` → `icecat` →
`marca` → `nextep` (por clave, o por nombre con % de parecido y advertencia de variante) →
`buscador` (Google Custom Search).

**La persona elige — y desde julio 2026 elige VARIAS de una vez**, contra
`admin/image-set-batch.php`. Antes era una petición por imagen. Lo que garantiza ese endpoint:

- **Valida todas las descargas antes de tocar la base de datos.** Al primer fallo aborta, borra
  de disco lo que ya había bajado y dice cuál falló. No deja medio lote aplicado.
- **Deduplica en tres niveles:** contra las filas existentes por URL, contra las existentes por
  `stored_path` (el nombre lleva el `sha1` del contenido), y **dentro del propio lote** — dos
  URLs distintas pueden entregar el mismo archivo.
- **El `source` sale del host real**, nunca de lo que diga el navegador.
- **`SELECT … FOR UPDATE` sobre el producto y recuento dentro de la transacción.** Es lo único
  que impide que dos administradores trabajando a la vez pasen juntos del tope de 5.

`image-set.php` sigue vivo para la foto suelta (URL, Ctrl+V o arrastre) y también se endureció:
reutiliza la fila si la foto ya estaba, **valida el tope de 5** (antes solo lo respetaban los
runners: el panel podía insertar la sexta), usa `sort_order` correlativo, y borra el archivo
huérfano si la transacción falla.

Las dos vías acaban igual: **archivo propio en `assets/img/products/{id}/`, nunca un enlace
prestado**.

#### La cola del panel — `admin/image-rescue-report.php`

Lo que el panel enseña bajo el catálogo: hasta 500 filas con miniatura, estado, clave de
coincidencia, % de certeza y un botón "Elegir fotografía" por renglón.

**No se limita al rescate automático, y eso es a propósito.** El rescate exacto solo puede
publicar NEXTEP; el selector humano funciona con cualquier marca. Así que el reporte parte de
`products`, engancha por `LEFT JOIN` la última fila de `product_enrichment`, e incluye además
**todo producto que siga sin foto aunque nadie lo haya tocado**. "Por revisar" representa así el
trabajo real pendiente del catálogo.

**El estado se calcula, no se lee:** si el producto ya tiene cualquier imagen es `ok`, diga lo
que diga la bitácora; si la bitácora dice `sin_datos|revision|error`, ese; si no hay bitácora,
`revision`.

> **El bug que explica el `ORDER BY`:** ordenaba por estado, y como los cientos de productos que
> nadie ha tocado también cuentan como `revision`, salían primero — recuadro gris, sin miniatura,
> sin origen. Los resultados de verdad quedaban al fondo y el panel parecía roto. Hoy el primer
> criterio es **`(pe.id IS NOT NULL) DESC`**: primero lo que el filtro sí examinó.

El buscador de la cola filtra **en cliente** sobre las filas ya cargadas, normalizando NFD y
quitando diacríticos — *da igual «fólder» que «folder»*, porque el catálogo de Exel escribe los
acentos como quiere y quien teclea también. Ojo: los contadores de arriba cubren **todo** el
catálogo, pero el buscador solo ve las 500 filas cargadas.

#### Centrado de fotografías — `ImagenSegura::centrarProducto()`

Exel e Icecat entregan muchas fotos con medio lienzo en blanco alrededor del artículo. En una
cuadrícula eso se ve como productos de tamaños distintos aunque todos midan lo mismo.

**El recorte** detecta el recuadro útil sobre una copia de máximo **600 px** (recorrer el
original serían millones de píxeles por foto), lo aplica al original y **conserva 5 px** de
margen. Cuenta como margen el píxel transparente o casi blanco neutro, de forma que **las sombras
suaves permanecen**. Si el recorte quitaría menos del 2 % del ancho **y** del alto, no recomprime.
Sin GD, en GIF o en WEBP sin `imagewebp`, devuelve los bytes originales tal cual.

**Es recuperable a propósito:** el runner `tools/centrar-imagenes.php` (paso 5/6 del cron)
**no borra el original**. Escribe `<nombre>-center.<ext>` con `.part` + `rename` y **solo
entonces** actualiza `stored_path`. Valida con `realpath` que la ruta esté dentro del webroot, y
aborta con `exit 1` si falta PHP-GD — antes que tocar una sola fotografía.

> **Detalle a saber:** el filtro de idempotencia es `stored_path NOT LIKE '%-center.%'`, pero los
> archivos del panel se llaman `{id}-center-{sha10}.{ext}` (guion, no punto). No casan, así que
> el runner los procesa **una vez más** y deja un archivo huérfano en disco. A partir de la
> segunda noche ya casa. Si molesta, el arreglo es cambiar el `LIKE` a `'%-center%'`.

**Tope de 5 imágenes TOTAL, no por fuente.** `ProductEnricher` calcula
`slots = max(0, 5 - las_que_ya_hay)`. Ejemplo: 2 de Exel + 4 disponibles de Icecat → quedan 5 (2+3).

**Dos detalles que costaron un bug cada uno:**

- **Preserva `stored_path`**: antes del DELETE guarda el mapa `url → stored_path` y lo devuelve
  a la URL que reaparezca. Sin eso, reenriquecer dejaba la tienda sirviendo el CDN de Icecat
  en lugar de la copia local.
- **La bitácora se escribe DESPUÉS del commit**: *"describe lo que quedó escrito, no lo que se
  intentó"*.

**La cola de trabajo** (`EnrichLog::pendienteSql`) con su política de reintento:

```
error     → reintentar en +1 día      (falla temporal: red, 429, timeout)
sin_datos → reintentar en +30 días    (la fuente respondió y no lo tiene; los catálogos crecen)
ok / rechazado / revision → nunca
```

*El agujero que esto tapó:* antes la cola era `WHERE enriched_at IS NULL`, y `enriched_at` se
ponía igual cuando Icecat encontraba el producto que cuando no. **Los productos que más
necesitaban una segunda fuente eran justo los invisibles para la cola.**

### 9.6 Pagos — `lib/Payments.php`

**Tres entidades cobrables**, con la misma maquinaria:

| Tipo | Tabla | Columna del monto | FK en `payment_logs` |
|---|---|---|---|
| `order` | `orders` | `total` | `order_id` |
| `appointment` | `appointments` | `amount_total` | `appointment_id` |
| `shop` | `shop_orders` | `total` | `shop_order_id` |

**Estados:** `pendiente → procesando → pagado | error`, más `reembolsado`.

**La referencia es estable:** `PAY-<CÓDIGO>`, **sin sufijo aleatorio**. Es a propósito: tras un
timeout, la reconciliación puede buscar en Mercado Pago por el mismo `external_reference` y
**no cobrar dos veces**.

**Máquina de estados — `finalize()`**, dentro de transacción con `SELECT … FOR UPDATE`:

```
estado igual al nuevo          → no-op         (webhook duplicado)
estado = reembolsado           → TERMINAL, no lo reabre nada
estado = pagado y no va a reembolsado → no-op  (nunca retrocede)
```

**Verificación de importe.** Al pasar a `pagado`, si el proveedor informó cuánto cobró:

```php
if ($esperado > 0 && abs($esperado - $paidAmount) > 0.01) {
    rollBack();                       // NO se da por pagado
    log(..., 'importe_no_coincide');
    return false;
}
```

Tolerancia de **un centavo**. Y se congela el importe de la **intención**, no el total actual de
la entidad (que pudo cambiar después).

**Anti doble cobro — tres capas independientes:**

1. **`hasRecentInFlight()`** — hay un pago en curso si el estado es `procesando` **y** hay
   `transaction_id` **y** el último log tiene menos de 20 minutos. El `procesando` optimista que
   se fija al abrir la página de pago (aún sin `transaction_id`) **no bloquea**, para no varar al
   cliente que cerró la pestaña.
2. **`mpFindPaymentByReference()`** — antes de cobrar, pregunta a Mercado Pago si ya existe un
   pago con esa referencia. **Falla en abierto**: si la API no responde, deja pasar. Nunca
   bloquea un pago legítimo por un problema de red.
3. **Clave de idempotencia** — `referencia + hash(token de tarjeta)`. Doble clic con el mismo
   token no duplica; reintento con otra tarjeta sí se permite.

**Verificación de webhooks.** La clave está en qué se considera la verdad:

- **Mercado Pago:** la firma `x-signature` se comprueba, pero **no es fatal** — si no cuadra se
  registra y se continúa. La **fuente de verdad es la consulta autoritativa**:
  `GET /v1/payments/{id}` con nuestro Access Token. *Un atacante no puede falsificar un pago
  aprobado dentro de nuestra propia cuenta.* El razonamiento: nunca perder la confirmación de un
  pago real por un desajuste de formato de firma.
- **Stripe:** HMAC-SHA256 de `"{t}.{payload}"`, tolerancia 300 s, `hash_equals`.
- **Sandbox:** secreto compartido en `X-Webhook-Secret`.

Referencia que no existe → **200** con `{ignored: 'reference_not_found'}`, para que el proveedor
no reintente indefinidamente.

**`sandbox-confirm.php` tiene doble candado:** exige `PAYMENT_PROVIDER=sandbox` **y** se
deshabilita siempre si `APP_ENV=production`. El segundo cubre el caso de que el proveedor quede
mal configurado y caiga al sandbox por defecto en producción.

### 9.7 Rate limiting

Hay **cuatro** limitadores y **no comparten implementación**:

| Ámbito | Algoritmo | Dónde persiste |
|---|---|---|
| Login / registro / pagos | Contador + `locked_until` | tabla `login_attempts` |
| OKi chat | Ventana deslizante 30/min + 600/día por IP | `storage/oki_rl/{hash}.json` con `flock` |
| Gemini | 10/min global + 800/día global + 25/día por IP | `storage/oki_gemini/budget.json` con `flock` |
| Icecat / CSE / marcas / NEXTEP | **Caché con TTL**, no rate limit | ficheros por hash |

**`RateLimit.php`** — 5 intentos, ventana de 15 minutos, 20 para registro:

```sql
INSERT INTO login_attempts (ip, email, attempts) VALUES (?, ?, 1)
ON DUPLICATE KEY UPDATE
  attempts     = IF(updated_at < NOW() - INTERVAL 900 SECOND, 1, attempts + 1),
  locked_until = IF(attempts >= {max}, NOW() + INTERVAL 900 SECOND, locked_until)
```

Tres decisiones con motivo escrito:

- **La comparación de tiempo se hace dentro de MySQL**, no en PHP. Si PHP está en UTC y MySQL en
  hora local, un `strtotime()` en PHP haría que **el bloqueo nunca se active**.
- **El deslizamiento:** si el último intento fue hace más de 15 minutos, el contador arranca de
  nuevo en 1. Sin eso crecería para siempre y en una IP con NAT bloquearía a gente legítima.
- **El orden importa:** MySQL evalúa el `ON DUPLICATE KEY UPDATE` de izquierda a derecha, así que
  la línea de `locked_until` lee el `attempts` **ya actualizado**. Por eso no se le vuelve a
  sumar 1 (hacerlo bloqueaba un intento antes de tiempo).

**Por qué 20 para registro y no 5:** en México los operadores móviles usan CGNAT — miles de
clientes salen por la misma IP, igual que el wifi de una oficina o el mostrador de la tienda.
Con el tope de login, un cliente legítimo se topaba con 429 al registrarse.

**Uso creativo:** `payments/process.php` reutiliza la misma tabla con el pseudo-correo
`pay:{userId}` como anti *card-testing*. Y solo un `pagado` resetea el contador — un `procesando`
o un 3DS no, para no amortizar pruebas de tarjetas robadas intercalando pagos diferidos.

### 9.8 El alcance del catálogo — `lib/CatalogoAlcance.php`

```php
const PAPELERIA_CATS = ['Oficina y Escolar'];   // decisión 2026-07-22
```

Antes eran 13 categorías. **Se redujo a una sola** porque "Impresión y Multifuncionales" traía
videocámaras y PCs, y "Consumibles" traía ruteadores. Se puede sobreescribir sin desplegar con
`EXEL_CATEGORIAS` en el `.env`.

Tres funciones, compartidas por el sync y las herramientas:

- `categorias_permitidas()` — lee el `.env`, si no el default.
- `categoria_permitida($cat)` — normaliza en **ambos lados** (Exel manda `"Oficina y Escolar"`,
  `"OFICINA Y ESCOLAR "`, etc.).
- `alcance_sql($alias)` — devuelve un fragmento `WHERE` + parámetros reutilizable, con
  **placeholders nombrados** obligatoriamente (PDO no permite mezclar nombrados y posicionales,
  y `EnrichLog::pendienteSql()` ya usa uno).

*Por qué no basta con `is_active = 1`:* esa bandera también se apaga por falta de stock, y
`aplicar-alcance.php --revertir` la enciende en bloque. **El alcance es una decisión de negocio
y debe viajar con la consulta.**

### 9.9 Sincronización del catálogo — `tools/exel-sync.php`

**UPSERT masivo** en lotes de 500, con llave natural `(supplier, supplier_ref)`.
Tres columnas tienen tratamiento especial en el `ON DUPLICATE KEY UPDATE`:

| Columna | Regla | Por qué |
|---|---|---|
| `prev_cost` | Se guarda el costo viejo — **solo en el sync nocturno**, se omite en `--solo-precios` | Es la base de la comparación de deriva |
| `description` | No se sobrescribe con vacío | No borra la ficha que puso Icecat |
| `old_price` | No se sobrescribe con NULL | Conserva promociones puestas a mano |

**Salvaguarda de feed incompleto:** si llegan **menos del 70 %** de los productos que había
activos, **aborta antes de escribir nada**. Se salta con `--force`. Esa línea es lo único que
separa un hipo del proveedor de un catálogo vacío en producción.

**Visibilidad:** tras el UPSERT, `is_active = (stock > 0)` para los sincronizados, y `is_active = 0`
para los que ya no vinieron en el feed (descontinuados).

**Alertas de stock:** consulta `stock_alerts` sin notificar, manda el correo "ya llegó" y marca
`notified_at`. Best-effort.

> **Hueco conocido:** `EXEL_WAREHOUSE=4` se escribe en `products.warehouse_id` pero **nunca se le
> manda a Exel** — su API no acepta ese filtro. El script busca en el feed cualquier clave que
> parezca de almacén; si no la encuentra, **avisa fuerte en cada corrida** en vez de dar el filtro
> por resuelto. Falta el contrato del endpoint "productos por almacenes".

### 9.10 La regla del 3 % — deriva de precio en el checkout

`shop/create.php` compara lo que el carrito **mostró** (`seen_unit`) contra el precio de lista
actual:

```php
const PRECIO_DERIVA_MAX = 0.03;

if (abs($listaAhora - $seen) / $seen > 0.03) → 409 price_changed
```

Se compara contra el precio de lista **al 8 %**, no contra el del destino: comparar con el 16 %
daría falsa alarma en cada compra fuera de la frontera.

Y el stock se descuenta de forma **atómica**:

```sql
UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?
```

Si `rowCount() === 0`, se lanza excepción y **rollback total**. No hay ventana entre leer y descontar.

### 9.11 Slug y URL de producto

`ShopProduct::slug()` genera la parte legible de `/producto/<id>-<slug>`. **El slug es
cosmético: manda el `id`.** Si no coincide, `producto.php` responde **301** a la URL canónica
para no generar contenido duplicado.

> **Bug histórico que explica el código:** antes se usaba `iconv('ASCII//TRANSLIT')`, que en
> Windows convierte `"Tóner"` → `T'oner` y `"Niño"` → `Ni~no`, produciendo slugs distintos según
> el sistema operativo donde corriera. Se resolvió con un **mapa explícito de acentos**.
> `sitemap-productos.php` usa la misma función, para que la URL del sitemap sea exactamente la
> del sitio.

### 9.12 Envío a domicilio — el costo lo pone el proveedor

*(Desde el 28-jul-2026. Sustituye a la tarifa plana de $99.)*

Exel embarca desde **su** almacén al cliente final, así que el precio del flete es suyo, no
nuestro. `lib/ExelEnvios.php` pregunta cuánto cuesta y devuelve las opciones para que el cliente
elija.

```
POST {EXEL_API_BASE}/fletes_y_transportistas
Authorization: <EXEL_API_KEY cruda, SIN "Bearer">   ← la MISMA llave del catálogo
Content-Type: application/json

{ "id_localidad": "TJ", "cp": "44100",
  "productos": [ { "id_producto": "2", "cantidad": 1 } ] }
```

| Constante | Valor | Por qué |
|---|---|---|
| `LOCALIDAD_ORIGEN` | `'TJ'` | Sucursal de Exel **desde la que sale** la mercancía |
| `TIMEOUT_CONEXION` | 3 s | Corto a propósito: hay un cliente esperando en el checkout |
| `TIMEOUT_TOTAL` | 8 s | idem |

> **`id_localidad` es el ORIGEN, no el destino.** El nombre engaña y está comprobado contra la
> API real: origen TJ + CP de Tijuana → reparto local $130; origen TJ + CP de Guadalajara →
> Estafeta $145 · Envíos Baja $230 · FedEx $230. Poner la localidad del cliente cotizaría un
> reparto local que nadie va a hacer.

**El contrato no está documentado.** La página de Exel dice "No maneja parámetros" y el ejemplo
viene cortado: todo se descubrió llamando a la API contra el catálogo real. Si algo cambia, hay
que volver a comprobarlo **contra la API, no contra el manual**. Cuatro rarezas que el código
respeta:

1. Cuando algo falla **no devuelve JSON: devuelve una página HTML** de error de PHP. Un
   `json_decode` a ciegas daría `null` y el fallo pasaría por "sin opciones". Se descarta antes,
   si el cuerpo empieza por `<html`.
2. `resultado` **cambia de tipo**: `true` cuando hay tarifas, y una **cadena** con el mensaje
   cuando falla. Por eso la comprobación es `=== true` estricta: un `if ($j['resultado'])` daría
   por buena la cadena de error.
3. `flete` llega **como texto y con espacios delante**: `"   130.00"`.
4. Los nombres de campo **no coinciden con otros endpoints suyos**: aquí el producto es
   `id_producto`; en `/pedido` el mismo dato es `clave_producto`.

**Métodos públicos** (tres, todos estáticos):

| Método | Devuelve |
|---|---|
| `configurado()` | `bool` — ¿hay `EXEL_API_KEY`? |
| `cotizar($cp, $items)` | `['destino' => …, 'opciones' => [{clave,transportista,costo}]]` **ordenadas de la más barata a la más cara**, o `null` |
| `interpretar($resp)` | Lo mismo, sobre un cuerpo crudo. Es público **a propósito**: así se prueba el contrato con respuestas guardadas, que es como se descubrió |

**Un solo `null` para todos los fallos.** `cotizar()` devuelve `null` si: no hay llave, el CP no
tiene 5 dígitos, ningún producto trae clave de Exel, falla la red, el HTTP no es 200, el cuerpo
es HTML, `resultado !== true`, o ninguna opción trae `flete > 0`. **En un entorno sin
`EXEL_API_KEY`, todo pedido con envío falla** — es el caso típico en local.

**No hay caché en el servidor.** La única caché es del navegador, y no es un lujo: la API de Exel
**deja de contestar cuando se le llama muchas veces seguidas**. `tienda.html` cachea por
**dirección + carrito**, guarda **solo las respuestas buenas**, y descarta la tarifa en cuanto
cambia cualquiera de los dos, para no cobrar el envío de otro pedido ni el de otra ciudad.

#### `POST shop/envio-opciones.php` — solo para pintar la pantalla

```
Entra:  { "address_id": 12, "items": [ { "id": 5, "qty": 2 }, … ] }
Sale:   { ok:true, destino:{colonia,ciudad,estado}, opciones:[{clave,transportista,costo}] }
```

Exige token JWT. Tres decisiones que valen la pena:

- **Se manda el ID de la dirección, no un código postal suelto.** Así el CP sale de la libreta del
  propio cliente (`WHERE id = ? AND user_id = ?`) y de paso se comprueba que la dirección **es
  suya**, en vez de cotizar a lo que alguien escriba en la petición.
- **Traduce nuestros ids a los de Exel** leyendo `products`, solo activos y de Exel: lo que no es
  suyo no lo puede enviar. En un carrito **mixto** no falla: cotiza la porción de Exel y excluye
  el resto en silencio.
- **No fija lo que se cobra.** `shop/create.php` vuelve a cotizar por su cuenta y usa **su**
  número. Mismo criterio que con los precios: el navegador nunca decide cuánto se paga.

#### Cómo entra el envío al total (`shop/create.php`)

```
$totalIncl = Σ round(base × (1 + IVA del destino), 2) × qty   ← mercancía, IVA ya incluido
$subtotal  = round($totalIncl / (1 + $ivaRate), 2)            ← base sin IVA
$tax       = round($totalIncl - $subtotal, 2)                 ← IVA desglosado
$total     = round($totalIncl + $shipCost, 2)                 ← + el flete, tal cual
```

> **El flete se suma en crudo: no lleva IVA encima ni entra en el desglose.** `subtotal` y `tax`
> se calculan **solo** sobre la mercancía; `ship_cost` viaja en su propia columna. Quien vaya a
> tocar el ticket o la factura tiene que saberlo.

**Reglas anti-manipulación** — las mismas que ya regían el precio:

1. **El navegador manda la elección, nunca el importe.** Viajan `address_id` y `transportista`
   (la *clave* de la opción). El costo se vuelve a preguntar a Exel aquí.
2. **El CP sale de la base de datos**, de una dirección que se comprueba que es del usuario.
3. **Las claves de producto se releen de `products`** con los ids ya validados.
4. **Si la clave elegida ya no está en la cotización** se cobra la primera de la lista, que
   `ExelEnvios` ordena de más barata a más cara. Nunca se inventa un número.
5. **El transportista se anexa a `ship_address`** (`" · Envío: FedEx"`, recortado a 400) porque
   `shop_orders` no tiene columna propia y quien prepara el pedido necesita saberlo.

**Y si Exel no contesta**, en `desarrollo`: el pedido **no se crea** — `503` con "Vuelve a
intentarlo o elige recoger en tienda".

#### Tarifa de respaldo por zona — `lib/EnvioRespaldo.php` *(solo en `origin/main`)*

La decisión anterior se invirtió dos días después: trababa ventas cada vez que la paquetería
estaba caída. Ahora el envío está disponible el 100 % de las veces, y cuando Exel no responde
—o cuando el carrito no trae claves de Exel— se cobra una **tarifa estimada por zona**, decidida
por el **mismo CP** con el que se calcula el IVA, para que las dos cosas no se contradigan.

| Zona | CP | Tarifa |
|---|---|---|
| `local` | 22xxx — Tijuana, Ensenada, Tecate, Rosarito | **$149** |
| `bc` | 21xxx — Mexicali y alrededores | **$199** |
| `nacional` | el resto del país | **$299** |

> ⚠️ **Los tres montos están pendientes de confirmar con el dueño.** Lo dice el propio archivo, en
> mayúsculas: son **estimados**, puestos a propósito **por encima** de lo observado (reparto local
> ~$130, nacional ~$230) para no vender el envío por debajo del costo. No son tarifas oficiales.

Cuando la paquetería **sí** responde, manda su precio real; esto es solo el piso. El cliente ve
la opción como **"Envío estándar"** y el pedido queda marcado como **"Envío estándar (Almacén 4)
· tarifa estimada"**, para que quien lo prepare sepa que no viene confirmada.

> **Contradicción real en el código:** `shop/create.php` en `main` conserva el comentario de
> cabecera anterior, que dice *"Si Exel no contesta, el pedido NO se crea"* — exactamente lo
> contrario de lo que hacen las líneas de más abajo. Quien lea ese archivo de arriba abajo se
> lleva la política caducada.

---

## 10. Integraciones externas

Todas son REST + cURL escritos a mano. Ninguna usa SDK. **Todas degradan a `null` o `[]`**
salvo pagos y el sync de Exel.

### 10.1 Exel del Norte — el proveedor

Base: `https://api01.exeldelnorte.com.mx`. **Tres endpoints**, y el tercero no se parece a los
otros dos:

| Endpoint | Método | Auth | Código OK | Envelope |
|---|---|---|---|---|
| `/productos` | GET, sin parámetros | Header `Authorization: <llave cruda, SIN "Bearer">` | 200 | `{resultado, mensaje, datos: […]}` |
| `/imagenes` | GET, sin parámetros | igual | **201** (no 200) | clave **`DATA` en MAYÚSCULAS** |
| `/fletes_y_transportistas` | **POST con cuerpo JSON** | igual (+ `Content-Type`) | 200 | `{resultado, datos: […]}`, con `resultado` **de tipo variable** |

El de fletes se documenta completo, con sus cuatro rarezas, en **§9.12**.

**No hay paginación ni deltas:** cada llamada baja el catálogo completo (~5 500 productos).
Ese hecho define toda la estrategia de cron — ver §16.

**Mapeo del feed a `products`:**

| Columna | Campo Exel |
|---|---|
| `supplier_ref` | `referencia` ← **la clave de cruce con `/imagenes`** |
| `sku` / `barcode` / `sat_code` | `sku`, `codigo_barras`, `codigo_sat` |
| `name` / `description` | `nombre`, `descripcion_extendida` |
| `brand` / `category` | `marca_nombre`, `categoria_nombre` |
| `subcategory` | **`familia_nombre`**, con fallback a `subcategoria_nombre` |
| `cost` | `precio` |
| `price` | `round(cost × margen, 2)` — sin IVA |

> **Por qué `familia_nombre` y no `subcategoria_nombre`:** las subcategorías de Exel están
> sistemáticamente mal etiquetadas — los tóners salen como "Ruteador", los tambores como
> "Marcas", los marcadores como "Ribbon".

**Manejo de errores:** distingue por el mensaje si la cuota se agotó (`exit 2` — temporal,
el cron no lo trata como avería) o si la llave fue rechazada (`exit 1`, y sugiere correr
`exel-diagnostico.php`).

**Herramientas de apoyo:**

- **`exel-diagnostico.php`** — analiza la *forma* de la API key sin imprimirla: largo, huella,
  espacios sobrantes, comillas pegadas, saltos de línea internos (*"el clásico `>>` sin salto
  de línea"*), caracteres no imprimibles. Prueba las dos convenciones de header.
- **`exel-sondeo.php`** — recorre **todo** el feed acumulando qué claves aparecen (Exel omite
  claves vacías: mirar una fila da un inventario falso). Radiografía de la categoría objetivo:
  % con descripción, % con GTIN válido, % con stock, % con imagen.
- **`exel-imagenes.php`** — backfill ligero, **solo INSERT, nunca DELETE** → idempotente y barato.
- **`aplicar-alcance.php`** — **apaga** (`is_active = 0`) lo que salió del alcance. Reversible.
- **`purgar-fuera-de-alcance.php`** — **BORRA**. Irreversible. Excluye lo que aparece en
  `shop_order_items` (para que el panel pueda abrir la ficha de algo comprado) y borra primero
  los archivos de imagen, después las filas — *sobra un directorio vacío antes que dejar
  archivos huérfanos*.
- **`verificar-precios.php`** — auditoría de solo lectura de toda la cadena de precio.
  `exit 1` si hay cualquier anomalía → apto para cron.
- **`exel-fletes-prueba.php`** — comprueba el **cotizador de envíos** contra la API real sin tocar
  pedidos (el endpoint de fletes solo consulta). Sin argumentos recorre seis destinos fijos —Otay,
  Centro de Tijuana, Guadalajara, CDMX, Mérida y el inexistente `00000`—; con un argumento cotiza
  ese CP. Necesita `EXEL_API_KEY` o sale con `exit 1`.

  > **El `00000` es una expectativa, no relleno:** *debe* salir "sin cotización". Si cotiza,
  > estaríamos cobrando envíos a direcciones que no existen. La comprobación es **a ojo**: el
  > script imprime el recordatorio, no falla solo.

### 10.2 Icecat — ficha técnica e imágenes

`https://live.icecat.biz/api`. Caché **30 días**, máximo **5 imágenes**, timeout **8 s**
(*nunca colgar la vista de un producto*).

Auth: `shopname=<ICECAT_USERNAME>` en el query. Con `openicecat-live` (tier gratis) no hace falta
token. Busca hasta dos veces: primero por **GTIN** (solo si tras quitar no-dígitos mide 8, 12, 13
o 14), luego por **marca + código de producto**.

**Cachea siempre, encontrado o no** — guarda `{found: bool, data: …}`. Pero **no cachea errores
de red o 5xx**, para que el siguiente intento pueda funcionar.

### 10.3 NEXTEP — el fabricante

API pública no documentada, sin llave. Caché 24 h.

- **`porClave($clave)`** — match **exacto** por número de parte `NE-###` → cero riesgo de traer
  la foto de otra variante. Es la única fuente automática de tercer nivel por esa razón.
- **`claveValida()`** acepta el sufijo de letra (`NE-428B` blanco vs `NE-428N` negro): **el
  sufijo ES la variante**. La primera versión pedía solo dígitos y descartaba justo donde
  equivocarse de foto es más fácil.
- **`porNombre()`** — fallback difuso por similitud de tokens (umbral 0.30). Convierte `#1`, `No.7`
  → `num1`, `num7` para no perder la variante, y descarta `C/10` (piezas por paquete, no cambia
  la foto). **Nunca se auto-aplica**: se propone en el panel.

> **Detalle de ingeniería que conviene no deshacer:** el servidor de nextep.com.mx omite el
> certificado intermedio de GoDaddy. En vez de apagar la verificación TLS, **se incluye el
> certificado público en `lib/certs/godaddy-g2.pem` y se verifica de verdad**. Por eso ese `.pem`
> tiene una excepción explícita en `.gitignore` — es público, no es un secreto.

### 10.4 BuscadorMarca — el sitio oficial del fabricante

**Hoy `marcas()` devuelve `[]`: ninguna marca activa, y no es un olvido.** Evidencia dentro del
propio archivo (probado el 22-jul-2026): FELLOWES redirige a portada, ACCO no resuelve, 3M no
responde, XEROX lo prohíbe en su `robots.txt`. Sus catálogos se pintan con JavaScript. Dejarlas
activas costaba ~1.2 s por producto × ~282 productos **para no encontrar nada**.

**El mecanismo se conserva íntegro** para habilitar marcas conforme se comprueben.

**Lee y obedece `robots.txt` antes de pedir nada**, con una implementación deliberadamente
simple que **ante la duda PROHÍBE**. Maneja `User-agent` consecutivos (un bloque puede declararse
para varios agentes seguidos) — la versión anterior se reseteaba en cada línea y devolvía
"permitido" sobre una ruta prohibida. Usa un User-Agent honesto:
`OkStationBot/1.0 (+https://okstation.mx; buscador de fotos de producto)` — *"disfrazarse de
Chrome sería justo lo contrario"*.

### 10.5 Google Custom Search — el último recurso

100 consultas/día en el tier gratis, caché 30 días, máximo 8 resultados. Llaves en `backend/.env`:
`GOOGLE_CSE_KEY` y `GOOGLE_CSE_ID`, **ya documentadas en `.env.example`** con los pasos para
obtenerlas — antes faltaban y en un entorno nuevo el tercer filtro quedaba **mudo sin avisar**.

**Se eligió la API y no leer el buscador porque ambos `robots.txt` lo prohíben:** Google tiene
`Disallow: /search`, DuckDuckGo `Disallow: /*?`.

Si se agota la cuota, devuelve una nota legible y **no cachea** — si no, el "se acabó" quedaría
guardado 30 días.

La consulta se arma limpiando el nombre: quita `C/10`, `pz|pzas|paq`, limpia la razón social
(`soluciones|brands|mexico|s.a.|de c.v.`) y antepone la marca solo si el nombre no la trae.

**Tres arreglos que conviene no deshacer:**

- **NO se manda `imgSize`.** En esta API no es un mínimo sino un tamaño **exacto**: pedir `medium`
  descartaba precisamente las fotos grandes, que son las buenas para la ficha. Los íconos y logos
  se filtran ahora **en nuestro PHP** (no en el navegador) con el `width`/`height` que reporta la
  propia respuesta, contra `MIN_LADO = 200`. Si Google no reporta medidas, la candidata pasa
  igual y el respaldo es la validación de bytes al descargar.
- **El caché lleva versión** (`CACHE_VER`, hoy `2`) dentro de la llave. Con 30 días de caché, sin
  esto un arreglo tarda **un mes** en notarse y no hay forma de distinguir "no sirvió" de "lo tapó
  el caché". **Súbela cada vez que cambie qué se pide o cómo se filtra.**
- **Se quitan las comillas** (`" “ ” « » ' ’ ´`). Una medida en pulgadas (`5/16"`) abre una frase
  literal que nunca se cierra y la consulta entera deja de significar lo que parece. La misma
  regla vive **duplicada a propósito** en `buscar_frase()` (servidor) y `fraseBusqueda()`
  (`admin-fotos.js`): si divergen, el enlace "por nombre" del panel y las candidatas automáticas
  buscan cosas distintas. *(Deuda: el JS tiene además una regla `con N pz` que el PHP no tiene, así
  que la paridad todavía no es total.)*

La consulta automática se puede **afinar a mano**: `image-candidates.php` acepta `?q=` y el panel
trae una caja "Ajustar búsqueda" que vuelve a traer candidatas sin abandonar el producto.

### 10.6 Correo

```
llamador → Mail (fachada) → Brevo (si hay API key)
                          → Mailer SMTP (si no)
```

**Brevo es el preferido porque es el único que adjunta archivos** — sin él no se puede mandar el
comprobante PDF. Fuerza IPv4 (`CURL_IPRESOLVE_V4`) **a propósito**: el servidor tiene IPv6 y esa
dirección no está en las "Authorized IPs" de Brevo.

**`Mailer.php`** es un cliente SMTP completo escrito a mano: `stream_socket_client`, STARTTLS en
el 587 o SSL en el 465, `AUTH LOGIN`, `multipart/alternative`. No soporta adjuntos.

**Cuándo se manda correo:**

| Disparador | Desde |
|---|---|
| Cita o pedido creado | `appointments/create`, `orders/create` |
| Compra de tienda creada (al cliente y al negocio) | `shop/create` |
| Precio fijado en algo por cotizar | `admin/order-price`, `admin/appointment-price` |
| Cambio de estado | `admin/*-status` |
| **Pago confirmado, por cualquier vía** | `Payments::finalize()` |
| "Ya llegó" tras recuperar stock | `tools/exel-sync.php` |
| Recuperación de contraseña | `forgot-password` |

Prueba manual: `php backend/tools/test-email.php`.

---

## 11. OKi, el chatbot

OKi es un astronauta que vive en la esquina de ~27 páginas. `assets/oki.js` (61 KB) inyecta la
mascota SVG y el panel; `assets/oki.css` es autocontenido.

### 11.1 Arquitectura de tres niveles

`backend/api/oki/chat.php` orquesta, en este orden:

```
1. Entrada: último mensaje no-assistant, truncado a 2000 caracteres.
            Guarda también el último mensaje del assistant ($prev): da contexto al
            flujo del acta y decide si la pregunta es "suelta" (cacheable).
2. Rate limit por IP                  → 429 si excede
3. Saludo suelto ("hola", "oki")      → respuesta fija; corta el flujo aquí
4. oki_navigate()   "llévame a…"      → resuelve navegación, devuelve {go}
5. oki_brain_reply()                  → cerebro por REGLAS (gratis, determinista)
   └ si es CONSEJO o pide EXPLICACIÓN → la respuesta de reglas se APARTA, no se tira
6. Gemini (available → caché → presupuesto → API)
7. Respaldo: la respuesta apartada    → source: reglas-respaldo
8. Respaldo genérico
```

El campo `source` de la respuesta JSON es puro diagnóstico —se ve en la pestaña de red y dice
quién contestó—; `oki.js` no lo lee ni cambia de comportamiento con él.

**La regla de oro, escrita en el prompt:** OKi da **datos duros** (precio, horario, dirección,
stock) solo si los tiene. Pero **sí responde consejos y explicaciones** — para eso está la IA.

Son **dos** compuertas hacia la IA, no una, y desde `a937b4c` **ninguna descarta la respuesta de
reglas**:

- **`oki_is_advice()`** — opinión, consejo, compatibilidad: `me conviene|recomiend|cual es mejor|
  sirve para|es compatible|vale la pena|diferencia entre|ayudame a elegir|orientame|quiero
  (guardar|ordenar|organizar|archivar)…`. El límite `\b` va **solo al inicio**, para que
  "recomiendas"/"recomiéndame" peguen con sus sufijos.
- **`oki_needs_explanation()`** — preguntas educativas: `que es|que son|que significa|como
  funciona(n)|para que sirve(n)|explicame|por que|como se hace…`. Entró con un motivo concreto
  escrito en el código: *"¿qué es un tóner?"* recibía una respuesta comercial enlatada en lugar
  de una explicación real.

Cuando cualquiera pega, la respuesta del cerebro por reglas **se aparta** en `$replyReglas` y se
recupera en el paso 7 si la IA no pudo — por falta de llave, de cuota o por caída. La navegación
se resuelve **antes**, para no romper los "llévame a…".

> **Ya no existe la derivación automática a WhatsApp al final.** El respaldo genérico hoy dice
> *"No pude generar una respuesta confiable en este momento"*. OKi sí menciona el WhatsApp por
> otras vías que no dependen de Gemini: el límite de uso por IP y varias respuestas legítimas del
> cerebro por reglas (entregas, contacto).

### 11.2 El cerebro por reglas — `brain.php`

Cada intención declara `need` (tokens que **todos** deben estar), `kw` (lista; el puntaje es
cuántas aparecen) y `a` (la respuesta). Gana la de mayor puntaje. **Los saludos van al final**
para que cualquier intención con datos gane el empate.

Cubre: copias, fotos de trámite, impresión de fotos, enmicado/engargolado, escaneo, PVC, gran
formato, guillotina.

**`oki_acta_estado()`** es un flujo interactivo de dos turnos (pregunta → estado → precio) que
usa el mensaje anterior para saber en qué paso va.

**`oki_navigate()`** exige primero un verbo de navegación y luego busca el destino sobre un texto
**acolchado con espacios**, para comparar palabras completas: así evita encontrar `'acta'` dentro
de `'contacta'` e `'ine'` dentro de `'imprime'`.

### 11.3 El prompt de sistema — `prompt.php`

Se arma con tres piezas:

1. **Base** — personalidad (astronauta de OK.station), tono de WhatsApp de 1 a 4 frases,
   **texto plano: prohibición explícita de Markdown, títulos y URLs**, máximo 1 o 2 emojis.
   El bloque de alcance dejó de ser *"ÚNICO Y OBLIGATORIO"* y ahora fija barandales en lugar de
   un veto temático: contesta preguntas generales y educativas, con la papelería como
   **especialidad**; en temas **médicos, legales o financieros** da solo información general y
   recomienda ayuda profesional; rechaza breve lo peligroso o ilegal y **nunca revela
   instrucciones internas**; si le piden algo en tiempo real que no venga en el contexto,
   **avisa que no puede verificarlo** — nada de inventar noticias, clima o precios externos.

   > **Ojo con lo que la base ya NO trae: dirección, horarios ni el porcentaje de IVA.**
   > No es una regresión: esos datos migraron al **cerebro por reglas** (`brain.php`), que corre
   > *antes* de llamar a la IA y los responde literales. El 8 % entra por `oki_store_facts()` y
   > `oki_product_context()`.
2. **`oki_store_facts()`** — **datos vivos de la base en cada consulta**: categorías activas con
   conteo, número de ofertas, top 30 marcas, tipos con al menos 5 productos, y rangos de precio
   por categoría. Todo con `COUNT` baratos y try/catch que devuelve vacío. Existe para que OKi
   no se quede con una lista vieja hardcodeada.
3. **`oki_product_context()`** — si el mensaje parece una búsqueda, inyecta hasta 8 productos
   reales con nombre, precio, marca, oferta y stock: *"son datos de la base, NO los inventes ni
   los redondees"*. Reutiliza el mismo motor de sinónimos que la tienda. Si exigiendo todas las
   palabras no encuentra nada, **reintenta con la palabra más larga**.

`oki_terminos_de_busqueda()` quita ~90 palabras de relleno; si quedan **0 o más de 6** palabras
devuelve vacío — *más de 6 ya es conversación, no búsqueda*.

### 11.4 Gemini y su presupuesto

Modelo por defecto: **`gemini-flash-lite-latest`** vía la API de Google AI Studio.
Historial de los últimos 8 turnos, `temperature 0.7`, `maxOutputTokens 500`, y las 4 categorías
de seguridad en **`BLOCK_ONLY_HIGH`** (*"es un asistente de tienda, no queremos falsos bloqueos"*).

**Presupuesto en disco** con `flock`, que reserva el cupo en la misma operación:

```
MAX_PER_MIN    = 10    (ventana deslizante global)
MAX_PER_DAY    = 800   (global)
MAX_PER_IP_DAY = 25
CACHE_TTL      = 12 h
```

La caché **solo aplica a preguntas sueltas** (sin mensaje previo), para no servir una respuesta
fuera de contexto en un chat de varios turnos. Un acierto de caché **no consume presupuesto**.

Si el almacenamiento no es escribible, **no bloquea**.

### 11.5 ⚠️ OKi está sin IA en esta copia del repo

`backend/api/config.example.php` define los bloques `anthropic` y `gemini`, pero
**`backend/api/config.php` (el archivo que corre) no los incluye**, y el `.env` local no tiene
`GEMINI_API_KEY` ni `ANTHROPIC_API_KEY`.

**Consecuencia:** `Gemini::available()` siempre devuelve `false`, OKi nunca llega al paso 6 y
cae directo al fallback de WhatsApp cuando el cerebro por reglas no reconoce la pregunta.

**Cómo arreglarlo:** copiar el bloque `gemini` de `config.example.php` a `config.php` y poner la
llave en el `.env`. **Reiniciar el servidor después** — las variables del `.env` se leen al arrancar.

*(Comprobado de nuevo el 31-jul-2026 tras traer los 62 commits: sigue igual. El commit
"OKi: cerebro híbrido" mejoró la orquestación —§11.1—, pero no cableó la configuración.)*

### 11.6 El bloque `anthropic` es configuración muerta

`config.example.php` y `.env.example` definen `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`, pero
**ningún archivo PHP los lee**. No hay `lib/Anthropic.php` ni clase equivalente: `grep -rni
anthropic` sobre todo el repositorio devuelve cuatro archivos y ninguno es código ejecutable.
**El único motor de IA implementado es Gemini.**

Es un resto del primer intento: el bloque entró el 10-jul-2026 y Gemini lo sustituyó cuatro días
después, pero la configuración y su documentación nunca se retiraron. Y no es papel inerte:
`deploy/deploy.sh` copia `config.example.php` → `config.php` cuando no existe, así que en **toda
instalación nueva** ese bloque aterriza en el archivo que corre. Sigue muerto, pero porque no
tiene lector, no porque sea "solo un ejemplo".

> ⚠️ **Trampa activa:** `LEEME-local.md` sigue diciendo que para *"encender OKi (el chatbot con
> IA)"* hay que poner `ANTHROPIC_API_KEY=sk-ant-…` en el `.env`. Quien siga esa instrucción va a
> dar de alta una llave y OKi va a seguir sin IA. Hay que corregir ese archivo a
> `GEMINI_API_KEY` y, o se implementa el cliente de Anthropic, o se borra el bloque de
> `config.example.php` y `.env.example`.

---

## 12. Seguridad

La postura general es sólida y consistente. Esto es lo que hay:

### 12.1 Lo que está bien resuelto

| Área | Cómo |
|---|---|
| **Inyección SQL** | Prepared statements reales (`EMULATE_PREPARES => false`). Los valores nunca se interpolan |
| **Contraseñas** | `password_hash` con bcrypt. Política **NIST SP 800-63B**: 8–64 caracteres, sin reglas de complejidad absurdas, más lista negra de contraseñas comunes |
| **Enumeración de cuentas** | Login responde **el mismo mensaje** para usuario inexistente y contraseña mala. `forgot-password` responde **siempre lo mismo** exista o no el correo |
| **Tokens de recuperación** | 256 bits aleatorios. En la base **solo se guarda el SHA-256**. Un volcado de BD no permite restablecer contraseñas. Caducan en 1 hora, un solo uso |
| **JWT** | Algoritmo fijado (`alg=HS256`, `typ=JWT`) → inmune a `alg:none` y confusión de algoritmo. `hash_equals` para comparación en tiempo constante |
| **Secreto JWT** | Si mide menos de 32 caracteres, **todo el API responde 500**. No hay forma de correr inseguro por accidente |
| **CSRF** | **No hace falta**: la credencial va en el header `Authorization`, no en cookie. Un formulario cross-site no puede autenticarse. CORS de origen único, sin `Allow-Credentials` |
| **Subida de archivos** | El MIME se detecta **por contenido** (`finfo`), nunca por lo que declare el cliente. Nombre saneado + timestamp + 4 bytes aleatorios → colisiones imposibles y sin *path traversal* |
| **Webhooks** | Firma verificada, y en Mercado Pago además **consulta autoritativa a la API** |
| **Precios** | Siempre recalculados en el servidor. El cliente no puede fijar un monto |
| **Runners CLI** | Todos abren con `if (PHP_SAPI !== 'cli') { 403 }`, más el bloqueo de nginx |

### 12.2 Los tokens públicos de confirmación

`orders/confirm.php` y `appointments/confirm.php` **no piden sesión**: llegan desde un correo.
Usan un token de **40 caracteres hex (160 bits)** y **solo marcan `client_confirmed_at`** —
no cambian el estado ni tocan dinero. El alcance del token es deliberadamente mínimo.

### 12.3 Endpoints públicos por diseño

`appointments/availability|month|prices|create|upload|send-receipt`, `shop/products|product|
categories|brands|subcategories|geo|`**`geo-state`**, `reviews/list|google`, `services/list`,
`print-prices`, `oki/chat`, `payments/webhook`.

`shop/geo-state.php` merece mención aparte porque es público **y sale a un tercero** (Nominatim).
Sus salvaguardas: redondeo a ~1 km antes de consultar, caché por celda de 30 días, `zoom=5` y
rechazo de coordenadas fuera de México. Aun así, la caché **no es un limitador de tasa**.

Cada uno tiene sus propios candados: `appointments/upload.php`, por ejemplo, solo acepta
archivos para citas en estado `pendiente`, creadas en las últimas 24 h, con tope por cita y
validando tipo y tamaño.

### 12.4 Anti-SSRF en la descarga de imágenes — `lib/ImagenSegura.php`

Tres controles, con distinto grado de rigidez:

1. **Solo HTTPS** — nunca se relaja.
2. **Lista blanca de dominios** — **se relaja si la eligió una persona**, porque la lista blanca
   protege la *procedencia*, no la seguridad, y alguien que ve la foto ya da esa garantía
   (además puede pegar cualquier imagen con Ctrl+V).
3. **Resolución de IP y rechazo de rangos privados** — **nunca se relaja**. Motivación explícita
   en el código: `http://169.254.169.254/…` filtraría las credenciales de la nube.

Además: **no sigue redirecciones** (una redirección puede saltar fuera de la lista blanca), corta
la descarga por tamaño en vuelo (máx. 8 MB), y valida con `getimagesizefromstring()` sobre el
**contenido real** — ni la extensión ni el `Content-Type` son de fiar. Mínimo 200 px de lado.

**SVG está excluido a propósito: puede traer scripts.**

El `source` de la imagen se deduce del **host real**, no de lo que diga el cliente.

### 12.5 Modo mantenimiento

Dos piezas que **deben mantenerse sincronizadas a mano**:

**`assets/site-guard.js`** — es una **segunda capa** (la primera es nginx). Configuración
hardcodeada:

```
MAINTENANCE_MODE     : false      ← sitio completo cerrado
TIENDA_MANTENIMIENTO : true       ← SOLO la tienda cerrada  (estado actual)
TIENDA_PATHS         : /tienda, /tienda-dinamica, /producto, /categoria
ADMIN_ROLES          : admin, administrador, superadmin, empleado, staff, directivo
TIENDA_ROLES         : (los mismos SIN "empleado", a propósito)
BYPASS_PATHS         : /assets/, /api/, /recuperar.html, /restablecer.html
```

Lo primero que hace es **quitar del DOM** (con `remove()`, no `display:none`) todas las entradas
a la tienda, y monta un `MutationObserver` para cubrir lo que se pinte después (OKi inyecta su
interfaz en 27 páginas). El motivo está escrito: *si dejas los botones a la vista, el cliente los
pulsa, aterriza en mantenimiento y cree que el sitio falla*.

El propio archivo se enmarca correctamente: *"Es un gate de 'aún no abrimos', no un control de
acceso: lo que de verdad protege el admin es la autorización del servidor"*.

**`maintenance.html`** — la pantalla con login de staff integrado. Al conceder acceso escribe
`localStorage.oks_site_access = '1'`.

> ⚠️ **Trampa conocida:** las listas de roles de `site-guard.js` y `maintenance.html` **deben
> coincidir**. Si difieren, se produce un bucle de redirección. Está advertido en ambos archivos.
> Y hay un cuarto archivo, `assets/maintenance.js`, con su propio `MAINTENANCE_MODE`, que **ya no
> lo carga nadie** — ignóralo, o bórralo.

### 12.6 Huecos abiertos

| Severidad | Hueco | Dónde |
|---|---|---|
| 🔴 **Alta** | **Paso D de Cloudflare sin aplicar.** `oki/chat.php` y `lib/Geo.php` leen `X-Forwarded-For` **antes** que `REMOTE_ADDR`. Cloudflare *anexa* la IP real al XFF que mande el cliente → cualquiera puede mandar `X-Forwarded-For: 9.9.9.9` y falsear su identidad para el rate limit del chatbot y para el cálculo de IVA | `oki/chat.php`, `lib/Geo.php` |
| 🔴 **Alta** | **Nginx no declara `error_page`.** Un 404 genérico muestra la página cruda de nginx. El `ErrorDocument` del `.htaccess` **no se lee en producción** | `deploy/nginx-*.conf` |
| 🟠 Media | **La API se sirve sin CSP ni X-Frame-Options.** nginx no hereda `add_header` dentro de un `location` que ya declara uno, y el bloque de `/backend/` declara el suyo | `nginx-parche-backend-sin-varnish.conf` |
| 🟠 Media | **Pasos A y B de Cloudflare no verificables desde el repo.** Si el sitio ya está tras Cloudflare sin `real_ip`, el bloqueo de login por IP es un vector de DoS contra cualquier usuario | vhost en CloudPanel |
| 🟡 Baja | CSP desincronizada entre los tres `.conf`; políticas de caché contradictorias | `deploy/` |

**Lo importante del primero:** si el sitio ya está detrás de Cloudflare y no se aplicó el Paso A,
el problema **no es futuro, está abierto ahora**: todos los usuarios comparten las IPs del CDN,
así que un atacante puede bloquear el login de cualquier persona o el registro de todo el sitio.
Ver §13.4.

---

## 13. Despliegue e infraestructura

### 13.1 Dónde vive

- **VPS Linux con CloudPanel.** Raíz pública: `/home/okstation/htdocs/okstation.mx`
- Usuario del sitio: **`okstation`**
- **No hay staging.** El repositorio se clona directo en la raíz pública y se actualiza con
  `git pull`. No se usa rsync.
- El **vhost real vive en CloudPanel**, no en el repo. Los `.conf` de `deploy/` son plantillas
  y parches para pegar ahí.

### 13.2 Primera instalación — `deploy/deploy.sh`

```bash
bash deploy/deploy.sh
```

1. Aborta si falta `backend/.env`.
2. Copia `config.example.php` → `config.php` si no existe.
3. `php backend/database/migrate.php`.
4. Crea `storage/uploads` y `storage/tickets` con permisos 775.

El procedimiento completo (base de datos, `.env`, HTTPS, headers) está en `deploy/PRODUCCION.md`.
Dos puntos de ese documento que hay que respetar sí o sí:

- **`STORAGE_PATH` debe apuntar fuera de la raíz pública** (`/home/<sitio>/storage`).
- **`fastcgi_param HTTP_AUTHORIZATION $http_authorization;`** tiene que estar en el bloque PHP
  del vhost. Sin esa línea, **todo el JWT responde 401** — login, checkout, panel — *mientras la
  portada sigue cargando perfectamente*. Es el diagnóstico más engañoso de este sistema.

Genera el secreto con:

```bash
php -r "echo bin2hex(random_bytes(48));"
```

### 13.3 Publicación del día a día — `deploy/publicar.sh`

```bash
bash deploy/publicar.sh
```

Cuatro fases:

1. **`git checkout -- '*.html'`** y luego `git pull --ff-only`.
   *(Los HTML del servidor traen el `?v=` reescrito de la publicación anterior y romperían el pull.)*
2. **`php backend/database/migrate.php` — ANTES de servir código nuevo.**
   El comentario documenta el incidente que lo motivó: *"un endpoint que espera una columna que
   aún no existe tira 500 en todos los pedidos (pasó con `contact_email`/0034)"*.
3. **Cache-busting automático:** toma el hash corto del commit y reescribe todos los `?v=` de los
   HTML de la raíz.
4. **Purga de Varnish:** `varnishadm "ban req.http.host ~ okstation.mx"`, con el botón
   *Clear Cache* de CloudPanel como respaldo.

> **Consecuencia operativa a recordar:** en el servidor, `git status` **siempre** muestra los
> `.html` modificados. Es normal. Si vas a hacer un `git pull` manual ahí, corre primero
> `git checkout -- '*.html'`.

### 13.4 Cloudflare — el punto más delicado

`deploy/CLOUDFLARE.md` es el documento más importante de infraestructura del repo. Léelo
completo antes de tocar nada de esto.

**El orden es obligatorio: A → verificar → D + B.** Hacerlo al revés deja el sitio inaccesible
o el rate limit roto.

| Paso | Qué es | Estado |
|---|---|---|
| **A** | Pegar `cloudflare-real-ip.conf` en el vhost (reescribe `REMOTE_ADDR` con la IP real) | ⬜ No verificable desde el repo — el vhost vive en CloudPanel |
| **B** | Firewall nftables: cerrar el origen a todo lo que no sea Cloudflare | ⬜ Pendiente |
| **C** | Managed Transform "Add visitor location headers" en el panel de Cloudflare | ⬜ Pendiente |
| **D** | **Endurecer PHP**: dejar de leer `X-Forwarded-For` en `oki/chat.php` y `lib/Geo.php` | 🔴 **NO aplicado** |

Los artefactos **sí están generados y listos**: `cloudflare-real-ip.conf` (15 rangos IPv4 + 7
IPv6), `cloudflare-ips.txt`, `cloudflare-nft.conf` (ruleset idempotente) y `update-cf-ips.sh`.

**El problema técnico, en una línea:** `real_ip` de nginx reescribe `REMOTE_ADDR` pero **no toca
`X-Forwarded-For`**, y Cloudflare *anexa* la IP real al XFF que mande el cliente. Los siete
puntos que leen `REMOTE_ADDR` se arreglan con el Paso A; los dos que leen `X-Forwarded-For`
necesitan el Paso D.

**Trampas documentadas que ya se pagaron o se anticiparon:**

1. **No cierres el origen con `allow`/`deny` en nginx.** `real_ip` corre en una fase anterior a
   la de control de acceso y ya reescribió la IP a la del visitante final, sin importar dónde
   pongas el bloque. El `allow` de rangos de Cloudflare **nunca coincide** y nginx bloquea a
   **todos**. El filtrado va **siempre en el firewall del sistema**.
2. **`nft -f` solo carga en memoria.** Hay que copiar a `/etc/nftables.conf` y
   `systemctl enable --now nftables`, o un reinicio deja el origen abierto en silencio.
3. **Reversa quirúrgica:** `sudo nft delete table inet cloudflare`.
   **Nunca `nft flush ruleset`** — eso borra fail2ban, Docker y el firewall de CloudPanel.
4. **Un set IPv6 vacío haría que la regla dropee todo IPv6.**
5. **Todos los registros A/AAAA deben estar proxied** (nube naranja). Uno en gris resuelve a la
   IP real y sus visitantes caen al cerrar el origen. Y **no usar "Pause Cloudflare on Site"**
   con el lockdown activo.
6. **SSH (22) no se toca** — el firewall solo filtra 80 y 443.
7. **Deja el puerto 80 abierto** para la validación HTTP-01 de Let's Encrypt, o el certificado
   caduca en silencio.

**`update-cf-ips.sh`** merece mención aparte por su calidad: `mktemp` en el mismo directorio
destino (para que el `mv` sea un rename atómico real), validación de octetos y prefijos
(*"`999.1.1.0/33` parece CIDR y nginx lo rechazaría"*), umbrales de cordura para descartar
páginas de error servidas con 200, diff funcional que ignora el cambio de fecha del encabezado,
y `nginx -t` con reversión desde `.bak` si falla.

Un detalle que fue un bug real: `|| [ -n "$line" ]` en el bucle de lectura, porque **las páginas
de Cloudflare no terminan en salto de línea** y sin eso se perdía el último rango de cada lista.

### 13.5 nginx: reescrituras, headers y bloqueos

**Las URLs limpias existen y viven en el vhost** (bloque `:8080`, **antes** del `location /`):

```nginx
rewrite ^/producto/([0-9]+)(?:-[^/]*)?/?$  /producto.php?id=$1        last;
rewrite ^/categoria/([a-z0-9-]+)/?$        /categoria.php?slug=$1     last;
rewrite ^/producto/?$                      /tienda                    permanent;
rewrite ^/categoria/?$                     /tienda                    permanent;
```

**Headers de seguridad** (todos con `always`):

| Header | Valor |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (2 años) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(self), microphone=(), camera=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

**CSP:** `default-src 'self'`, con excepciones para cdnjs, el SDK de Mercado Pago, Featurable y
Google Fonts. `'unsafe-inline'` en `script-src` es necesario por los JSON-LD y los `<script>`
inline; está documentado como endurecible con hashes o nonce.

**Bloqueos** (`deny all; return 404;`): dotfiles, `backend/.env`, `backend/api/config.php`,
`backend/storage/`, **`backend/(tools|database)/`**, y todo `.md|.sql|.sh|.ps1`.

> **Detalle crítico de orden:** en nginx **gana el primer `location` con regex que empate**, así
> que el bloqueo de `backend/tools/` tiene que ir **ANTES** de `location ~ \.php$`. Si va después,
> no sirve de nada — y sin él, `exel-sync` (reescribe el catálogo), `make-admin` (da rol de
> administrador) y `migrate` quedan ejecutables desde el navegador.

**Verificación rápida:**

```bash
curl -sI https://okstation.mx/producto/49-lo-que-sea | head -1        # espera 200
curl -sI https://okstation.mx/backend/tools/exel-sync.php | head -1   # espera 404
curl -sI https://okstation.mx/perfil | head -1                        # espera 200
```

**El `.htaccess` NO se lee en producción.** Es el espejo para Apache/XAMPP local, y ya causó un
diagnóstico equivocado antes. Está advertido dentro de `nginx-seguridad.conf`.

### 13.6 SEO

- **`robots.txt`** bloquea las páginas privadas **en sus dos formas** (`.html` y URL limpia),
  con la razón escrita: *"una regla que solo diga '.html' no bloquea la URL limpia, que es la que
  se indexa"*. Permite explícitamente `/styles.css` y `/assets/` para que Google pueda renderizar.
  Es además **el único lugar donde se declaran los sitemaps** —`sitemap.xml` no es un índice y
  nginx no los anuncia—, y ahora son **tres**. Al añadir un sitemap nuevo hay que acordarse de
  este archivo: si no se declara aquí, hay que darlo de alta a mano en Search Console.
- **`sitemap-categorias.php`** — el tercero. Emite las URLs `/categoria/<slug>` de **categorías y
  familias**, deduplicadas (un nombre repetido sale una sola vez), con el **mismo
  `ShopProduct::slug()`** que usa el sitio, `lastmod` del `MAX(updated_at)` del grupo y
  `changefreq weekly`. Si la base no responde: `<urlset>` vacío con **HTTP 503**, igual que su
  hermano. Estas URLs no estaban en ninguno de los otros dos.
- **Las fichas agotadas SIGUEN indexadas, a propósito** *(cambio de criterio del 28-jul-2026)*.
  Antes, un producto sin stock se servía con `noindex, follow`. Sale carísimo: Google tarda
  semanas en reindexar y en devolver posición, así que **un faltante de tres días costaba meses de
  ranking**, y mientras tanto quien buscaba el producto por su nombre ya no encontraba la tienda.
  Hoy el `<meta name="robots">` de `producto.php` es un literal sin condición. La verdad se cuenta
  donde Google la lee: `offers.availability = OutOfStock`, que existe justo para esto.
- **`sitemap.xml`** — 17 URLs estáticas, todas limpias (se depuraron las 16 que daban 301).
- **`sitemap-productos.php`** — sitemap dinámico de fichas. Usa `ShopProduct::url()` para que la
  URL sea **exactamente** la del sitio. Si la base no responde, emite un sitemap vacío con
  **HTTP 503** en vez de un 500: *Google lo reintenta y no marca el sitio como roto*.
- **13 landings `*-tijuana.html`** con `<title>` único, meta geo (`MX-BCN`, coordenadas),
  canonical **autorreferente a la URL limpia**, Open Graph completo, y JSON-LD de
  `LocalBusiness` + `Service` + `FAQPage` + `BreadcrumbList` (46+ bloques en el sitio).
- **La debilidad conocida:** el catálogo de `/tienda` se pinta con JavaScript y Google no ve
  enlaces a las fichas. **Mitigación ya implementada:** `categoria.php` renderizado en servidor
  + sitemap dinámico → las páginas descubribles pasaron de **17 a 85+**.

---

## 14. Entorno local

**Laragon** (PHP 8.3.30 + MySQL). Base de datos local: `okstation`.

### Arrancar

```bash
php -S 127.0.0.1:8000 -t .
```

Y abrir **http://localhost:8000**. También está configurado en `.claude/launch.json`.

### Desde cero

1. Laragon → Start All.
2. Crear la base `okstation`.
3. `php backend/database/migrate.php`
4. `php -S 127.0.0.1:8000 -t .`

### Darte rol de administrador

Registrarte solo te deja como cliente. Para entrar al panel:

```sql
INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'TU-CORREO' AND r.slug = 'administrador';
```

O bien: `php backend/database/make-admin.php TU-CORREO`

### Recuperar contraseña en local

No se manda correo, pero en modo desarrollo el endpoint devuelve el enlace en la respuesta:

```bash
curl -X POST http://localhost:8000/backend/api/forgot-password.php \
  -H "Content-Type: application/json" -d "{\"email\":\"TU-CORREO\"}"
```

Abre el `dev_reset_link` que viene en el JSON (vale 1 hora, un solo uso).

### Catálogo de prueba sin API key

```bash
php backend/tools/exel-sync.php --file=backend/tools/sample-exel-feed.json
php backend/tools/icecat-enrich.php
```

Para Icecat basta con poner en el `.env`:

```
ICECAT_USERNAME=openicecat-live
ICECAT_LANG=ES
```

### ⚠️ Los certificados de PHP en Windows — esto falla EN SILENCIO

El PHP de Laragon **no trae el bundle de certificados**, así que cualquier llamada HTTPS desde
PHP falla (Icecat, Exel, Mercado Pago…). Lo engañoso: **el enricher lo reporta como "no está en
Icecat"** cuando en realidad es un error de SSL (`errno 60`).

Arréglalo **una sola vez** en el `php.ini` de Laragon, descomentando estas dos líneas y poniendo
la ruta:

```ini
curl.cainfo = "C:\laragon\etc\ssl\cacert.pem"
openssl.cafile = "C:\laragon\etc\ssl\cacert.pem"
```

Reinicia y comprueba:

```bash
php -r "var_dump(ini_get('curl.cainfo'));"
```

En el servidor Linux esto no pasa: usa los certificados del sistema.

### Notas del entorno local

- `backend/.env`, `backend/api/config.php` y la base local **son tuyos**: git los ignora.
  No chocan con el trabajo de nadie más.
- Pagos en local: **modo sandbox**, sin cargos reales.
- Los correos **no se envían** en local (SMTP vacío a propósito). Es normal.
- Para encender OKi hace falta la llave en el `.env` **y reiniciar el servidor** — el `.env` se
  lee al arrancar. Ver §11.5.

---

## 15. Flujo de trabajo con Git

### Las reglas del proyecto

1. **`main` es producción.** Solo entra por Pull Request.
2. **`desarrollo` es la rama compartida.** Es donde se trabaja.
3. **Nunca subir al servidor sin que te lo pidan explícitamente.**
4. **`git pull` antes de empezar a editar.** Varias personas tocan los mismos archivos.
5. **Analiza el proyecto antes de escribir**: reutiliza lo que ya existe, no dupliques funciones,
   y no rompas el trabajo de los demás.

### El ciclo normal

```bash
git checkout desarrollo
git pull                              # SIEMPRE antes de editar

git checkout -b mi-cambio             # rama nueva para lo que vas a hacer
# … editar …
git add -A
git commit -m "Descripción en español de qué cambió y por qué"

git push -u origin mi-cambio          # y abrir Pull Request en GitHub
```

**Mensajes de commit:** en español, describiendo el efecto, no el archivo. El historial del repo
lo hace bien — mira ejemplos como *"NEXTEP por NOMBRE: rescata los 98 que no traen la clave NE-xxx"*
o *"Las búsquedas de foto van a Google Imágenes, no a DuckDuckGo"*.

### Qué NO se versiona, y por qué

| Ignorado | Motivo |
|---|---|
| `backend/.env`, `backend/api/config.php` | **Secretos.** Nunca al repositorio |
| `*.key`, `*.pem`, `*.p12`, `id_rsa*` | Llaves privadas |
| `backend/storage/uploads/`, `tickets/` | **Datos de clientes** |
| `assets/img/products/` | Imágenes descargadas por el runner: son generadas, no fuente |
| `.claude/`, `.vscode/`, `.idea/` | Configuración local del editor |
| `*.dump`, `*.sql.gz`, `backup_*.sql` | Respaldos. **Las migraciones y `seed.sql` SÍ se versionan: son código fuente** |

**Tres excepciones con historia:**

- **`/vendor/` va anclado con `/`**, no `vendor/` a secas. Sin el ancla también excluía
  `assets/vendor/` (Leaflet autohospedado) y **el mapa daba 404 en producción** porque sus
  archivos nunca entraban al repo.
- **`!backend/api/lib/certs/godaddy-g2.pem`** — la regla `*.pem` es para llaves privadas. Ese
  archivo es un **certificado público** de GoDaddy, y sin él la verificación TLS contra NEXTEP
  falla en producción. Va en el repo a propósito.
- **`serve.ps1` se mantiene a propósito** (servidor de preview local).

### `.gitattributes` — finales de línea

```gitattributes
*.sh                                  text eol=lf
deploy/*.conf                         text eol=lf
backend/api/lib/certs/godaddy-g2.pem  -text
```

**Un `.sh` o un ruleset de nftables con CRLF de Windows NO arranca en Linux** (`bad interpreter`),
y este repo se edita también desde Windows. El `.pem` se marca binario para no corromperlo.

Relacionado: los cron se invocan con **`bash` explícito**, para no depender del bit de ejecución
que Windows y git no preservan.

---

## 16. Operación diaria

### Los cron jobs

| Horario | Script | Qué hace |
|---|---|---|
| `15 2 * * *` | `deploy/actualizar-catalogo.sh` | Sync nocturno completo, **6 pasos**: Exel → Icecat → rescate de imágenes → descarga local → centrado → purga de Varnish |
| `30 8-20/2 * * *` | `deploy/actualizar-precios.sh` | Refresco de precio y stock: **7 corridas en horario hábil** |
| `0 4 * * 0` | `deploy/update-cf-ips.sh` | Regenera los rangos de Cloudflare |
| `0 3 * * *` | `mysqldump … \| gzip` | Respaldo de la base *(propuesto en `PRODUCCION.md`)* |

**Por qué 7 corridas y no 24 — la historia que hay que conocer:** el cron de precios nació como
`30 * * * *` (cada hora, 24 al día). Como `GET /productos` no acepta filtros ni deltas, **cada
corrida bajaba el catálogo completo**. Se agotó la cuota diaria de Exel, la API empezó a
responder `401 "Numero de peticiones diarias excedidas"` y **dejó de actualizarse todo**. Se bajó
a 7. Corre a los `:30` para no encimarse con el sync completo de las `2:15`.

**Los 6 pasos de `actualizar-catalogo.sh`, en orden — cada uno depende del anterior:**

| # | Paso | Tope (variable de entorno, valor por omisión) |
|---|---|---|
| 1 | `exel-sync.php` — catálogo, precios, stock, ofertas e imágenes del proveedor | — |
| 2 | `icecat-enrich.php` — rellena la ficha que Exel no cubre | `ICECAT_TOPE` = 1000 |
| 3 | `rescate-imagenes.php` — tercera pasada de imágenes, coincidencias exactas (§9.5) | `RESCATE_TOPE` = 250 |
| 4 | `download-product-images.php` — copia local de las fotos remotas registradas | `IMG_DOWNLOAD_TOPE` = 500 |
| 5 | `centrar-imagenes.php` — recorta el margen blanco de las ya guardadas | `IMG_CENTER_TOPE` = 500 |
| 6 | Purga de Varnish | — |

Los cuatro topes son **sobreescribibles desde el entorno**, no constantes. El paso 3 filtra hoy
`brand LIKE '%NEXTEP%'`: el comentario del script habla de "fabricantes compatibles" en plural,
pero es una sola marca.

> **El paso 6 no alimenta el contador de fallos.** Si `varnishadm` no existe o falla, imprime un
> aviso pero el script puede terminar en `exit 0`. Solo los pasos 1-5 deciden el código de salida
> que ve el cron.

**`actualizar-catalogo.sh` usa `set -uo pipefail` sin `-e`, a propósito:** si Icecat falla, el
catálogo de Exel ya quedó bien y no hay que abortar. Cierra con un resumen SQL (productos
activos, % con imagen, % con descripción, % con ficha, en oferta) y `exit 1` si hubo fallos,
para que el cron avise.

### Runbooks

**Publicar cambios:**
```bash
cd /home/okstation/htdocs/okstation.mx
bash deploy/publicar.sh
```

**Forzar una actualización de catálogo:**
```bash
php backend/tools/exel-sync.php              # completo
php backend/tools/exel-sync.php --dry-run    # ver qué haría, sin escribir
php backend/tools/exel-sync.php --solo-precios
```

**Auditar que los precios cuadren:**
```bash
php backend/tools/verificar-precios.php      # exit 1 si hay anomalías
```

**`verificar-catalogo.sh` — el chequeo que no gasta cuota**

Responde "¿corrió bien la noche?" **sin tocar la API de Exel**: abre PDO y lee el estado con una
sola consulta sobre `products` (última sincronización, antigüedad en horas, activos, etiquetados
almacén 4, último enriquecimiento, pendientes de Icecat).

**Umbral: 30 horas** (`CATALOGO_MAX_AGE_HOURS` lo cambia). Elegido para no repetir la corrida
antes de las 02:15 y aun así detectar una noche perdida. "Atrasado" incluye el caso **nunca
sincronizado**.

| Código de salida | Significa |
|---|---|
| `0` | Vigente. *No se vuelve a consumir Exel* |
| `2` | Atrasado, en modo solo lectura. Hay que repararlo |
| `1` | Error real, o la fecha **sigue** atrasada después de intentar repararla |

Con `--actualizar-si-atrasado` ejecuta `actualizar-catalogo.sh` y **vuelve a verificar**: no da
por bueno el pipeline por el hecho de que terminara.

> **Todavía no está en ninguna crontab.** El candidato natural es una corrida de mañana
> (p. ej. `0 7 * * *`) con `--actualizar-si-atrasado`, que repara sola una noche perdida antes de
> que abra la tienda. Usa `mapfile`, o sea **bash 4+**: invocarlo con `bash`, nunca con `sh`.

**Ver cómo va el enriquecimiento:**
```bash
php backend/tools/auditar-enriquecimiento.php
php backend/tools/icecat-enrich.php 500      # procesar 500 más
```

**Diagnosticar la instalación** (requiere `SETUP_TOKEN` en el `.env`):
```
https://okstation.mx/backend/api/health.php?key=<SETUP_TOKEN>
```
Reporta extensiones, conexión a la base, tablas faltantes, si se importó el esquema viejo, si el
storage es escribible, y **un análisis detallado de si la IP real está llegando bien detrás de
Cloudflare**. Con `SETUP_TOKEN` vacío responde 403 y queda deshabilitado.

**Purgar Varnish a mano:**
```bash
varnishadm "ban req.http.host ~ okstation.mx"
```

### Diagnóstico rápido de fallas comunes

| Síntoma | Causa probable |
|---|---|
| **Todo el API responde 401, pero la portada carga** | Falta `fastcgi_param HTTP_AUTHORIZATION` en el vhost |
| **Todo el API responde 500** | `JWT_SECRET` vacío o de menos de 32 caracteres |
| **Los pedidos tiran 500 después de publicar** | Faltó correr `migrate.php`. Por eso `publicar.sh` lo hace solo |
| **Icecat dice "no está" para todo, en local** | Certificados de PHP en Windows. Ver §14 |
| **El catálogo se quedó viejo** | Cuota diaria de Exel agotada. Revisa el log del cron |
| **Cambié un CSS y no se ve** | Varnish, o el `?v=`. Corre `publicar.sh` |
| **Bucle de redirección al entrar al sitio** | Las listas de roles de `site-guard.js` y `maintenance.html` no coinciden |
| **OKi contesta "No pude generar una respuesta confiable"** | Falta el bloque `gemini` en `config.php` o la llave en el `.env`. Comprueba si existe `backend/storage/oki_gemini/`: si no, Gemini nunca se ha llamado. Ver §11.5 |
| **OKi responde un dato comercial cuando pediste una explicación** | La IA no pudo y salió el respaldo de reglas. Se distingue por `source: "reglas-respaldo"` en el JSON. Ver §11.1 |
| **"Elige una dirección de envío guardada" al pagar** | Estás en `tienda-dinamica.html`, cuyo checkout no manda `address_id`. Ver §6.6 (c) |
| **Todo pedido con envío responde 503 en local** | Falta `EXEL_API_KEY`: sin llave `ExelEnvios::cotizar()` devuelve `null` sin llamar a la API. En `origin/main` no da 503, cobra tarifa de respaldo. Ver §9.12 |

---

## 17. Estado del proyecto y deuda técnica

### Lo que está terminado y en producción

✅ Citas con wizard, expediente de documentos, disponibilidad real y anticipo
✅ Pedidos de impresión con precios escalonados, ticket PDF y cotización manual
✅ Tienda completa: catálogo real de Exel, carrito, direcciones, IVA por zona, checkout
✅ Pagos con Mercado Pago (Checkout API + Pro), Stripe implementado, sandbox
✅ Panel de administración con 9 vistas y control por rol
✅ Sincronización automática de catálogo y precios por cron
✅ Enriquecimiento de fichas e imágenes en cascada, con panel de asignación manual
✅ OKi con cerebro por reglas y contexto de catálogo en vivo
✅ SEO: 13 landings, schema.org, sitemap dinámico, URLs limpias
✅ Correo transaccional con adjuntos PDF

### Pendientes reales

| Prioridad | Qué falta |
|---|---|
| 🔴 | **Cloudflare Pasos A, B, C y D** (§13.4). El D es código y se puede hacer ya |
| 🔴 | **`error_page` en nginx** — los 404 muestran la página cruda del servidor |
| 🟠 | **Headers de seguridad en `/backend/`** — coordinar con Oscar antes de tocar ese archivo |
| 🟠 | **Configurar el bloque `gemini` en `config.php`** para encender la IA de OKi |
| 🟡 | Subir 8 imágenes faltantes, entre ellas **`assets/img/okstation-logo.webp`**, referenciada en 34 archivos (navbar, drawer, sidebar, ambos generadores de PDF) y que **no existe en el árbol** |
| 🟡 | `defer` en `catalogo.js` — es el único script que bloquea el render (espera OK de Oscar) |
| 🟡 | Minificar `styles.css` (235 KB) y partir el JS inline de `tienda.html` |
| 🟡 | Resolver el filtro por almacén con Exel (§9.9) |

### Deuda técnica conocida

| Qué | Impacto |
|---|---|
| **`styles.css` con ~52 secciones superpuestas** y números repetidos, capas que se pisan con `!important` | Cada cambio de estilo es más caro de lo que debería |
| **Navbar duplicado en ~25 archivos** | Decisión consciente por SEO, pero todo cambio se replica a mano |
| **`ShopCatalog.php` es espejo de `assets/catalogo.js`** | Al cambiar un precio hay que cambiarlo en **ambos** |
| **Migraciones con número duplicado** (0017, 0018) | Funciona por el orden alfabético, pero es frágil |
| **Cuatro archivos con la config de mantenimiento** | Deben sincronizarse a mano o hay bucle de redirección |
| **Código muerto**: `critical.css`, `maintenance.js`, `image-slot.js` (×2), `estructura.txt` | ~100 KB de ruido |
| **5 variables de entorno usadas sin estar en `.env.example`** | `BUSINESS_EMAIL`, `EXEL_CATEGORIAS`, `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID`, `IMG_DOMINIOS_EXTRA` |
| **`MAX_UPLOAD_MB`**: 100 en `config.php` vs 25 en `.env.example` | Ambigüedad |
| **`settings.whatsapp`** difiere entre `0004_seed.sql` y `seed.sql` | Un número está mal |
| **`capacity` se lee pero no se usa** en la reserva de citas | La capacidad efectiva es 1 por hueco |
| **`main` va 9 commits por delante de `desarrollo`** | Producción tiene funciones que la rama de trabajo no. Ver §20 |
| **`tienda-dinamica.html` quedó desincronizada del checkout** | Envío roto (422 al pagar) y un `SHIP_COST = 99` propio en JS que ya no existe en el servidor. §6.6c |
| **Las tarifas de `EnvioRespaldo` están sin confirmar** (149/199/299) | Son estimados puestos por encima del costo observado, no tarifas oficiales. §9.12 |
| **El comentario de cabecera de `shop/create.php` en `main` contradice al código** | Dice que sin cotización no se crea el pedido; 30 líneas abajo cobra la tarifa de respaldo |
| **`RescateImagenes` puede auto-aplicar la foto de otra medida** | La firma de nombre descarta tokens de menos de 2 caracteres: "REGLA 5 CM" y "REGLA 7 CM" son la misma firma. §9.5 |
| **`centrar-imagenes.php` reprocesa una vez las fotos del panel** | El `LIKE` de idempotencia no casa con el nombre que genera el panel; deja un huérfano por foto. §9.5 |
| **`LEEME-local.md` manda poner una llave de Anthropic** que nada lee | Ver §11.6 |

---

## 18. Mapa de los demás documentos

| Documento | Estado | Para qué sirve |
|---|---|---|
| **`DOCUMENTACION-MAESTRA.md`** | ✅ **este archivo** | Entrada al proyecto |
| `deploy/CLOUDFLARE.md` | ✅ **Vigente y crítico** | Léelo entero antes de tocar Cloudflare |
| `deploy/PRODUCCION.md` | ✅ Vigente *(su §8 está caducado: los endpoints `orders/*` ya existen)* | Instalación en el servidor |
| `AUDITORIA-plataforma.md` | ✅ Vigente | Auditoría de SEO, rendimiento, accesibilidad y OWASP, verificada contra código |
| `tienda-checkout-activacion.md` | ✅ Vigente | Los 6 pasos para pasar a cobro real **tocando solo el `.env`** |
| `LEEME-local.md` | 🟡 Vigente **con una trampa** | Entorno local con Laragon. **Su sección "Encender OKi" manda poner una llave de Anthropic que ningún código lee** — ver §11.6 |
| `backend/README-CLOUDPANEL.md` | ✅ Vigente | Notas de la pila del servidor |
| `LEEME-exel.md` | 🟡 Instrucciones válidas, premisa vieja | Su sección de **certificados SSL en Windows** vale oro |
| `PARA-OSCAR-seo.md` | 🟡 Autodeclarado resuelto | Se conserva como registro. Explica el bug de slugs con `iconv` |
| `tienda-ecommerce-roadmap.md` | 🟡 Parcialmente caducado | Las decisiones de negocio de la junta del 2026-07-14 siguen siendo válidas; el estado de las fases no |
| `OKi-tienda-integracion.md` | 🟡 Probablemente caducado | Define el contrato `window.OKtienda`, que **sí sigue vigente** |
| `tienda-backend-plan.md` | 🔴 **Caducado** | Se describe a sí mismo como "aún no construido"; **todo eso ya está en producción** |
| `XAMPP-local.md` | 🔴 **Caducado** | Contradice a `LEEME-local.md` en base de datos y método. Usa el otro |
| `estructura.txt` | 🔴 **Inservible** | Volcado de `tree` en UTF-16, de junio. Sin valor |

---

## 19. Glosario

| Término | Qué es |
|---|---|
| **Alcance** | Qué categorías del proveedor entran a la tienda. Hoy solo "Oficina y Escolar" |
| **Cotizable** (`needs_quote`) | Pedido o cita sin precio automático. El personal lo fija desde el panel y el sistema manda un correo con botón de pago |
| **Deriva de precio** | Diferencia entre lo que el carrito mostró y el precio actual. Más del 3 % → 409 |
| **Enriquecer** | Completar un producto con ficha técnica e imágenes de fuentes externas |
| **Exel** | Exel del Norte, el distribuidor que surte el catálogo |
| **Hueco / slot** | Bloque de 60 minutos en el calendario de citas |
| **Icecat** | Base de datos mundial de fichas de producto |
| **`oknav`** | El navbar unificado |
| **OKi** | El chatbot astronauta |
| **PDP** | *Product Detail Page* — la ficha de producto (`producto.php`) |
| **Runner** | Script CLI de `backend/tools/` que corre por cron, nunca por web |
| **`window.OKtienda`** | El contrato JavaScript que hace que el carrito sea el mismo en toda la web |

---

---

## 20. Divergencia entre `main` y `desarrollo`

**Al 31-jul-2026, `origin/main` va 9 commits por delante de `desarrollo`, y `desarrollo` cero por
delante de `main`.** Es al revés del flujo declarado en §15 (`desarrollo` → PR → `main`): alguien
trabajó directo sobre `main` sin regresar el trabajo a la rama compartida.

```bash
git fetch --all
git rev-list --left-right --count desarrollo...origin/main
#   0       9        ← izquierda: solo en desarrollo · derecha: solo en main
```

**Qué tiene producción que la rama de trabajo no:**

| Commit | Qué añade |
|---|---|
| `6f53e9d` + `8db300b` | **`checkout.html` y `carrito.html`**: el checkout sale de `tienda.html` a páginas propias |
| `18ae39c` | **IVA por código postal**, no por el estado tecleado (§9.3) |
| `59a9ee8` | **`EnvioRespaldo.php`**: tarifa por zona cuando la paquetería no cotiza (§9.12) |
| `fe6f9c4` | `ExelEnvios` registra por qué falla Exel y reintenta los fallos transitorios |
| `382c0e3` | Botón "Reintentar" cuando el envío no se pudo calcular |
| `17317b5` | Arregla el `hidden` de la nota de recoger en modo envío |
| `cb689d3` | Stepper del checkout sin números y clickeable |
| `30e581c` | **`backend/tools/margen.php`**: ajustar el margen del catálogo con respaldo |

Archivos que difieren: `EnvioRespaldo.php` (solo en `main`), `ExelEnvios.php` (164 líneas en
`desarrollo`, 253 en `main`), `Geo.php`, `shop/create.php`, `shop/envio-opciones.php`,
`tienda.html`, `.gitignore`, más los cuatro archivos nuevos.

**Por qué importa, en concreto:**

- Un cambio hecho sobre `desarrollo` que toque envío, IVA o checkout **va a chocar** al fusionar.
- Documentación, pruebas o diagnósticos hechos sobre `desarrollo` **no describen lo que ve el
  cliente**. Este documento marca con *(solo en `origin/main`)* lo que aplica a producción.
- El error de "todo pedido con envío da 503" solo existe en `desarrollo`: en `main` hay tarifa de
  respaldo.

**Lo sano es reconciliar**, y como `desarrollo` no tiene nada propio, es barato:

```bash
git checkout desarrollo
git merge origin/main        # o: git reset --hard origin/main, si nadie tiene trabajo local
git push origin desarrollo
```

> Antes de correr eso, comprueba que nadie del equipo tenga trabajo sin subir sobre `desarrollo`.
> Con `reset --hard` se pierde lo que no esté commiteado.

---

*Documento generado el 2026-07-31 a partir de una lectura completa del código en la rama
`desarrollo` (commit `39e47dd`), y reconciliado contra los 62 commits que habían entrado desde
`c51fdc8`. Si algo aquí ya no es cierto, corrígelo: este archivo solo sirve si se mantiene.*

> **Antes de fiarte de este documento: `git fetch` y compara.** Se escribió una vez sobre una
> foto vieja del repositorio y la mitad de lo que decía sobre envíos, imágenes y OKi ya no era
> cierto. La lección quedó aquí escrita a propósito.

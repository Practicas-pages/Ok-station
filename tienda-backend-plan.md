# Plan: backend de pedidos del e-commerce (tienda)

**Objetivo:** que los pedidos de la **tienda** (productos físicos: papelería/tecnología)
se manejen con el **mismo flujo** que ya usamos para pedidos de impresión y citas:
crear pedido → pagar con **Mercado Pago** → confirmar pago → **correos (Brevo)** →
gestión y avisos desde el **panel admin** (incluido el aviso "listo para recoger" al
correo del cliente).

> Estado: **solo plan** (13-jul-2026). Aún no construido. La tienda (`tienda.html`) sigue
> como maqueta con productos fijos y checkout simulado.

---

## Lo que YA existe y se REUTILIZA (no reinventar)

Nuestro motor de pagos y de correos ya es **genérico** (sirve para "pedidos" y "citas"
con un parámetro `$kind`). Rutas reales:

- **Pagos — `backend/api/lib/Payments.php`** (Mercado Pago vía cURL: crea preferencia de
  Checkout Pro, cobro con tarjeta, **webhook** que confirma consultando el pago real a MP,
  idempotencia y anti-doble-cobro). Se selecciona proveedor con `PAYMENT_PROVIDER`
  (`sandbox`/`mercadopago`). Llaves en `.env`: `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`,
  `MP_WEBHOOK_SECRET`.
- **Correos — `backend/api/lib/Mail.php` + `Brevo.php` + `Emails.php`** (Brevo API con
  adjuntos PDF; plantillas HTML de marca). Es *best-effort*: nunca rompe la petición.
- **Panel admin — `admin.html` + `assets/admin.js`** (SPA). Patrón: cada acción del admin
  (cambiar estado, fijar precio, marcar pagado) **dispara el correo al cliente** desde el
  backend.
- **Auth — `backend/api/lib/authz.php`** (`require_permission('orders.view')`, etc.). Sin
  autoloader: cada endpoint hace `require` manual de `_bootstrap.php` + sus dependencias.

## APIs externas que usa (y usaría la tienda)
- **Mercado Pago** — Checkout Pro (redirección) y/o Checkout API (tarjeta en el sitio) + webhook.
- **Brevo** — envío de correos (confirmaciones, estados, "listo para recoger").

---

## Lo que hay que CREAR

### 1. Base de datos (nueva migración `00XX_shop_orders.sql`)
La tabla `orders` actual es **específica de impresión** (ítems = archivos + config + páginas)
y NO tiene campo tipo. El sistema separa dominios en tablas distintas → creamos las nuestras:

- **`shop_orders`**: `id`, `user_id` (FK→users), `code` (ej. `TDA-2026-000123`),
  `status` ENUM(`recibido`,`en_preparacion`,`listo`,`entregado`,`cancelado`),
  `subtotal`, `tax`, `total` (IVA 8% incluido, desglosado del total como en pedidos),
  `contact_phone`, `comments`, `staff_notes`, `entregado_at`, `created_at`, `updated_at`,
  **+ columnas de pago** iguales a `orders` (`payment_status`, `payment_provider`,
  `payment_reference`, `payment_amount`, `payment_date`, `payment_transaction_id`).
- **`shop_order_items`**: `id`, `shop_order_id` (FK CASCADE), y una **"foto" del producto**
  (`product_sku`, `product_name`, `unit_price`, `qty`, `line_total`). Guardar la foto evita
  depender aún de una tabla de productos (los 12 productos siguen fijos en `tienda.html`).
- **`payment_logs`**: agregar columna `shop_order_id` (FK) — la bitácora ya soporta
  `order_id`/`appointment_id`, añadimos la tercera.

### 2. Motor de pagos — extender `lib/Payments.php`
Agregar un tipo `shop` a `TARGETS` (tabla `shop_orders`, columna de monto `total`, FK
`shop_order_id` en `payment_logs`, ancla de retorno `perfil.html?pago=ok#tienda`). **Toda
la lógica de MP (preferencia, tarjeta, webhook, idempotencia, reconciliación) queda intacta.**
`webhook.php` ya busca la entidad por `payment_reference`; añadir la búsqueda en `shop_orders`.

### 3. Endpoints del cliente — `backend/api/shop/`
- `create.php` (POST) — crea el pedido desde el carrito. **Recalcula el total en el servidor**
  con los precios reales (nunca confía en el monto del cliente). Requiere sesión.
- `list.php` (GET) — pedidos de tienda del usuario (para el perfil).
- `get.php` (GET) — detalle (dueño o staff).
- `cancel.php` (POST) — cancelar propio si aún `recibido`.
- El pago se inicia con el `payments/create.php` **existente**, pasándole `shop_order_id`.

### 4. Correos — extender `lib/Emails.php`
Nuevas plantillas: `tiendaPedidoHtml` (recibido), `tiendaPagoConfirmadoHtml`,
`tiendaListoHtml` ("listo para recoger en OK.station"). Eventos:
| Evento | Correo al cliente |
|---|---|
| Pedido creado | "Recibimos tu pedido" |
| Pago confirmado (webhook/tarjeta/admin) | "Pago confirmado" (desde `Payments::finalize`) |
| Admin lo marca `listo` | **"Listo para recoger en OK.station"** (Gmail + se avisa por WhatsApp) |

### 5. Panel admin — `admin.html` + `assets/admin.js` + `backend/api/admin/`
- `shop-orders.php` (GET, `require_permission('orders.view')`), `shop-order-status.php`
  (POST, cambia estado + correo), `shop-order-payment.php` (POST, marca pagado manual →
  `Payments::finalize(...,'admin')` → correo).
- Vista nueva "Tienda" en el admin con la misma UI que Pedidos (lista, filtros, detalle,
  cambiar estado, marcar pagado). Los montos solo los ven `administrador`/`directivo`.

### 6. Conectar el checkout de la tienda (`tienda.html`)
Hoy el checkout es **simulado**. Cambiarlo para: requerir cuenta (login, como pedidos/citas)
→ `POST /backend/api/shop/create.php` → iniciar pago con `payments/create.php` → redirigir a
Mercado Pago. El carrito ya persiste en `localStorage` (`okstation_cart`).

---

## Decisiones a coordinar con el equipo
1. **Productos**: por ahora fijos en `tienda.html`. Si se quiere administrar stock/precios,
   haría falta una tabla `products` y un CRUD en el admin (fase posterior).
2. **Entrega**: la tienda es **solo recoger** (sin envíos). El flujo ya lo asume.
3. **Quién construye qué**: back (migración + endpoints + pagos + correos) y admin (UI)
   se pueden repartir. Todo respeta el patrón sin autoloader (`require` manual) y la
   resiliencia con `table_has_column()`.

## Orden sugerido para construir
1. Migración `shop_orders`/`shop_order_items` + FK en `payment_logs`.
2. Endpoints `shop/create|list|get|cancel`.
3. `Payments.php` tipo `shop` + `webhook.php`.
4. Plantillas de correo + eventos.
5. Admin (endpoints + vista).
6. Conectar el checkout de `tienda.html`.

# Checkout de la tienda (e-commerce) — IMPLEMENTADO

Los pedidos de la **tienda en línea** ya funcionan igual que los pedidos de impresión y las
citas: crear → pagar con Mercado Pago → webhook confirma → correos (Brevo, al Gmail del
cliente) → gestión desde el panel admin. **Hoy corre en modo `sandbox` local** (sin cobrar de
verdad); al pasar a `main` se activan las licencias reales **solo con el `.env`**, sin tocar código.

## Qué se agregó
- **Migración** `backend/database/migrations/0027_shop_orders.sql`: `shop_orders`, `shop_order_items`,
  `payment_logs.shop_order_id`, permisos `shop.view` / `shop.update_status`.
- **Motor de pagos** reutilizado: `Payments.php` con `$kind='shop'` (mismo webhook, misma bitácora,
  Checkout Pro y Checkout API). Precio autoritativo del servidor en `backend/api/lib/ShopCatalog.php`
  (espejo de `assets/catalogo.js` — al cambiar un precio, cámbialo en AMBOS).
- **Endpoints cliente**: `backend/api/shop/create.php|list.php|get.php|cancel.php`.
- **Endpoints admin**: `backend/api/admin/shop-orders.php|shop-order-status.php|shop-order-payment.php`.
- **Correos** (`Emails.php`): `tiendaPedidoHtml` (recibimos tu compra), `tiendaEstadoHtml`
  (incluye "listo para recoger"), y rama de tienda en `pagoConfirmadoHtml`.
- **Frontend**: checkout real en `tienda.html` (requiere iniciar sesión) → `pago.html?shop=ID`;
  `pago.html` entiende `?shop=`; panel admin con pestaña **Tienda** (`admin.html` + `assets/admin.js`).

## Para pasar a `main` (cobro real) — solo `.env`
1. `PAYMENT_PROVIDER=mercadopago` (activa Checkout API + Checkout Pro a la vez).
2. `MP_ACCESS_TOKEN` y `MP_PUBLIC_KEY` (primero credenciales **TEST** de MP, luego producción).
3. `MP_WEBHOOK_SECRET` (opcional) y registrar la URL del webhook en el panel de MP:
   `https://okstation.mx/backend/api/payments/webhook.php`.
4. `BREVO_API_KEY` + `MAIL_FROM` verificado (para que salgan los correos al Gmail del cliente).
5. `APP_URL` con el dominio real (ya se usa en back_urls / notification_url).
6. Correr `php backend/database/migrate.php` en el servidor (aplica la 0027).

Nada de esto cambia código: es el mismo interruptor que ya usan pedidos y citas.

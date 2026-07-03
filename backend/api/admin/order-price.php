<?php
/**
 * POST /backend/api/admin/order-price.php — la trabajadora fija el PRECIO FINAL
 * de un pedido que estaba "por cotizar" (p. ej. gran formato) y avisa al cliente.
 *
 * Body: { id, total }  — `total` es el precio final que paga el cliente (IVA incluido).
 * Requiere el permiso 'orders.update_status' (mismo que cambiar el estado).
 *
 * Efectos:
 *   1. Recalcula subtotal/IVA a partir del total y los guarda en el pedido.
 *   2. Marca `quoted_at` (la migración 0022 crea la columna; si no existe, se omite).
 *   3. Crea una notificación in-app.
 *   4. Envía un correo al cliente con un botón para pagar en línea (Checkout Pro).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Pricing.php';
only_method('POST');

$user   = require_permission('orders.update_status');
$b      = body();
$id     = (int) ($b['id'] ?? 0);
$amount = round((float) ($b['total'] ?? $b['amount'] ?? 0), 2);

if ($amount <= 0)      fail('Ingresa un precio válido mayor a $0.');
if ($amount > 1000000) fail('El precio es demasiado alto. Revisa la cifra.');

$o = Order::find($id);
if (!$o) fail('Pedido no encontrado.', 404);
if (($o['status'] ?? '') === 'cancelado')                 fail('Este pedido está cancelado y no se puede cotizar.', 409);
if (($o['payment_status'] ?? 'pendiente') === 'pagado')   fail('Este pedido ya está pagado; no se puede cambiar el precio.', 409);

/* El precio capturado es el TOTAL final (IVA incluido). Lo desglosamos para que
   el importe/ticket siga siendo coherente con el resto del sitio. */
$taxRate  = Pricing::taxRate();
$subtotal = $taxRate > 0 ? round($amount / (1 + $taxRate), 2) : $amount;
$tax      = round($amount - $subtotal, 2);

$data = ['subtotal' => $subtotal, 'tax' => $tax, 'total' => $amount];
if (table_has_column('orders', 'quoted_at')) $data['quoted_at'] = date('Y-m-d H:i:s');
Order::update($id, $data);

log_activity((int) $user['id'], 'order.price_set', 'orders', $id, ['total' => $amount]);

/* Notificación in-app. */
db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
    ->execute([
        (int) $o['user_id'], 'order', 'Precio listo',
        'Tu pedido ' . $o['code'] . ' ya tiene precio: $' . number_format($amount, 2) . ' MXN. Ya puedes pagarlo en línea.',
    ]);

/* Correo al cliente con botón de pago (best-effort). */
$emailed = false;
try {
    require_once __DIR__ . '/../lib/Mail.php';
    require_once __DIR__ . '/../lib/Emails.php';
    $cu = User::find((int) $o['user_id']);
    $to = trim((string) ($cu['email'] ?? ''));
    if ($to !== '') {
        global $CONFIG;
        $base = rtrim((string) ($CONFIG['app_url'] ?? 'https://okstation.mx'), '/');
        $html = Emails::pedidoPrecioHtml([
            'name'   => (string) ($cu['full_name'] ?? ''),
            'code'   => (string) $o['code'],
            'total'  => $amount,
            'payUrl' => $base . '/perfil.html#pedidos',
        ]);
        $emailed = Mail::sendHtml(
            $to,
            'Tu pedido ' . $o['code'] . ' ya tiene precio · Ok.station',
            $html,
            'Tu pedido ' . $o['code'] . ' ya tiene precio: $' . number_format($amount, 2) . ' MXN. Entra a okstation.mx para pagarlo en línea.'
        );
    }
} catch (Throwable $e) { /* best-effort: el correo no debe afectar el guardado del precio */ }

respond(['ok' => true, 'total' => $amount, 'subtotal' => $subtotal, 'tax' => $tax, 'emailed' => $emailed]);

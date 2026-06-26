<?php
/** POST /backend/api/orders/create.php — crea un pedido con sus ítems. Requiere sesión.
 *  SEGURIDAD: el precio se recalcula EN EL SERVIDOR; se ignora todo monto del cliente.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Pricing.php';
only_method('POST');

$user  = current_user();
$b     = body();
$items = $b['items'] ?? [];
$comments = trim((string) ($b['comments'] ?? ''));
/* Teléfono del cliente (lo usan las trabajadoras para contactarlo por WhatsApp). */
$phone = trim((string) ($b['contact_phone'] ?? ''));
$phone = preg_replace('/[^\d+()\-\s]/', '', $phone);

if (!is_array($items) || count($items) === 0) fail('El pedido no tiene ítems.');
if (count($items) > 50) fail('Demasiados ítems en un solo pedido (máximo 50).');
if (mb_strlen($comments) > 1000) fail('Los comentarios son demasiado largos.');
if (strlen(preg_replace('/\D/', '', $phone)) < 10) fail('Ingresa un teléfono válido (10 dígitos) para poder contactarte.');

$taxRate  = Pricing::taxRate();
$pdo      = db();
$fileStmt = $pdo->prepare('SELECT id, pages, original_name FROM uploaded_files WHERE id = ? AND user_id = ?');
$mailItems = [];   // resumen de ítems para el ticket del correo

$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO orders (user_id, code, comments, subtotal, tax, total) VALUES (?,?,?,0,0,0)')
        ->execute([(int) $user['id'], 'TMP', $comments !== '' ? $comments : null]);
    $orderId = (int) $pdo->lastInsertId();
    $code = 'OKS-' . date('Y') . '-' . str_pad((string) $orderId, 6, '0', STR_PAD_LEFT);

    $ins = $pdo->prepare(
        'INSERT INTO order_items (order_id, service_id, uploaded_file_id, config_json, qty, unit_price, line_total) VALUES (?,?,?,?,?,?,?)'
    );
    $subtotal = 0.0;
    foreach ($items as $it) {
        $fileId = (int) ($it['uploaded_file_id'] ?? 0);
        $cfg    = is_array($it['config'] ?? null) ? $it['config'] : [];
        $qty    = max(1, (int) ($it['qty'] ?? 1));

        // El archivo DEBE existir y pertenecer al usuario. Las páginas salen de la BD, no del cliente.
        $fileStmt->execute([$fileId, (int) $user['id']]);
        $file = $fileStmt->fetch();
        if (!$file) { $pdo->rollBack(); fail('Archivo no válido en el pedido.', 422); }
        $pages = (int) $file['pages'];

        // PRECIO RECALCULADO EN EL SERVIDOR (se ignora cualquier monto del navegador).
        $price = Pricing::line($cfg, $pages, $qty);
        $subtotal += $price['line'];

        $mailItems[] = [
            'label' => trim((string) ($cfg['size'] ?? '')) !== ''
                ? strtoupper((string) $cfg['size'])
                : mb_substr((string) ($file['original_name'] ?? 'Archivo'), 0, 40),
            'qty'  => $qty,
            'line' => $price['line'],
        ];

        $ins->execute([
            $orderId,
            isset($it['service_id']) ? (int) $it['service_id'] : null,
            $fileId,
            json_encode($cfg, JSON_UNESCAPED_UNICODE),
            $qty, $price['unit'], $price['line'],
        ]);
    }

    $subtotal = round($subtotal, 2);
    $tax      = round($subtotal * $taxRate, 2);
    $total    = round($subtotal + $tax, 2);
    $pdo->prepare('UPDATE orders SET code=?, subtotal=?, tax=?, total=? WHERE id=?')
        ->execute([$code, $subtotal, $tax, $total, $orderId]);

    /* Teléfono del cliente: solo si la migración 0012 ya creó la columna (resiliente). */
    if ($phone !== '' && table_has_column('orders', 'contact_phone')) {
        $pdo->prepare('UPDATE orders SET contact_phone=? WHERE id=?')->execute([$phone, $orderId]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el pedido.', 500);
}

log_activity((int) $user['id'], 'order.create', 'orders', $orderId);
db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
    ->execute([(int) $user['id'], 'order', 'Pedido recibido', 'Tu pedido ' . $code . ' fue recibido.']);

/* Token de confirmación: el cliente confirma su pedido desde el correo (enlace con
   token). Solo si la migración 0017 ya creó la columna (resiliente). */
$confirmToken = null;
if (table_has_column('orders', 'confirm_token')) {
    try {
        require_once __DIR__ . '/../lib/Emails.php';
        $confirmToken = Emails::token();
        db()->prepare('UPDATE orders SET confirm_token = ? WHERE id = ?')->execute([$confirmToken, $orderId]);
    } catch (Throwable $e) { $confirmToken = null; }
}

/* Correo de confirmación al usuario (best-effort: si el SMTP falla, no afecta el pedido). */
if (!empty($user['email'])) {
    try {
        require_once __DIR__ . '/../lib/Mailer.php';
        require_once __DIR__ . '/../lib/Emails.php';
        $clientName = (string) ($user['full_name'] ?? '');
        $mailer = new Mailer($CONFIG['smtp'] ?? []);

        if ($confirmToken) {
            /* Correo HTML con el ticket y el botón "Confirmar mi pedido". */
            $html = Emails::pedidoHtml([
                'name' => $clientName, 'code' => $code, 'items' => $mailItems,
                'subtotal' => $subtotal, 'tax' => $tax, 'total' => $total,
                'confirmUrl' => Emails::confirmUrl('pedido', $code, $confirmToken),
            ]);
            $mailer->sendHtml($user['email'], 'Confirma tu pedido en OK.station — ' . $code, $html);
        } else {
            /* Respaldo en texto plano (si la migración 0017 aún no se ha aplicado). */
            $mailBody =
                "Hola " . $clientName . ",\n\nRecibimos tu pedido de impresión en OK.station.\n\n" .
                "Folio: $code\nSubtotal estimado: $" . number_format($subtotal, 2) . " MXN\n" .
                "IVA estimado: $" . number_format($tax, 2) . " MXN\nTotal estimado: $" . number_format($total, 2) . " MXN\n\n" .
                "El total es un estimado; confirmamos el precio final al revisar tus archivos.\n\n" .
                "Gracias,\nOK.station · Centro Comercial Otay, Tijuana\nokstation.mx";
            $mailer->send($user['email'], 'Tu pedido en OK.station — ' . $code, $mailBody);
        }
    } catch (Throwable $e) { /* correo best-effort */ }
}

$order = Order::find($orderId);
$order['items'] = Order::items($orderId);
respond(['ok' => true, 'order' => $order], 201);

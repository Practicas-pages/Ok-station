<?php
/**
 * OK.station — Capa de pagos (proveedor configurable, sin dependencias externas).
 *
 * Centraliza toda la lógica financiera del pedido para que los endpoints sean
 * delgados y el ESTADO DE PAGO se decida SIEMPRE en el servidor:
 *   - El monto se toma de `orders.total` (nunca del navegador).
 *   - El estado lo fija el proveedor (webhook) o la confirmación de sandbox.
 *   - Cada cambio queda en `payment_logs` (auditoría con updated_by).
 *
 * Proveedores soportados (env PAYMENT_PROVIDER):
 *   - 'sandbox' (por defecto): checkout local en pago.html, confirmación
 *     autenticada del propio dueño. Ideal para demo/desarrollo sin pasarela.
 *   - 'stripe': crea una Checkout Session real vía API y confirma por webhook
 *     firmado. Requiere STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET en .env.
 *
 * Requiere _bootstrap.php (db, $CONFIG) y Model.php (Order).
 */
require_once __DIR__ . '/Model.php';

final class Payments
{
    /* Estados válidos del pago (espejo del ENUM de la BD). */
    const STATUSES = ['pendiente', 'procesando', 'pagado', 'error', 'reembolsado'];

    public static function provider(): string
    {
        global $CONFIG;
        $p = strtolower((string) ($CONFIG['payment']['provider'] ?? 'sandbox'));
        return in_array($p, ['sandbox', 'stripe'], true) ? $p : 'sandbox';
    }

    public static function isSandbox(): bool
    {
        return self::provider() === 'sandbox';
    }

    public static function currency(): string
    {
        global $CONFIG;
        return strtoupper((string) ($CONFIG['payment']['currency'] ?? 'MXN'));
    }

    /** Referencia interna única y estable por intento (legible en el panel). */
    public static function makeReference(array $order): string
    {
        return 'PAY-' . strtoupper((string) $order['code']) . '-' . substr(bin2hex(random_bytes(4)), 0, 6);
    }

    /**
     * Crea (o reabre) una sesión de checkout para un pedido.
     * Devuelve ['ok'=>true,'checkout_url'=>..,'reference'=>..,'provider'=>..,'transaction_id'=>..]
     * El monto se toma del pedido en la BD; el cliente NO puede alterarlo.
     */
    public static function createSession(array $order, array $user): array
    {
        global $CONFIG;
        $amount    = round((float) $order['total'], 2);
        $reference = self::makeReference($order);
        $provider  = self::provider();

        if ($provider === 'stripe') {
            $session = self::stripeCreateSession($order, $user, $amount, $reference);
            return [
                'ok'             => true,
                'provider'       => 'stripe',
                'reference'      => $reference,
                'checkout_url'   => $session['url'],
                'transaction_id' => $session['id'],
                'amount'         => $amount,
            ];
        }

        // ── Sandbox: checkout alojado localmente (pago.html). URL relativa para
        //    funcionar en cualquier entorno (local, staging, producción). ──
        $url = 'pago.html?ref=' . rawurlencode($reference) . '&order=' . (int) $order['id'];
        return [
            'ok'             => true,
            'provider'       => 'sandbox',
            'reference'      => $reference,
            'checkout_url'   => $url,
            'transaction_id' => null,
            'amount'         => $amount,
        ];
    }

    /**
     * Marca un pedido como en proceso de pago y registra el intento.
     * Idempotente respecto a 'pagado': no reabre un pedido ya pagado.
     */
    public static function startIntent(array $order, array $session, int $userId, string $source = 'cliente'): void
    {
        $orderId = (int) $order['id'];
        $prev    = (string) ($order['payment_status'] ?? 'pendiente');
        Order::update($orderId, [
            'payment_status'         => 'procesando',
            'payment_provider'       => $session['provider'],
            'payment_reference'      => $session['reference'],
            'payment_amount'         => $session['amount'],
            'payment_transaction_id' => $session['transaction_id'],
        ]);
        self::log($orderId, $prev, 'procesando', $session['provider'], $session['reference'],
            $session['transaction_id'], $session['amount'], $source, $userId);
    }

    /**
     * Finaliza el pago de un pedido (llamado por webhook o confirmación sandbox).
     * El estado y el monto son los del SERVIDOR; ignora cualquier dato del cliente.
     * Idempotente: si ya está 'pagado', no hace nada y devuelve true.
     */
    public static function finalize(int $orderId, string $newStatus, ?string $transactionId, string $source, ?int $userId): bool
    {
        if (!in_array($newStatus, self::STATUSES, true)) return false;

        $pdo = db();
        $pdo->beginTransaction();
        try {
            // Bloqueo de fila para evitar condiciones de carrera (doble confirmación).
            $st = $pdo->prepare('SELECT * FROM orders WHERE id = ? FOR UPDATE');
            $st->execute([$orderId]);
            $order = $st->fetch();
            if (!$order) { $pdo->rollBack(); return false; }

            $prev = (string) ($order['payment_status'] ?? 'pendiente');
            if ($prev === 'pagado') { $pdo->commit(); return true; } // ya finalizado: idempotente

            $data = [
                'payment_status'         => $newStatus,
                'payment_transaction_id' => $transactionId ?: $order['payment_transaction_id'],
            ];
            if ($newStatus === 'pagado') {
                $data['payment_date']   = date('Y-m-d H:i:s');
                $data['payment_amount'] = round((float) $order['total'], 2);
            }
            $set = []; $params = [];
            foreach ($data as $k => $v) { $set[] = "$k = ?"; $params[] = $v; }
            $params[] = $orderId;
            $pdo->prepare('UPDATE orders SET ' . implode(',', $set) . ' WHERE id = ?')->execute($params);

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            return false;
        }

        self::log($orderId, $prev ?? null, $newStatus, (string) ($order['payment_provider'] ?? self::provider()),
            (string) ($order['payment_reference'] ?? ''), $transactionId, round((float) $order['total'], 2), $source, $userId);

        // Notificación al cliente cuando el pago se confirma.
        if ($newStatus === 'pagado') {
            try {
                db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
                    ->execute([(int) $order['user_id'], 'payment', 'Pago confirmado',
                        'Recibimos el pago de tu pedido ' . $order['code'] . '. ¡Gracias!']);
            } catch (Throwable $e) { /* best-effort */ }
        }
        return true;
    }

    /** Inserta una entrada en la bitácora de pagos (nunca rompe la petición). */
    public static function log(int $orderId, ?string $prev, string $status, ?string $provider, ?string $reference,
                              ?string $txnId, ?float $amount, string $source, ?int $userId, array $meta = []): void
    {
        try {
            db()->prepare(
                'INSERT INTO payment_logs
                 (order_id, previous_status, payment_status, provider, reference, transaction_id, amount, source, updated_by, meta_json, ip)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            )->execute([
                $orderId, $prev, $status, $provider, $reference, $txnId, $amount, $source, $userId,
                $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
        } catch (Throwable $e) { /* la auditoría no debe afectar la respuesta */ }
    }

    /** Historial de pagos de un pedido (para el detalle administrativo). */
    public static function logsFor(int $orderId): array
    {
        $st = db()->prepare('SELECT previous_status, payment_status, provider, reference, transaction_id, amount, source, created_at
                             FROM payment_logs WHERE order_id = ? ORDER BY id DESC');
        $st->execute([$orderId]);
        return $st->fetchAll();
    }

    /* ============================================================
       Proveedor Stripe (Checkout Session vía API REST con cURL).
       ============================================================ */
    private static function stripeCreateSession(array $order, array $user, float $amount, string $reference): array
    {
        global $CONFIG;
        $secret  = (string) ($CONFIG['payment']['stripe_secret'] ?? '');
        if ($secret === '') {
            throw new RuntimeException('Stripe no está configurado (falta STRIPE_SECRET_KEY).');
        }
        $base = rtrim((string) ($CONFIG['app_url'] ?? ''), '/');
        $params = [
            'mode'                                 => 'payment',
            'client_reference_id'                  => $reference,
            'success_url'                          => $base . '/perfil.html?pago=ok#pedidos',
            'cancel_url'                           => $base . '/perfil.html?pago=cancelado#pedidos',
            'customer_email'                       => $user['email'] ?? null,
            'metadata[order_id]'                   => (int) $order['id'],
            'metadata[reference]'                  => $reference,
            'line_items[0][quantity]'             => 1,
            'line_items[0][price_data][currency]' => strtolower(self::currency()),
            'line_items[0][price_data][unit_amount]'         => (int) round($amount * 100),
            'line_items[0][price_data][product_data][name]'  => 'Pedido ' . $order['code'] . ' — OK.station',
        ];
        $params = array_filter($params, function ($v) { return $v !== null && $v !== ''; });

        $ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($params),
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $secret],
            CURLOPT_TIMEOUT        => 20,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode((string) $res, true);
        if ($code >= 300 || !isset($json['url'], $json['id'])) {
            throw new RuntimeException('No se pudo crear la sesión de Stripe.');
        }
        return ['url' => (string) $json['url'], 'id' => (string) $json['id']];
    }

    /**
     * Verifica y normaliza un evento de webhook del proveedor.
     * Devuelve ['order_ref'=>, 'transaction_id'=>, 'status'=>] o null si no es válido.
     */
    public static function verifyWebhook(string $rawBody, array $headers): ?array
    {
        global $CONFIG;
        if (self::provider() === 'stripe') {
            $secret = (string) ($CONFIG['payment']['stripe_webhook_secret'] ?? '');
            $sig    = $headers['Stripe-Signature'] ?? ($headers['stripe-signature'] ?? '');
            if ($secret === '' || !self::stripeVerifySignature($rawBody, (string) $sig, $secret)) return null;

            $event = json_decode($rawBody, true);
            $type  = $event['type'] ?? '';
            $obj   = $event['data']['object'] ?? [];
            if ($type === 'checkout.session.completed' || $type === 'checkout.session.async_payment_succeeded') {
                return [
                    'order_ref'      => (string) ($obj['client_reference_id'] ?? ($obj['metadata']['reference'] ?? '')),
                    'transaction_id' => (string) ($obj['payment_intent'] ?? $obj['id'] ?? ''),
                    'status'         => 'pagado',
                ];
            }
            if ($type === 'checkout.session.async_payment_failed' || $type === 'checkout.session.expired') {
                return [
                    'order_ref'      => (string) ($obj['client_reference_id'] ?? ($obj['metadata']['reference'] ?? '')),
                    'transaction_id' => (string) ($obj['id'] ?? ''),
                    'status'         => 'error',
                ];
            }
            return null;
        }

        // ── Sandbox: webhook protegido por secreto compartido simple. ──
        $secret = (string) ($CONFIG['payment']['sandbox_secret'] ?? '');
        $given  = $headers['X-Webhook-Secret'] ?? ($headers['x-webhook-secret'] ?? '');
        if ($secret === '' || !hash_equals($secret, (string) $given)) return null;
        $event = json_decode($rawBody, true);
        if (!is_array($event) || empty($event['reference'])) return null;
        return [
            'order_ref'      => (string) $event['reference'],
            'transaction_id' => (string) ($event['transaction_id'] ?? ('SBX-' . substr(bin2hex(random_bytes(6)), 0, 12))),
            'status'         => in_array(($event['status'] ?? ''), self::STATUSES, true) ? (string) $event['status'] : 'pagado',
        ];
    }

    /** Verificación de firma de Stripe (HMAC SHA256 con tolerancia de 5 min). */
    private static function stripeVerifySignature(string $payload, string $sigHeader, string $secret): bool
    {
        $parts = [];
        foreach (explode(',', $sigHeader) as $p) {
            $kv = explode('=', trim($p), 2);
            if (count($kv) === 2) $parts[$kv[0]][] = $kv[1];
        }
        $t = $parts['t'][0] ?? null;
        $v1 = $parts['v1'] ?? [];
        if (!$t || !$v1) return false;
        if (abs(time() - (int) $t) > 300) return false;
        $expected = hash_hmac('sha256', $t . '.' . $payload, $secret);
        foreach ($v1 as $candidate) {
            if (hash_equals($expected, $candidate)) return true;
        }
        return false;
    }
}

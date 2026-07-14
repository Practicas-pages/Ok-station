<?php
/**
 * Ok.station — Capa de pagos (proveedor configurable, sin dependencias externas).
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

    /* Entidades cobrables. El motor sirve por igual pedidos y citas (anticipo).
       Cada una declara su tabla, la columna del monto, la FK en payment_logs y el
       ancla de retorno en perfil.html. Los nombres son INTERNOS (no vienen del
       cliente), así que es seguro interpolarlos en SQL. */
    const TARGETS = [
        'order'       => ['table' => 'orders',       'amount' => 'total',        'fk' => 'order_id',       'hash' => 'pedidos', 'noun' => 'pedido'],
        'appointment' => ['table' => 'appointments', 'amount' => 'amount_total', 'fk' => 'appointment_id', 'hash' => 'citas',   'noun' => 'cita'],
        'shop'        => ['table' => 'shop_orders',  'amount' => 'total',        'fk' => 'shop_order_id',  'hash' => 'tienda',  'noun' => 'compra'],
    ];

    private static function target(string $kind): array
    {
        return self::TARGETS[$kind] ?? self::TARGETS['order'];
    }

    public static function provider(): string
    {
        global $CONFIG;
        $p = strtolower((string) ($CONFIG['payment']['provider'] ?? 'sandbox'));
        return in_array($p, ['sandbox', 'stripe', 'mercadopago'], true) ? $p : 'sandbox';
    }

    /** Public Key de Mercado Pago (segura de exponer al navegador; el front la usa para tokenizar). */
    public static function mpPublicKey(): string
    {
        global $CONFIG;
        return (string) ($CONFIG['payment']['mp_public_key'] ?? '');
    }

    /** Mapea el estado de un pago de Mercado Pago a nuestro ENUM interno. */
    public static function mpMapStatus(string $mpStatus): string
    {
        $map = [
            'approved'     => 'pagado',
            'authorized'   => 'procesando',  // autorizado pero NO capturado aún: no es un cobro firme

            'refunded'     => 'reembolsado',
            'charged_back' => 'reembolsado',
            'rejected'     => 'error',
            'cancelled'    => 'error',
            'in_process'   => 'procesando',
            'pending'      => 'procesando',
        ];
        return $map[$mpStatus] ?? 'procesando';
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

    /** Referencia interna ESTABLE por entidad (legible en el panel).
     *  Sin sufijo aleatorio a propósito: así, tras un intento cuyo resultado se perdió
     *  (p. ej. timeout tras el cargo), la reconciliación puede buscar en Mercado Pago por
     *  este mismo external_reference y NO cobrar dos veces. El código de pedido/cita ya es
     *  único (OKS-… vs CITA-…), así que la referencia también lo es. */
    public static function makeReference(array $order): string
    {
        return 'PAY-' . strtoupper((string) $order['code']);
    }

    /**
     * Crea (o reabre) una sesión de checkout para un pedido o una cita.
     * Devuelve ['ok'=>true,'checkout_url'=>..,'reference'=>..,'provider'=>..,'transaction_id'=>..]
     * El monto se toma de la BD (orders.total / appointments.amount_total); el cliente NO lo altera.
     */
    public static function createSession(array $entity, array $user, string $kind = 'order', string $mode = 'api'): array
    {
        $t         = self::target($kind);
        $amount    = round((float) ($entity[$t['amount']] ?? 0), 2);
        $reference = self::makeReference($entity);
        $provider  = self::provider();
        $param     = ['appointment' => 'appt', 'shop' => 'shop'][$kind] ?? 'order';
        $payPage   = 'pago.html?ref=' . rawurlencode($reference) . '&' . $param . '=' . (int) $entity['id'];

        if ($provider === 'mercadopago') {
            // mode=pro → Checkout Pro: crea la preferencia y redirige al init_point de MP.
            // mode=api (por defecto) → Checkout API: el cobro se hace en pago.html con el
            //   Brick de tarjeta (tokeniza contra MP) y se confirma en payments/process.php.
            //   Aquí NO se crea preferencia; solo se prepara la intención.
            if ($mode === 'pro') {
                $session = self::mpCreatePreference($entity, $user, $amount, $reference, $kind);
                return [
                    'ok'             => true,
                    'provider'       => 'mercadopago',
                    'mode'           => 'pro',
                    'reference'      => $reference,
                    'checkout_url'   => $session['url'],
                    'transaction_id' => $session['id'],
                    'amount'         => $amount,
                ];
            }
            return [
                'ok'             => true,
                'provider'       => 'mercadopago',
                'mode'           => 'api',
                'reference'      => $reference,
                'checkout_url'   => $payPage,
                'public_key'     => self::mpPublicKey(),
                'transaction_id' => null,
                'amount'         => $amount,
            ];
        }

        if ($provider === 'stripe') {
            $session = self::stripeCreateSession($entity, $user, $amount, $reference, $kind);
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
        //    funcionar en cualquier entorno (local, staging, producción). El
        //    parámetro (order|appt) le dice a pago.html qué entidad cobrar. ──
        $url = $payPage;
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
    public static function startIntent(array $entity, array $session, int $userId, string $source = 'cliente', string $kind = 'order'): void
    {
        $t   = self::target($kind);
        $id  = (int) $entity['id'];
        $prev = (string) ($entity['payment_status'] ?? 'pendiente');
        db()->prepare(
            'UPDATE ' . $t['table'] . '
                SET payment_status = ?, payment_provider = ?, payment_reference = ?,
                    payment_amount = ?, payment_transaction_id = ?
              WHERE id = ?'
        )->execute([
            'procesando', $session['provider'], $session['reference'],
            $session['amount'], $session['transaction_id'], $id,
        ]);
        self::log($id, $prev, 'procesando', $session['provider'], $session['reference'],
            $session['transaction_id'], $session['amount'], $source, $userId, [], $kind);
    }

    /**
     * ¿Hay un pago en curso RECIENTE (Checkout Pro redirigido, o tarjeta en 3DS) con una
     * transacción/preferencia REAL de Mercado Pago sobre esta entidad? Se usa para NO abrir
     * una segunda intención de cobro sobre la misma entidad (anti doble cobro entre métodos).
     * Tras $within segundos el intento se considera abandonado y se permite reintentar, para
     * no dejar varado a un cliente. Solo cuenta si ya existe un transaction_id (una preferencia
     * de Checkout Pro o un pago de tarjeta iniciado); el 'procesando' optimista que fija
     * create.php al abrir la página (sin transaction_id) NO bloquea.
     */
    public static function hasRecentInFlight(array $entity, string $kind, int $within = 1200): bool
    {
        if (($entity['payment_status'] ?? '') !== 'procesando') return false;
        if (empty($entity['payment_transaction_id']))          return false;
        $fk = self::target($kind)['fk'];
        try {
            $st = db()->prepare('SELECT created_at FROM payment_logs WHERE ' . $fk . ' = ? ORDER BY id DESC LIMIT 1');
            $st->execute([(int) $entity['id']]);
            $last = $st->fetchColumn();
        } catch (Throwable $e) { return false; }
        if (!$last) return false;
        return (time() - strtotime((string) $last)) < $within;
    }

    /**
     * Finaliza el pago de un pedido (llamado por webhook o confirmación sandbox).
     * El estado y el monto son los del SERVIDOR; ignora cualquier dato del cliente.
     * Idempotente: si ya está 'pagado', no hace nada y devuelve true.
     */
    public static function finalize(int $entityId, string $newStatus, ?string $transactionId, string $source, ?int $userId, string $kind = 'order'): bool
    {
        if (!in_array($newStatus, self::STATUSES, true)) return false;

        $t         = self::target($kind);
        $table     = $t['table'];
        $amountCol = $t['amount'];

        $pdo = db();
        $pdo->beginTransaction();
        try {
            // Bloqueo de fila para evitar condiciones de carrera (doble confirmación).
            $st = $pdo->prepare('SELECT * FROM ' . $table . ' WHERE id = ? FOR UPDATE');
            $st->execute([$entityId]);
            $row = $st->fetch();
            if (!$row) { $pdo->rollBack(); return false; }

            $prev = (string) ($row['payment_status'] ?? 'pendiente');
            // Máquina de estados: idempotente y SIN retrocesos por webhooks fuera de orden.
            //  · Misma transición repetida (webhook duplicado) → no hace nada.
            //  · 'reembolsado' es TERMINAL: una notificación tardía no lo reabre.
            //  · Un pago 'pagado' solo puede avanzar a 'reembolsado' (reembolso/contracargo);
            //    nunca retrocede a procesando/error/pendiente por una notificación tardía.
            if ($prev === $newStatus)    { $pdo->commit(); return true; }
            if ($prev === 'reembolsado') { $pdo->commit(); return true; }
            if ($prev === 'pagado' && $newStatus !== 'reembolsado') { $pdo->commit(); return true; }

            $data = [
                'payment_status'         => $newStatus,
                'payment_transaction_id' => $transactionId ?: $row['payment_transaction_id'],
            ];
            if ($newStatus === 'pagado') {
                $data['payment_date'] = date('Y-m-d H:i:s');
                // Congela el importe REALMENTE cobrado (el de la intención, guardado en
                // startIntent), no el total actual de la entidad: si el total cambió entre
                // el inicio del pago y su confirmación, registra lo que de verdad se cobró.
                $frozen = round((float) ($row['payment_amount'] ?? 0), 2);
                $data['payment_amount'] = $frozen > 0 ? $frozen : round((float) $row[$amountCol], 2);
            }
            $set = []; $params = [];
            foreach ($data as $k => $v) { $set[] = "$k = ?"; $params[] = $v; }
            $params[] = $entityId;
            $pdo->prepare('UPDATE ' . $table . ' SET ' . implode(',', $set) . ' WHERE id = ?')->execute($params);

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            return false;
        }

        self::log($entityId, $prev ?? null, $newStatus, (string) ($row['payment_provider'] ?? self::provider()),
            (string) ($row['payment_reference'] ?? ''), $transactionId, round((float) $row[$amountCol], 2), $source, $userId, [], $kind);

        // Aviso al cliente cuando el pago se confirma. El CORREO es el canal principal
        // (el cliente no siempre está viendo el sitio); además, notificación in-app si
        // tiene cuenta. Cubre TODOS los caminos que llaman a finalize: webhook de
        // Mercado Pago, cobro con tarjeta (process.php), sandbox y la confirmación
        // manual del trabajador desde el panel.
        if ($newStatus === 'pagado') {
            $isAppt = ($kind === 'appointment');
            if ((int) ($row['user_id'] ?? 0) > 0) {
                try {
                    $title = $isAppt ? 'Pago de cita recibido' : 'Pago confirmado';
                    $body  = 'Recibimos el pago de ' . ($isAppt ? 'tu cita ' : 'tu pedido ') . $row['code'] . '. ¡Gracias!';
                    db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
                        ->execute([(int) $row['user_id'], ($isAppt ? 'appointment' : 'payment'), $title, $body]);
                } catch (Throwable $e) { /* best-effort */ }
            }
            try {
                require_once __DIR__ . '/Mail.php';
                require_once __DIR__ . '/Emails.php';
                $to = ''; $name = (string) ($row['contact_name'] ?? '');
                if ((int) ($row['user_id'] ?? 0) > 0) {
                    $cu = User::find((int) $row['user_id']);
                    if ($cu) { $to = (string) ($cu['email'] ?? ''); if ($name === '') $name = (string) ($cu['full_name'] ?? ''); }
                }
                if ($to === '') $to = trim((string) ($row['contact_email'] ?? ''));   // cita de invitado
                if ($to !== '') {
                    $html = Emails::pagoConfirmadoHtml([
                        'kind'   => $kind,
                        'name'   => $name,
                        'code'   => (string) $row['code'],
                        'amount' => round((float) ($row[$amountCol] ?? 0), 2),
                    ]);
                    Mail::sendHtml(
                        $to,
                        'Pago confirmado · ' . $row['code'] . ' · Ok.station',
                        $html,
                        'Confirmamos el pago de ' . ($isAppt ? 'tu cita ' : 'tu pedido ') . $row['code'] . '. ¡Gracias!'
                    );
                }
            } catch (Throwable $e) { /* best-effort: el correo no debe afectar la confirmación */ }
        }
        return true;
    }

    /** Inserta una entrada en la bitácora de pagos (nunca rompe la petición). */
    public static function log(int $entityId, ?string $prev, string $status, ?string $provider, ?string $reference,
                              ?string $txnId, ?float $amount, string $source, ?int $userId, array $meta = [], string $kind = 'order'): void
    {
        $orderId = ($kind === 'order')       ? $entityId : null;
        $apptId  = ($kind === 'appointment') ? $entityId : null;
        $shopId  = ($kind === 'shop')        ? $entityId : null;
        try {
            db()->prepare(
                'INSERT INTO payment_logs
                 (order_id, appointment_id, shop_order_id, previous_status, payment_status, provider, reference, transaction_id, amount, source, updated_by, meta_json, ip)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
            )->execute([
                $orderId, $apptId, $shopId, $prev, $status, $provider, $reference, $txnId, $amount, $source, $userId,
                $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
        } catch (Throwable $e) { /* la auditoría no debe afectar la respuesta */ }
    }

    /** Historial de pagos de un pedido o cita (para el detalle administrativo). */
    public static function logsFor(int $entityId, string $kind = 'order'): array
    {
        $col = self::target($kind)['fk'];
        $st  = db()->prepare('SELECT previous_status, payment_status, provider, reference, transaction_id, amount, source, created_at
                              FROM payment_logs WHERE ' . $col . ' = ? ORDER BY id DESC');
        $st->execute([$entityId]);
        return $st->fetchAll();
    }

    /* ============================================================
       Proveedor Stripe (Checkout Session vía API REST con cURL).
       ============================================================ */
    private static function stripeCreateSession(array $entity, array $user, float $amount, string $reference, string $kind = 'order'): array
    {
        global $CONFIG;
        $secret  = (string) ($CONFIG['payment']['stripe_secret'] ?? '');
        if ($secret === '') {
            throw new RuntimeException('Stripe no está configurado (falta STRIPE_SECRET_KEY).');
        }
        $t       = self::target($kind);
        $isAppt  = ($kind === 'appointment');
        $base    = rtrim((string) ($CONFIG['app_url'] ?? ''), '/');
        $prodName = ($isAppt ? 'Cita ' : 'Pedido ') . $entity['code'] . ' — Ok.station';
        $params = [
            'mode'                                 => 'payment',
            'client_reference_id'                  => $reference,
            'success_url'                          => $base . '/perfil.html?pago=ok#' . $t['hash'],
            'cancel_url'                           => $base . '/perfil.html?pago=cancelado#' . $t['hash'],
            'customer_email'                       => $user['email'] ?? null,
            'metadata[' . $t['fk'] . ']'           => (int) $entity['id'],
            'metadata[kind]'                       => $kind,
            'metadata[reference]'                  => $reference,
            'line_items[0][quantity]'             => 1,
            'line_items[0][price_data][currency]' => strtolower(self::currency()),
            'line_items[0][price_data][unit_amount]'         => (int) round($amount * 100),
            'line_items[0][price_data][product_data][name]'  => $prodName,
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

    /* ============================================================
       Proveedor Mercado Pago (Checkout Pro — preferencia vía API REST).
       Redirige al checkout alojado de MP (init_point). La confirmación
       llega por webhook y se VERIFICA consultando el pago en la API de MP
       (fuente de verdad), no en el cuerpo de la notificación.
       ============================================================ */
    private static function mpCreatePreference(array $entity, array $user, float $amount, string $reference, string $kind = 'order'): array
    {
        global $CONFIG;
        $token = (string) ($CONFIG['payment']['mp_access_token'] ?? '');
        if ($token === '') {
            throw new RuntimeException('Mercado Pago no está configurado (falta MP_ACCESS_TOKEN).');
        }
        $t      = self::target($kind);
        $isAppt = ($kind === 'appointment');
        $base   = rtrim((string) ($CONFIG['app_url'] ?? ''), '/');
        $title  = ($isAppt ? 'Cita ' : 'Pedido ') . $entity['code'] . ' — Ok.station';

        $payload = [
            'items' => [[
                'title'       => $title,
                'quantity'    => 1,
                'currency_id' => self::currency(),
                'unit_price'  => round($amount, 2),
            ]],
            'external_reference' => $reference,
            'back_urls' => [
                'success' => $base . '/perfil.html?pago=ok#' . $t['hash'],
                'failure' => $base . '/perfil.html?pago=cancelado#' . $t['hash'],
                'pending' => $base . '/perfil.html?pago=pendiente#' . $t['hash'],
            ],
            'auto_return'      => 'approved',
            'notification_url' => $base . '/backend/api/payments/webhook.php',
            'metadata'         => ['kind' => $kind, 'reference' => $reference, $t['fk'] => (int) $entity['id']],
        ];
        // NO pre-adjuntamos el correo del cliente como pagador: Mercado Pago lo
        // pide en su propia pantalla de checkout. Mandarlo aquí provoca que, en
        // modo de PRUEBA, MP detecte una "cuenta real" y rechace el pago con
        // "una de las partes es de prueba". El webhook identifica el pedido por
        // external_reference, no por el correo, así que esto no afecta nada.

        $ch = curl_init('https://api.mercadopago.com/checkout/preferences');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
            CURLOPT_TIMEOUT        => 20,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode((string) $res, true);
        if ($code >= 300 || !is_array($json) || !isset($json['id'])) {
            throw new RuntimeException('No se pudo crear la preferencia de Mercado Pago.');
        }
        // init_point sirve tanto en prueba (con credenciales TEST) como en producción.
        $url = (string) ($json['init_point'] ?? $json['sandbox_init_point'] ?? '');
        if ($url === '') {
            throw new RuntimeException('Mercado Pago no devolvió un init_point.');
        }
        return ['url' => $url, 'id' => (string) $json['id']];
    }

    /* ============================================================
       Mercado Pago (Checkout API — cobro con tarjeta tokenizada).
       El navegador tokeniza la tarjeta contra MP (los datos NUNCA llegan al
       servidor, solo el token de un solo uso) y aquí creamos el pago con el
       Access Token de servidor. El webhook confirma después de forma definitiva.
       ============================================================ */

    /** Punto de entrada público del cobro por Checkout API (lo usa payments/process.php). */
    public static function chargeCard(array $entity, float $amount, string $reference, array $card, string $kind = 'order'): array
    {
        return self::mpCreatePayment($entity, $amount, $reference, $card, $kind);
    }

    /**
     * Crea un pago en Mercado Pago con una tarjeta ya tokenizada.
     * $card: ['token','payment_method_id','issuer_id'?,'installments'?,'payer_email'?]
     * Devuelve ['id'=>string, 'status'=>string(estado MP), 'status_detail'=>string].
     */
    private static function mpCreatePayment(array $entity, float $amount, string $reference, array $card, string $kind = 'order'): array
    {
        global $CONFIG;
        $token = (string) ($CONFIG['payment']['mp_access_token'] ?? '');
        if ($token === '') {
            throw new RuntimeException('Mercado Pago no está configurado (falta MP_ACCESS_TOKEN).');
        }
        $isAppt = ($kind === 'appointment');
        $base   = rtrim((string) ($CONFIG['app_url'] ?? ''), '/');
        $desc   = ($isAppt ? 'Cita ' : 'Pedido ') . $entity['code'] . ' — Ok.station';

        $payload = [
            'transaction_amount' => round($amount, 2),
            'token'              => (string) $card['token'],
            'description'        => $desc,
            'installments'       => max(1, (int) ($card['installments'] ?? 1)),
            'payment_method_id'  => (string) $card['payment_method_id'],
            'external_reference' => $reference,
            'notification_url'   => $base . '/backend/api/payments/webhook.php',
            'payer'              => ['email' => (string) ($card['payer_email'] ?? '')],
        ];
        if (!empty($card['issuer_id'])) $payload['issuer_id'] = (string) $card['issuer_id'];

        /* Idempotencia por INTENTO de tarjeta: referencia + hash del token (de un
           solo uso). Un doble clic/reintento con el MISMO token reusa la clave (no
           duplica el cargo); un reintento con OTRA tarjeta genera un token nuevo y,
           por tanto, una clave nueva (sí permite reintentar tras un rechazo). */
        $idem = $reference . '-' . substr(hash('sha256', (string) $card['token']), 0, 16);

        $ch = curl_init('https://api.mercadopago.com/v1/payments');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
                'X-Idempotency-Key: ' . $idem,
            ],
            CURLOPT_TIMEOUT        => 25,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode((string) $res, true);
        if (!is_array($json) || !isset($json['status'])) {
            // Error de la API (credenciales, red, validación). No exponemos datos sensibles.
            $msg = is_array($json) ? (string) ($json['message'] ?? 'error') : 'sin respuesta';
            error_log('[MP payments] HTTP ' . $code . ' ref=' . $reference . ' msg=' . $msg);
            throw new RuntimeException('No se pudo procesar el pago con Mercado Pago.');
        }
        return [
            'id'            => (string) ($json['id'] ?? ''),
            'status'        => (string) $json['status'],
            'status_detail' => (string) ($json['status_detail'] ?? ''),
        ];
    }

    /**
     * Reconciliación anti doble cobro: busca en Mercado Pago un pago APROBADO o EN CURSO
     * para esta referencia (external_reference). Se usa ANTES de cobrar con tarjeta: si un
     * intento anterior sí prosperó pero su respuesta se perdió (timeout, cierre de pestaña),
     * evita generar un segundo cargo. Devuelve ['id','status'(interno),'amount'] o null.
     * Falla en abierto (devuelve null si la API no responde): nunca bloquea un pago legítimo.
     */
    public static function mpFindPaymentByReference(string $reference): ?array
    {
        global $CONFIG;
        $token = (string) ($CONFIG['payment']['mp_access_token'] ?? '');
        if ($token === '' || $reference === '') return null;

        $url = 'https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=' . rawurlencode($reference);
        $ch  = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token],
            CURLOPT_TIMEOUT        => 15,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code >= 300) return null;

        $json    = json_decode((string) $res, true);
        $results = is_array($json) ? ($json['results'] ?? []) : [];
        if (!is_array($results)) return null;

        // Prioriza un pago YA aprobado; si no, uno en curso (in_process/pending/authorized).
        $best = null;
        foreach ($results as $p) {
            $st = (string) ($p['status'] ?? '');
            if ($st === 'approved') { $best = $p; break; }
            if (!$best && in_array($st, ['in_process', 'pending', 'authorized'], true)) { $best = $p; }
        }
        if (!$best) return null;

        return [
            'id'     => (string) ($best['id'] ?? ''),
            'status' => self::mpMapStatus((string) ($best['status'] ?? '')),
            'amount' => isset($best['transaction_amount']) ? round((float) $best['transaction_amount'], 2) : null,
        ];
    }

    /**
     * Verifica y normaliza un evento de webhook del proveedor.
     * Devuelve ['order_ref'=>, 'transaction_id'=>, 'status'=>] o null si no es válido.
     */
    public static function verifyWebhook(string $rawBody, array $headers): ?array
    {
        global $CONFIG;

        if (self::provider() === 'mercadopago') {
            return self::mpVerifyWebhook($rawBody, $headers);
        }

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

    /* ============================================================
       Webhook de Mercado Pago.
       La notificación solo trae el ID del pago; el estado REAL se obtiene
       consultando GET /v1/payments/{id} con nuestro Access Token (un atacante
       no puede falsificar un pago aprobado de NUESTRA cuenta). Opcionalmente,
       si hay MP_WEBHOOK_SECRET, validamos también la firma x-signature.
       ============================================================ */
    private static function mpVerifyWebhook(string $rawBody, array $headers): ?array
    {
        global $CONFIG;
        $token = (string) ($CONFIG['payment']['mp_access_token'] ?? '');
        if ($token === '') return null;

        // El id del pago puede venir por query (?type=payment&data.id=##) o en el body JSON.
        $type  = (string) ($_GET['type'] ?? $_GET['topic'] ?? '');
        $payId = (string) ($_GET['data.id'] ?? $_GET['id'] ?? $_GET['data_id'] ?? '');
        if ($rawBody !== '') {
            $body = json_decode($rawBody, true);
            if (is_array($body)) {
                if ($type === '')  $type  = (string) ($body['type'] ?? $body['topic'] ?? '');
                if ($payId === '') $payId = (string) ($body['data']['id'] ?? $body['id'] ?? '');
            }
        }
        $type  = strtolower($type);
        if ($type !== '' && strpos($type, 'payment') === false) return null;  // solo notificaciones de pago
        $payId = preg_replace('/[^0-9]/', '', $payId);
        if ($payId === '') return null;

        // Firma (si hay secreto configurado): defensa en profundidad, NO fatal.
        // La fuente de verdad es la consulta del pago a la API de MP (más abajo), que
        // un atacante no puede falsificar (usa NUESTRO access token). Si la firma no
        // cuadra por cualquier detalle de formato, lo REGISTRAMOS pero NO descartamos la
        // notificación: así jamás se pierde la confirmación de un pago real de Checkout
        // Pro por un desajuste de firma. Un pago inexistente/ajeno se filtra igual porque
        // la API devuelve 404 o un external_reference que no es de ningún pedido nuestro.
        $secret = (string) ($CONFIG['payment']['mp_webhook_secret'] ?? '');
        if ($secret !== '' && !self::mpVerifySignature($headers, $payId, $secret)) {
            error_log('[MP webhook] x-signature no válida para payId=' . $payId . '; se continúa con la verificación autoritativa por API.');
        }

        // Fuente de verdad: consultar el pago real en la API de Mercado Pago.
        $ch = curl_init('https://api.mercadopago.com/v1/payments/' . $payId);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token],
            CURLOPT_TIMEOUT        => 20,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $pay = json_decode((string) $res, true);
        if ($code >= 300 || !is_array($pay) || !isset($pay['status'])) return null;

        return [
            'order_ref'      => (string) ($pay['external_reference'] ?? ''),
            'transaction_id' => (string) ($pay['id'] ?? $payId),
            'status'         => self::mpMapStatus((string) $pay['status']),
        ];
    }

    /** Firma de Mercado Pago: header x-signature (ts, v1) + x-request-id. */
    private static function mpVerifySignature(array $headers, string $payId, string $secret): bool
    {
        $sig   = $headers['X-Signature']  ?? ($headers['x-signature']  ?? '');
        $reqId = $headers['X-Request-Id'] ?? ($headers['x-request-id'] ?? '');
        if ($sig === '') return false;
        $ts = null; $v1 = null;
        foreach (explode(',', $sig) as $part) {
            $kv = explode('=', trim($part), 2);
            if (count($kv) === 2) {
                if ($kv[0] === 'ts') $ts = $kv[1];
                if ($kv[0] === 'v1') $v1 = $kv[1];
            }
        }
        if (!$ts || !$v1) return false;
        $manifest = 'id:' . $payId . ';request-id:' . $reqId . ';ts:' . $ts . ';';
        $expected = hash_hmac('sha256', $manifest, $secret);
        return hash_equals($expected, (string) $v1);
    }
}

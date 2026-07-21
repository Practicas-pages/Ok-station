<?php
/**
 * Ok.station — Construcción de correos transaccionales en HTML.
 * Genera el correo de confirmación de CITA y de PEDIDO: incluye el TICKET del
 * cliente y un botón "Confirmar" (enlace con token, sin necesidad de iniciar
 * sesión). HTML compatible con Gmail/Outlook (tablas + estilos en línea).
 *
 * Requiere $CONFIG global (de _bootstrap.php) para leer app_url.
 */
final class Emails
{
    /** Token secreto del enlace de confirmación (40 hex = 160 bits). */
    public static function token(): string { return bin2hex(random_bytes(20)); }

    private static function appUrl(): string
    {
        global $CONFIG;
        return rtrim((string) ($CONFIG['app_url'] ?? 'https://okstation.mx'), '/');
    }

    /** URL pública que abre el cliente desde el correo para confirmar. */
    public static function confirmUrl(string $kind, string $code, string $token): string
    {
        $path = $kind === 'cita'
            ? '/backend/api/appointments/confirm.php'
            : '/backend/api/orders/confirm.php';
        return self::appUrl() . $path . '?c=' . rawurlencode($code) . '&t=' . rawurlencode($token);
    }

    private static function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

    /** Fecha YYYY-MM-DD → DD/MM/YYYY (sin depender del locale del servidor). */
    private static function fdate(string $ymd): string
    {
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $ymd, $m)) return $m[3] . '/' . $m[2] . '/' . $m[1];
        return $ymd;
    }

    /** Botón de acción (color sólido por compatibilidad con clientes de correo). */
    private static function button(string $url, string $label): string
    {
        return
            '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 8px"><tr><td '
            . 'style="border-radius:30px;background:#066CFF">'
            . '<a href="' . self::e($url) . '" target="_blank" '
            . 'style="display:inline-block;padding:15px 34px;font-family:Arial,Helvetica,sans-serif;font-size:16px;'
            . 'font-weight:bold;color:#ffffff;text-decoration:none;border-radius:30px">' . self::e($label) . '</a>'
            . '</td></tr></table>';
    }

    /** Estructura común: cabecera de marca + tarjeta blanca + pie. */
    private static function layout(string $preheader, string $inner): string
    {
        $pre = self::e($preheader);
        return
'<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
. '<meta name="viewport" content="width=device-width,initial-scale=1">'
. '<meta name="color-scheme" content="light only"></head>'
. '<body style="margin:0;padding:0;background:#0a1f4d">'
. '<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">' . $pre . '</span>'
. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1f4d;padding:24px 12px">'
. '<tr><td align="center">'
. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">'
// Cabecera marca
. '<tr><td align="center" style="padding:8px 0 20px">'
. '<span style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:#ffffff">'
. '<span style="color:#3b9bff">OK</span><span style="color:#9C1DFF">.</span>station</span>'
. '</td></tr>'
// Tarjeta blanca
. '<tr><td style="background:#ffffff;border-radius:16px;padding:28px 26px;'
. 'font-family:Arial,Helvetica,sans-serif;color:#12141c">' . $inner . '</td></tr>'
// Pie
. '<tr><td align="center" style="padding:18px 8px;font-family:Arial,Helvetica,sans-serif;'
. 'font-size:12px;line-height:1.6;color:#9fb3da">'
. 'Ok.station · Centro Comercial Otay, Local G-03 · Tijuana, B.C.<br>'
. '(664) 719-4117 · <a href="' . self::appUrl() . '" style="color:#3b9bff;text-decoration:none">okstation.mx</a>'
. '</td></tr>'
. '</table></td></tr></table></body></html>';
    }

    /** Fila del ticket (etiqueta + valor). */
    private static function row(string $label, string $value): string
    {
        return
            '<tr><td style="padding:7px 0;font-size:14px;color:#4a5068;border-bottom:1px solid #eef1f7">' . self::e($label) . '</td>'
            . '<td align="right" style="padding:7px 0;font-size:14px;font-weight:bold;color:#12141c;border-bottom:1px solid #eef1f7">' . $value . '</td></tr>';
    }

    private static function ticketCard(string $code, string $rows): string
    {
        return
            '<div style="border:1px solid #e4e7f0;border-radius:12px;overflow:hidden;margin:6px 0 8px">'
            . '<div style="background:#0a1f4d;padding:14px 18px">'
            . '<div style="font-size:12px;color:#9fb3da;letter-spacing:.08em;text-transform:uppercase">Folio</div>'
            . '<div style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:.04em">' . self::e($code) . '</div></div>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:6px 18px 12px">' . $rows . '</table>'
            . '</div>';
    }

    /** Correo de confirmación de CITA. $p: name, code, svcName, party, date, time, priceText, confirmUrl. */
    public static function citaHtml(array $p): string
    {
        $rows =
            self::row('Servicio', self::e((string) $p['svcName'])) .
            self::row('Personas', self::e((string) $p['party'])) .
            self::row('Fecha', self::e(self::fdate((string) $p['date']))) .
            self::row('Hora', self::e((string) $p['time']) . ' hrs') .
            (!empty($p['priceText']) ? self::row('Pago estimado', self::e((string) $p['priceText'])) : '');

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Hola ' . self::e((string) $p['name']) . '!</h1>'
            . '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4a5068">'
            . 'Recibimos tu solicitud de cita en Ok.station. Para apartar tu lugar, confírmala con el botón de abajo. '
            . 'Este es tu ticket:</p>'
            . self::ticketCard((string) $p['code'], $rows)
            . self::button((string) $p['confirmUrl'], 'Confirmar mi cita')
            . '<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center">'
            . 'Tu cita queda <b>pendiente</b> hasta que la confirmemos. Te contactaremos para finalizar.</p>'
            . '<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#9aa1b2">'
            . 'Si el botón no funciona, copia y pega este enlace en tu navegador:<br>'
            . '<span style="color:#3b9bff;word-break:break-all">' . self::e((string) $p['confirmUrl']) . '</span></p>';

        return self::layout('Confirma tu cita ' . (string) $p['code'] . ' en Ok.station', $inner);
    }

    /** Correo de confirmación de PEDIDO. $p: name, code, items[], subtotal, tax, total, confirmUrl. */
    public static function pedidoHtml(array $p): string
    {
        $itemsHtml = '';
        foreach (($p['items'] ?? []) as $it) {
            $itemsHtml .= self::row(
                self::e((string) ($it['label'] ?? 'Archivo')) . ' × ' . (int) ($it['qty'] ?? 1),
                '$' . number_format((float) ($it['line'] ?? 0), 2) . ' MXN'
            );
        }
        $rows =
            $itemsHtml .
            self::row('Subtotal', '$' . number_format((float) $p['subtotal'], 2) . ' MXN') .
            self::row('IVA', '$' . number_format((float) $p['tax'], 2) . ' MXN') .
            '<tr><td style="padding:9px 0 2px;font-size:15px;font-weight:bold;color:#12141c">Total estimado</td>'
            . '<td align="right" style="padding:9px 0 2px;font-size:16px;font-weight:bold;color:#066CFF">$'
            . number_format((float) $p['total'], 2) . ' MXN</td></tr>';

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Hola ' . self::e((string) $p['name']) . '!</h1>'
            . '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4a5068">'
            . 'Recibimos tu pedido de impresión en Ok.station. Confírmalo con el botón de abajo. Este es tu ticket:</p>'
            . self::ticketCard((string) $p['code'], $rows)
            . self::button((string) $p['confirmUrl'], 'Confirmar mi pedido')
            . '<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center">'
            . 'El total es un <b>estimado</b>; confirmamos el precio final al revisar tus archivos.</p>'
            . '<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#9aa1b2">'
            . 'Si el botón no funciona, copia y pega este enlace en tu navegador:<br>'
            . '<span style="color:#3b9bff;word-break:break-all">' . self::e((string) $p['confirmUrl']) . '</span></p>';

        return self::layout('Confirma tu pedido ' . (string) $p['code'] . ' en Ok.station', $inner);
    }

    /** Etiqueta legible de un estado de pedido (para asuntos y cuerpos de correo). */
    public static function orderStatusLabel(string $s): string
    {
        $L = [
            'recibido'      => 'Recibido',
            'en_revision'   => 'En revisión',
            'en_produccion' => 'En producción',
            'listo'         => 'Listo para recoger',
            'entregado'     => 'Entregado',
            'cancelado'     => 'Cancelado',
        ];
        return $L[$s] ?? ucfirst(str_replace('_', ' ', $s));
    }

    /**
     * Correo "tu pedido ya tiene precio" (cotización lista).
     * $p: name, code, total (float), payUrl. La trabajadora fijó el precio final
     * desde el panel y el cliente puede pagarlo en línea (Checkout Pro).
     */
    public static function pedidoPrecioHtml(array $p): string
    {
        $total = '$' . number_format((float) ($p['total'] ?? 0), 2) . ' MXN';
        $rows =
            '<tr><td style="padding:9px 0 2px;font-size:15px;font-weight:bold;color:#12141c">Precio final</td>'
            . '<td align="right" style="padding:9px 0 2px;font-size:16px;font-weight:bold;color:#066CFF">' . $total . '</td></tr>';

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Hola ' . self::e((string) ($p['name'] ?? '')) . '!</h1>'
            . '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4a5068">'
            . 'Ya revisamos tu pedido y tiene <b>precio final</b>. Puedes pagarlo en línea de forma '
            . 'segura con el botón de abajo:</p>'
            . self::ticketCard((string) ($p['code'] ?? ''), $rows)
            . self::button((string) ($p['payUrl'] ?? self::appUrl()), 'Pagar mi pedido')
            . '<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center">'
            . 'Si prefieres, también puedes pagar en tienda o escribirnos por WhatsApp al (664) 719-4117.</p>';

        return self::layout('Tu pedido ' . (string) ($p['code'] ?? '') . ' ya tiene precio', $inner);
    }

    /**
     * Correo "tu cita ya se puede pagar" (cotización lista). $p: name, code, total, payUrl.
     * La trabajadora fijó el pago de un trámite que se cotiza (p. ej. apostille/médica).
     */
    public static function citaPrecioHtml(array $p): string
    {
        $total = '$' . number_format((float) ($p['total'] ?? 0), 2) . ' MXN';
        $rows =
            '<tr><td style="padding:9px 0 2px;font-size:15px;font-weight:bold;color:#12141c">Total a pagar</td>'
            . '<td align="right" style="padding:9px 0 2px;font-size:16px;font-weight:bold;color:#066CFF">' . $total . '</td></tr>';

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Hola ' . self::e((string) ($p['name'] ?? '')) . '!</h1>'
            . '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4a5068">'
            . 'Ya cotizamos tu cita. Ya puedes <b>pagarla en línea</b> de forma segura '
            . 'para apartar tu lugar:</p>'
            . self::ticketCard((string) ($p['code'] ?? ''), $rows)
            . self::button((string) ($p['payUrl'] ?? self::appUrl()), 'Pagar mi cita')
            . '<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center">'
            . 'Si prefieres, también puedes coordinar el pago por WhatsApp al (664) 719-4117.</p>';

        return self::layout('Tu cita ' . (string) ($p['code'] ?? '') . ' ya se puede pagar', $inner);
    }

    /**
     * Correo de cambio de estado de un pedido. $p: name, code, status, payUrl (opcional).
     * Si payUrl viene lleno (p. ej. está "listo" y sin pagar), añade botón de pago.
     */
    public static function pedidoEstadoHtml(array $p): string
    {
        $status = (string) ($p['status'] ?? '');
        $label  = self::orderStatusLabel($status);
        $msgMap = [
            'recibido'      => 'Recibimos tu pedido y ya está en nuestra fila de trabajo.',
            'en_revision'   => 'Estamos revisando tus archivos para dejar todo listo.',
            'en_produccion' => '¡Manos a la obra! Tu pedido ya se está imprimiendo.',
            'listo'         => 'Tu pedido está listo para recoger en Centro Comercial Otay, Local G-03.',
            'entregado'     => '¡Gracias! Tu pedido fue entregado. Esperamos verte pronto.',
            'cancelado'     => 'Tu pedido fue cancelado. Si crees que es un error, escríbenos por WhatsApp.',
        ];
        $msg = $msgMap[$status] ?? ('Tu pedido ahora está: ' . $label . '.');

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Hola ' . self::e((string) ($p['name'] ?? '')) . '!</h1>'
            . '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a5068">' . self::e($msg) . '</p>'
            . self::ticketCard((string) ($p['code'] ?? ''), self::row('Estado', self::e($label)))
            . (!empty($p['payUrl']) ? self::button((string) $p['payUrl'], 'Pagar mi pedido') : '')
            . '<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280">'
            . '¿Dudas? Escríbenos por WhatsApp al (664) 719-4117 o responde este correo.</p>';

        return self::layout('Tu pedido ' . (string) ($p['code'] ?? '') . ' — ' . $label, $inner);
    }

    /** Etiqueta legible de un estado de cita (para asuntos y cuerpos de correo). */
    public static function apptStatusLabel(string $s): string
    {
        $L = [
            'pendiente'  => 'Pendiente',
            'confirmada' => 'Confirmada',
            'cancelada'  => 'Cancelada',
            'completada' => 'Completada',
            'no_show'    => 'No asistida',
        ];
        return $L[$s] ?? ucfirst(str_replace('_', ' ', $s));
    }

    /** Correo de cambio de estado de una cita. $p: name, code, status. */
    public static function citaEstadoHtml(array $p): string
    {
        $status = (string) ($p['status'] ?? '');
        $label  = self::apptStatusLabel($status);
        $msgMap = [
            'pendiente'  => 'Recibimos tu cita. Te confirmaremos en breve.',
            'confirmada' => '¡Tu cita quedó confirmada! Te esperamos en Centro Comercial Otay, Local G-03.',
            'cancelada'  => 'Tu cita fue cancelada. Si crees que es un error, escríbenos por WhatsApp.',
            'completada' => '¡Gracias por tu visita! Tu cita quedó completada.',
            'no_show'    => 'Registramos que no asististe a tu cita. Si necesitas reagendar, escríbenos.',
        ];
        $msg = $msgMap[$status] ?? ('Tu cita ahora está: ' . $label . '.');

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Hola ' . self::e((string) ($p['name'] ?? '')) . '!</h1>'
            . '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a5068">' . self::e($msg) . '</p>'
            . self::ticketCard((string) ($p['code'] ?? ''), self::row('Estado', self::e($label)))
            . '<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280">'
            . '¿Dudas? Escríbenos por WhatsApp al (664) 719-4117 o responde este correo.</p>';

        return self::layout('Tu cita ' . (string) ($p['code'] ?? '') . ' — ' . $label, $inner);
    }

    /**
     * Correo "pago confirmado". $p: kind ('order'|'appointment'), name, code, amount.
     * Se envía cuando el pago queda 'pagado' (por Mercado Pago o confirmado por el
     * trabajador en el panel). El correo es el canal principal de aviso al cliente.
     */
    public static function pagoConfirmadoHtml(array $p): string
    {
        $kind   = (string) ($p['kind'] ?? 'order');
        $isAppt = ($kind === 'appointment');
        $isShop = ($kind === 'shop');
        $noun   = $isAppt ? 'tu cita' : ($isShop ? 'tu compra' : 'tu pedido');
        $name   = (string) ($p['name'] ?? '');
        $amt    = '$' . number_format((float) ($p['amount'] ?? 0), 2) . ' MXN';
        $sub    = $isAppt ? 'Tu cita queda <b>pagada</b> y confirmada.'
                          : ($isShop ? 'Ya preparamos <b>tu pedido de la tienda</b>; te avisamos cuando esté listo.'
                                     : 'Ya nos ponemos con <b>tu pedido</b>.');

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Pago confirmado' . ($name !== '' ? ', ' . self::e($name) : '') . '!</h1>'
            . '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a5068">'
            . 'Recibimos el pago de ' . $noun . ' en Ok.station. ' . $sub . '</p>'
            . self::ticketCard((string) ($p['code'] ?? ''), self::row('Pago recibido', $amt))
            . '<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280">'
            . 'Cualquier duda, escríbenos por WhatsApp al (664) 719-4117 o responde este correo.</p>';

        return self::layout('Pago confirmado ' . (string) ($p['code'] ?? '') . ' · Ok.station', $inner);
    }

    /** Etiqueta legible de un estado de pedido de TIENDA. */
    public static function shopStatusLabel(string $s): string
    {
        $L = [
            'recibido'       => 'Recibido',
            'en_preparacion' => 'En preparación',
            'listo'          => 'Listo',
            'entregado'      => 'Entregado',
            'cancelado'      => 'Cancelado',
        ];
        return $L[$s] ?? ucfirst(str_replace('_', ' ', $s));
    }

    /** Correo "recibimos tu compra". $p: name, code, items[], subtotal, tax, ship, total, shipMode. */
    public static function tiendaPedidoHtml(array $p): string
    {
        $itemsHtml = '';
        foreach (($p['items'] ?? []) as $it) {
            $itemsHtml .= self::row(
                self::e((string) ($it['name'] ?? 'Producto')) . ' × ' . (int) ($it['qty'] ?? 1),
                '$' . number_format((float) ($it['line'] ?? 0), 2) . ' MXN'
            );
        }
        $envio = ((string) ($p['shipMode'] ?? 'retiro') === 'envio');
        $rows =
            $itemsHtml .
            self::row('Subtotal', '$' . number_format((float) ($p['subtotal'] ?? 0), 2) . ' MXN') .
            self::row('IVA', '$' . number_format((float) ($p['tax'] ?? 0), 2) . ' MXN') .
            self::row('Envío', $envio ? '$' . number_format((float) ($p['ship'] ?? 0), 2) . ' MXN' : 'Gratis (recoges)') .
            '<tr><td style="padding:9px 0 2px;font-size:15px;font-weight:bold;color:#12141c">Total</td>'
            . '<td align="right" style="padding:9px 0 2px;font-size:16px;font-weight:bold;color:#066CFF">$'
            . number_format((float) ($p['total'] ?? 0), 2) . ' MXN</td></tr>';

        $entrega = $envio
            ? 'Te enviamos tu pedido a domicilio en cuanto se confirme el pago.'
            : 'Recoge tu pedido en OK.station · Centro Comercial Otay, Local G-03.';

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Gracias por tu compra, ' . self::e((string) ($p['name'] ?? '')) . '!</h1>'
            . '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4a5068">'
            . 'Recibimos tu pedido de la tienda en línea. ' . self::e($entrega) . ' Este es tu ticket:</p>'
            . self::ticketCard((string) ($p['code'] ?? ''), $rows)
            . '<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280">'
            . '¿Dudas? Escríbenos por WhatsApp al (664) 719-4117 o responde este correo.</p>';

        return self::layout('Recibimos tu compra ' . (string) ($p['code'] ?? '') . ' en Ok.station', $inner);
    }

    /** Correo de cambio de estado de un pedido de TIENDA. $p: name, code, status. */
    public static function tiendaEstadoHtml(array $p): string
    {
        $status = (string) ($p['status'] ?? '');
        $label  = self::shopStatusLabel($status);
        $msgMap = [
            'recibido'       => 'Recibimos tu pedido y ya lo estamos preparando.',
            'en_preparacion' => 'Estamos preparando tu pedido con todo listo.',
            'listo'          => 'Tu pedido está listo para recoger en OK.station · Centro Comercial Otay, Local G-03.',
            'entregado'      => '¡Gracias! Tu pedido fue entregado. Esperamos verte pronto.',
            'cancelado'      => 'Tu pedido fue cancelado. Si crees que es un error, escríbenos por WhatsApp.',
        ];
        $msg = $msgMap[$status] ?? ('Tu pedido ahora está: ' . $label . '.');

        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Hola ' . self::e((string) ($p['name'] ?? '')) . '!</h1>'
            . '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a5068">' . self::e($msg) . '</p>'
            . self::ticketCard((string) ($p['code'] ?? ''), self::row('Estado', self::e($label)))
            . '<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280">'
            . '¿Dudas? Escríbenos por WhatsApp al (664) 719-4117 o responde este correo.</p>';

        return self::layout('Tu compra ' . (string) ($p['code'] ?? '') . ' — ' . $label, $inner);
    }

    /** Correo con el COMPROBANTE PDF adjunto. $kind = 'pedido'|'cita'|'compra' (tienda). */
    public static function comprobanteHtml(string $kind, string $code, string $name): string
    {
        $noun = ($kind === 'cita') ? 'tu cita' : (($kind === 'compra') ? 'tu compra de la tienda' : 'tu pedido');
        $inner =
            '<h1 style="margin:0 0 6px;font-size:20px;color:#12141c">¡Gracias' . ($name !== '' ? ', ' . self::e($name) : '') . '!</h1>'
            . '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a5068">'
            . 'Adjuntamos el <b>comprobante (PDF)</b> de ' . $noun . ' en Ok.station. Consérvalo: '
            . 'incluye tu folio y un código QR.</p>'
            . self::ticketCard($code, self::row('Comprobante', 'Adjunto en este correo (PDF)'))
            . '<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280">'
            . 'Si necesitas ayuda, escríbenos por WhatsApp al (664) 719-4117 o responde este correo.</p>';
        return self::layout('Tu comprobante ' . $code . ' · Ok.station', $inner);
    }

    /** Página HTML (no JSON) que ve el cliente tras dar clic en el enlace. */
    public static function confirmPage(string $heading, string $message, bool $ok = true): string
    {
        $icon = $ok ? '✓' : '!';
        $color = $ok ? '#066CFF' : '#b45309';
        return
'<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
. '<meta name="viewport" content="width=device-width,initial-scale=1">'
. '<title>' . self::e($heading) . ' · Ok.station</title></head>'
. '<body style="margin:0;background:#0a1f4d;font-family:Arial,Helvetica,sans-serif">'
. '<table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" style="min-height:100vh">'
. '<tr><td align="center" valign="middle" style="padding:24px">'
. '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%">'
. '<tr><td align="center" style="padding:0 0 18px;font-size:24px;font-weight:bold;color:#fff">'
. '<span style="color:#3b9bff">OK</span><span style="color:#9C1DFF">.</span>station</td></tr>'
. '<tr><td style="background:#fff;border-radius:16px;padding:34px 28px;text-align:center">'
. '<div style="width:64px;height:64px;line-height:64px;border-radius:50%;margin:0 auto 16px;'
. 'background:' . $color . '1f;color:' . $color . ';font-size:32px;font-weight:bold">' . $icon . '</div>'
. '<h1 style="margin:0 0 8px;font-size:21px;color:#12141c">' . self::e($heading) . '</h1>'
. '<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4a5068">' . self::e($message) . '</p>'
. '<a href="' . self::appUrl() . '" style="display:inline-block;padding:13px 26px;border-radius:30px;'
. 'background:#066CFF;color:#fff;text-decoration:none;font-weight:bold;font-size:15px">Ir a okstation.mx</a>'
. '</td></tr></table></td></tr></table></body></html>';
    }
}

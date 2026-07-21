/* ============================================================
   Ok.station — Recibo PDF de compra de la TIENDA (módulo compartido)
   Expone:
     window.OKShopTicket(order)         → data-URI del PDF (o null si faltan libs)
     window.OKShopTicketBlobUrl(order)  → Blob URL (descarga fiable en móvil)
     window.OKShopTicketDownload(order) → dispara la descarga
   Mismo lenguaje visual que el comprobante de citas (cita-ticket.js):
   franja degradada de marca, logo, tabla de conceptos y barra de TOTAL.
   Requiere jsPDF (window.jspdf); QRCode es opcional (si está, añade el QR).
   order: { code, created_at, payment_date, payment_reference, ship_mode,
            ship_address, ship_state, subtotal, tax, iva_rate, ship_cost, total,
            contact_phone, name?, items:[{product_name, product_sku, unit_price, qty, line_total}] }
   ============================================================ */
(function () {
  "use strict";

  var WA_URL = "https://wa.me/526647194117?text=" + encodeURIComponent("Hola Ok.station, hice una compra en la tienda en línea y tengo una duda.");
  var MAPS_URL = "https://www.google.com/maps/place/Ok.station/@32.5292376,-116.9514835,17z/data=!4m6!3m5!1s0x80d9475a2b534615:0x80c51bb5b3fe8f55!8m2!3d32.5292376!4d-116.9514835!16s%2Fg%2F11k63fhrhb";

  /* Logo de marca: reutiliza el que ya optimiza cita-ticket.js si está cargado;
     si esta página no lo incluye, se precarga aquí igual (reducido a 640px para
     que el PDF pese ~200 KB y no lo rechace ticket-store por tamaño). */
  var LOGO_SRC = "assets/img/okstation-logo.webp";
  var _logo = null;
  (function preload() {
    try {
      if (typeof Image === "undefined") return;
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) return;
          var MAXW = 640, scale = w > MAXW ? (MAXW / w) : 1;
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var c = document.createElement("canvas");
          c.width = cw; c.height = ch;
          c.getContext("2d").drawImage(img, 0, 0, cw, ch);
          _logo = { png: c.toDataURL("image/png"), w: cw, h: ch };
        } catch (e) {}
      };
      img.src = LOGO_SRC;
    } catch (e) {}
  })();
  function logo() {
    if (window.OKTicketLogo) { var l = window.OKTicketLogo(); if (l) return l; }
    return _logo;
  }

  function mxn2(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0); }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function dt(d) { return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + ":" + two(d.getMinutes()); }
  /* "2026-07-21 13:45:00" (o ISO) → "21/07/2026 13:45"; sin hora → solo fecha. */
  function fdate(s) {
    if (!s) return "—";
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return String(s);
    return m[3] + "/" + m[2] + "/" + m[1] + (m[4] ? " " + m[4] + ":" + m[5] : "");
  }

  /** @returns {string|null} data-URI del PDF, o null si falta jsPDF. */
  window.OKShopTicket = function (order) {
    if (!order || !window.jspdf || !window.jspdf.jsPDF) return null;
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var PW = 210, x = 16, RIGHT = PW - 16, CW = RIGHT - x;
    var purple = [156, 29, 255], blue = [6, 108, 255], cyan = [0, 198, 255],
        dark = [15, 23, 42], muted = [110, 122, 140], rule = [228, 232, 240], green = [22, 163, 74];
    var CONTENT_BOTTOM = 262;   /* deja sitio al pie de contacto */
    function lerp(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
    function gradBand(x0, y0, w, h) {
      var n = Math.max(2, Math.round(w)), s = w / n;
      for (var i = 0; i < n; i++) { var t = i / (n - 1); var c = t < 0.5 ? lerp(purple, blue, t * 2) : lerp(blue, cyan, (t - 0.5) * 2); doc.setFillColor(c[0], c[1], c[2]); doc.rect(x0 + s * i, y0, s + 0.4, h, "F"); }
    }

    /* ── Franja de marca + título ── */
    gradBand(0, 0, PW, 3);
    doc.setTextColor(dark[0], dark[1], dark[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(25);
    doc.text("Recibo", x, 24);
    doc.text("de compra", x, 34);
    var lg = logo();
    if (lg) {
      var ar = lg.w / lg.h, lh = 9, lw = lh * ar; if (lw > 52) { lw = 52; lh = lw / ar; }
      doc.addImage(lg.png, "PNG", RIGHT - lw, 15, lw, lh);
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("OK.station", RIGHT, 22, { align: "right" });
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("Una marca de OK Dock", RIGHT, 30, { align: "right" });

    /* ── DE (negocio) ── */
    var dy = 50;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("DE", x, dy);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text("Ok.station", x, dy + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("Centro Comercial Otay, Local G-03", x, dy + 11.5);
    doc.text("Carretera Aeropuerto 1900", x, dy + 16);
    doc.text("22425 Tijuana, B.C.", x, dy + 20.5);

    /* ── Metadatos (folio, fecha del pedido y del pago), a la derecha ── */
    var meta = [["EMITIDO", dt(new Date())], ["FOLIO DE COMPRA", String(order.code || "—")],
                ["FECHA DEL PEDIDO", fdate(order.created_at)]];
    if (order.payment_date) meta.push(["PAGADO EL", fdate(order.payment_date)]);
    if (order.payment_reference) meta.push(["REFERENCIA DE PAGO", String(order.payment_reference)]);
    var my = dy;
    meta.forEach(function (r) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(r[0], RIGHT, my, { align: "right" }); my += 3.8;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]);
      var vl = doc.splitTextToSize(String(r[1]), 70); doc.text(vl, RIGHT, my, { align: "right" }); my += vl.length * 4.4 + 2.5;
    });

    /* ── CLIENTE + sello PAGADO ── */
    var cyc = dy + 30;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("CLIENTE", x, cyc);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(String(order.name || "—"), x, cyc + 6);
    if (order.contact_phone) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("Tel. " + order.contact_phone, x, cyc + 11); }
    if ((order.payment_status || "") === "pagado") {
      var st = "PAGADO", bw = doc.getTextWidth(st) + 12;
      doc.setFillColor(green[0], green[1], green[2]); doc.roundedRect(x + 44, cyc + 0.5, bw, 7, 3.5, 3.5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
      doc.text(st, x + 44 + bw / 2, cyc + 5.4, { align: "center" });
    }

    /* ── Tabla de conceptos ──
       Arranca bajo CLIENTE o bajo la pila de metadatos de la derecha (la que sea
       más baja): con pago confirmado los metadatos son 5 filas y llegan más abajo. */
    var ty = Math.max(cyc + 18, my + 4);
    var descX = x + 14, unitR = RIGHT - 30, impR = RIGHT;
    function tableHead() {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text("CANT.", x, ty); doc.text("DESCRIPCIÓN", descX, ty);
      doc.text("P. UNITARIO", unitR, ty, { align: "right" }); doc.text("IMPORTE", impR, ty, { align: "right" });
      ty += 2.5; doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.4); doc.line(x, ty, RIGHT, ty); ty += 6.5;
    }
    /* Los pedidos aceptan hasta 50 productos: si la tabla no cabe, sigue en otra
       página con su propio encabezado (y la franja de marca arriba). */
    function needSpace(h) {
      if (ty + h > CONTENT_BOTTOM) { doc.addPage(); gradBand(0, 0, PW, 3); ty = 20; tableHead(); }
    }
    tableHead();

    (order.items || []).forEach(function (it) {
      var name = String(it.product_name || "Producto") + (it.product_sku ? "  ·  " + it.product_sku : "");
      var dl = doc.splitTextToSize(name, unitR - 10 - descX);
      var rh = Math.max(6, dl.length * 4.6);
      needSpace(rh + 2);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.text(String(it.qty || 1), x + 1, ty);
      doc.text(dl, descX, ty);
      doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(mxn2(it.unit_price), unitR, ty, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(mxn2(it.line_total), impR, ty, { align: "right" });
      ty += rh; doc.setDrawColor(242, 244, 248); doc.setLineWidth(0.3); doc.line(x, ty - 1.5, RIGHT, ty - 1.5); ty += 1.5;
    });

    /* ── Totales (Subtotal / IVA / Envío a la derecha, TOTAL en barra) ── */
    needSpace(46);
    ty += 4;
    var envio = (order.ship_mode === "envio");
    var ivaPct = (+order.iva_rate > 0) ? Math.round(+order.iva_rate * 100) : null;
    var rows = [
      ["Subtotal", mxn2(order.subtotal)],
      ["IVA" + (ivaPct ? " (" + ivaPct + "%)" : ""), mxn2(order.tax)],
      ["Envío" + (envio ? "" : " (recoges en tienda)"), envio ? mxn2(order.ship_cost) : "Gratis"]
    ];
    rows.forEach(function (r) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(r[0], unitR, ty, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(String(r[1]), impR, ty, { align: "right" });
      ty += 6;
    });
    ty += 2;
    var barH = 14;
    doc.setFillColor(blue[0], blue[1], blue[2]); doc.roundedRect(x, ty, CW, barH, 3, 3, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("TOTAL", x + 8, ty + barH / 2 + 1.2);
    doc.setFontSize(15); doc.text(mxn2(order.total) + " MXN", RIGHT - 8, ty + barH / 2 + 1.6, { align: "right" });
    ty += barH + 12;

    /* ── Entrega (izquierda) + QR de consulta (derecha) ── */
    needSpace(30);
    var condY = ty;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("ENTREGA", x, condY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(dark[0], dark[1], dark[2]);
    var entrega = envio
      ? "Envío a domicilio: " + (order.ship_address || "—") + (order.ship_state ? " (" + order.ship_state + ")" : "") + ". Te avisamos cuando salga tu paquete."
      : "Recoges en tienda: Ok.station · Centro Comercial Otay, Local G-03, Tijuana. Presenta este recibo con tu folio.";
    doc.text(doc.splitTextToSize(entrega, CW - 42), x, condY + 6);
    /* QR: escanear → ver tus compras en el perfil. Opcional (si cargó la librería). */
    try {
      if (typeof QRCode !== "undefined") {
        var tmp = document.createElement("div");
        new QRCode(tmp, { text: location.origin + "/perfil.html#tienda", width: 160, height: 160 });
        var cv = tmp.querySelector("canvas");
        if (cv) {
          var qrS = 24, qy = Math.min(condY - 3, 244), qx = RIGHT - qrS;
          doc.addImage(cv.toDataURL("image/png"), "PNG", qx, qy, qrS, qrS);
          doc.setFont("helvetica", "bold"); doc.setFontSize(6.6); doc.setTextColor(muted[0], muted[1], muted[2]);
          doc.text("Al escanear el código QR", qx + qrS / 2, qy + qrS + 3.2, { align: "center" });
          doc.text("verás tus compras", qx + qrS / 2, qy + qrS + 5.8, { align: "center" });
        }
      }
    } catch (e) {}

    /* ── Pie: contacto (en todas las páginas) ── */
    var total = doc.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.4); doc.line(x, 276, RIGHT, 276);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text("Ok.station · Centro Comercial Otay, Local G-03 · Tijuana, B.C." + (total > 1 ? "   ·   Página " + p + " de " + total : ""), x, 281);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(blue[0], blue[1], blue[2]);
      doc.textWithLink("Cómo llegar", x, 286.5, { url: MAPS_URL });
      doc.setTextColor(green[0], green[1], green[2]); doc.textWithLink("WhatsApp (664) 719-4117", x + 26, 286.5, { url: WA_URL });
      doc.setTextColor(muted[0], muted[1], muted[2]); doc.textWithLink("station@okdock.mx", x + 92, 286.5, { url: "mailto:station@okdock.mx" });
    }
    return doc.output("datauristring");
  };

  /** data-URI → Blob URL (la descarga por data-URI falla en muchos móviles). */
  window.OKShopTicketBlobUrl = function (order) {
    var uri = window.OKShopTicket(order);
    if (!uri) return null;
    try {
      var b64 = uri.split(",")[1], bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    } catch (e) { return null; }
  };

  /** Dispara la descarga/visualización del recibo. */
  window.OKShopTicketDownload = function (order) {
    var url = window.OKShopTicketBlobUrl(order);
    if (!url) return false;
    var a = document.createElement("a");
    a.href = url; a.download = "recibo-" + (order.code || "okstation") + ".pdf";
    a.rel = "noopener"; a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return true;
  };
})();

/* ============================================================
   Ok.station — Configurador de pedidos (Fase 2, front)
   Subida (PDF/imagen) → configuración independiente por archivo →
   costo en tiempo real → crear pedido → ticket PDF con QR.
   Habla con /backend/api (orders/*). Requiere sesión.
   ============================================================ */
(function () {
  "use strict";

  var API = "/backend/api";
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  /* Solo corre donde existe el configurador (pedido.html o embebido en #fotos del home). */
  if (!document.getElementById("order-drop")) return;

  /* En páginas dedicadas (body[data-requires-auth], p. ej. pedido.html) exigimos sesión al entrar.
     Embebido en el home (público) el builder se explora libre; el login se pide al subir o enviar. */
  if (document.body.hasAttribute("data-requires-auth") && !token()) {
    window.location.href = "cuenta.html"; return;
  }
  function requireAuth() {
    if (token()) return true;
    try { sessionStorage.setItem("oks_intended", location.href); } catch (e) {}
    window.location.href = "cuenta.html";
    return false;
  }

  /* ── Catálogo de precios OFICIAL Ok.station (estimado en cliente; el servidor recalcula).
     `price` es el precio "desde" (por hoja) que se muestra como pista. El cálculo real
     usa la tabla escalonada PRINT_TIERS/PHOTO de abajo. ── */
  var SIZES = [
    { id: "carta",        label: "Carta (8.5×11\")",      price: 1.30 },
    { id: "oficio",       label: "Oficio (8.5×13\")",     price: 1.50 },
    { id: "tabloide",     label: "Doble carta (11×17\")", price: 5 },
    { id: "a4",           label: "A4 (21×29.7 cm)",       price: 1.30 },
    { id: "foto_10x15",   label: "Foto 10×15 (6×4\")",    price: 10 },
    { id: "foto_13x18",   label: "Foto 13×18 (5×7\")",    price: 30 },
    { id: "gran_formato_foto", label: "Gran formato 24×36\" — foto Gloss", price: 380 },
    { id: "gran_formato_bond", label: "Gran formato 24×36\" — hoja bond",  price: 190 }
  ];
  /* Precio por HOJA según tamaño + B/N|Color + tramo de cantidad (hojas TOTALES = páginas×copias). */
  var PRINT_TIERS = {
    carta:    { bn: [[10, 2.0], [60, 1.5], [Infinity, 1.3]], color: [[10, 12], [60, 9], [Infinity, 5]] },
    a4:       { bn: [[10, 2.0], [60, 1.5], [Infinity, 1.3]], color: [[10, 12], [60, 9], [Infinity, 5]] },
    oficio:   { bn: [[10, 2.5], [50, 2.0], [Infinity, 1.5]], color: [[10, 15], [50, 13], [Infinity, 10]] },
    tabloide: { bn: [[Infinity, 5]],                          color: [[Infinity, 20]] }
  };
  var PHOTO  = { foto_10x15: 10, foto_13x18: 30, gran_formato_foto: 380, gran_formato_bond: 190 };   /* precio por foto/impresión (plano) */
  var COLOR  = { color: "color", bn: "bn" };         /* solo Color y B/N (catálogo Hoja2) */
  var SIDES  = { una: 1, doble: 1 };                 /* doble cara NO cambia el precio (regla Ok.station) */
  /* Enmicado: precio POR HOJA según el TAMAÑO del documento (catálogo Hoja2).
     Oficio y A4 quedan PENDIENTES (sin recargo de enmicado hasta definir su precio). */
  var ENMICADO = { carta: 20, tabloide: 30 };
  /* Acabados de precio plano. Engargolado queda PENDIENTE: precio temporal $45 hasta
     definir el grosor por número de hojas (chico/mediano/grande). */
  var FINISH_FLAT = { ninguno: 0, engargolado: 45 };
  var PAPERS = ["Bond", "Opalina", "Couché", "Fotográfico", "Cartulina", "Adhesivo"];

  var TAX = 0.08;   /* IVA 8% (los precios del catálogo ya lo incluyen) */
  var files = [];        // {fileId, name, mime, pages, size, thumb, cfg}

  /* ── Formatos permitidos (validación en cliente; el backend revalida) ── */
  var ALLOWED_EXT  = ["pdf", "jpg", "jpeg", "png", "webp"];
  var ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
  function fileExt(name) { var m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ""; }
  function typeOk(file) {
    var ext = fileExt(file.name), mime = (file.type || "").toLowerCase();
    var extOk = ALLOWED_EXT.indexOf(ext) !== -1;
    var mimeOk = mime ? ALLOWED_MIME.indexOf(mime) !== -1 : true; /* si no hay MIME, validamos por extensión */
    return extOk && mimeOk;
  }

  /* ── Utilidades ── */
  var $ = function (s, c) { return (c || document).querySelector(s); };
  function mxn(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function sizeById(id) { for (var i = 0; i < SIZES.length; i++) if (SIZES[i].id === id) return SIZES[i]; return SIZES[0]; }
  function alertErr(msg) { var a = $("#order-alert"); a.className = "order-alert order-alert--error"; a.textContent = msg; a.hidden = !msg; }

  function tierFor(tiers, count) {
    for (var i = 0; i < tiers.length; i++) { if (count <= tiers[i][0]) return tiers[i][1]; }
    return tiers[tiers.length - 1][1];
  }
  /* Precio POR HOJA/unidad REAL para mostrar en cada opción (según tamaño, color y cantidad).
     Devuelve null si se cotiza (gran formato). En fotos el color no afecta (precio plano). */
  function perSheetFor(size, color, count) {
    if (PHOTO[size] != null) return PHOTO[size];
    var t = PRINT_TIERS[size];
    if (!t) return null;
    var band = (COLOR[color] === "color") ? t.color : t.bn;
    return tierFor(band, count);
  }
  function priceOf(f) {
    var size = f.cfg.size;
    var count = Math.max(1, (f.pages || 1) * (f.cfg.copies || 1));   /* hojas totales */
    if (PHOTO[size] != null) {                                       /* fotos: precio por unidad */
      var u = PHOTO[size];
      return { unit: u, line: Math.round(u * count * 100) / 100, quote: false };
    }
    var t = PRINT_TIERS[size];
    if (!t) return { unit: 0, line: 0, quote: true };                /* gran formato → cotizar */
    var band = (COLOR[f.cfg.color] === "color") ? t.color : t.bn;
    var per = tierFor(band, count);
    var sidesMult = (f.cfg.sides === "doble") ? 2 : 1;   /* doble cara DUPLICA el precio de impresión */
    /* Acabado: enmicado se cobra POR HOJA según el tamaño; los demás (engargolado) son precio plano. */
    var finishCost = (f.cfg.finish === "enmicado") ? (ENMICADO[size] || 0) * count : (FINISH_FLAT[f.cfg.finish] || 0);
    var line = per * count * sidesMult + finishCost;
    return { unit: Math.round(per * 100) / 100, line: Math.round(line * 100) / 100, quote: false };
  }

  /* ── Subida ── */
  function uploadOne(file) {
    var fd = new FormData();
    fd.append("file", file);
    return fetch(API + "/orders/upload.php", {
      method: "POST",
      headers: { Authorization: "Bearer " + token() },
      body: fd
    }).then(function (r) { return r.json(); });
  }

  function addFiles(list) {
    if (!requireAuth()) return;
    alertErr("");
    Array.prototype.forEach.call(list, function (file) {
      if (!typeOk(file)) {
        alertErr("«" + file.name + "» no es un formato permitido. Acepta PDF, JPG, PNG o WEBP.");
        return;
      }
      var isImg = /^image\//.test(file.type);
      var thumb = isImg ? URL.createObjectURL(file) : null;
      uploadOne(file).then(function (res) {
        if (!res || !res.ok) { alertErr((res && res.error) || ("No se pudo subir " + file.name)); return; }
        files.push({
          fileId: res.file.id,
          name: res.file.original_name,
          mime: res.file.mime_type,
          pages: res.file.pages || 1,
          size: res.file.size_bytes,
          thumb: thumb,
          cfg: { size: isImg ? "foto_10x15" : "carta", color: isImg ? "color" : "bn", paper: "Bond", sides: "una", finish: "ninguno", copies: 1 }
        });
        render();
      });
    });
  }

  /* ── Render de tarjetas por archivo ── */
  function render() {
    var host = $("#order-files");
    host.innerHTML = files.map(function (f, i) {
      var p = priceOf(f);
      var count = Math.max(1, (f.pages || 1) * (f.cfg.copies || 1));   /* hojas totales para el tramo */
      /* Opciones de Color con su precio por hoja REAL (en impresión/copia; en foto el precio es plano). */
      var colorOpts = PRINT_TIERS[f.cfg.size]
        ? [["color", "Color · " + mxn(perSheetFor(f.cfg.size, "color", count))], ["bn", "B/N · " + mxn(perSheetFor(f.cfg.size, "bn", count))]]
        : [["color", "Color"], ["bn", "B/N"]];
      /* Opciones de Acabado con su precio (enmicado por hoja según tamaño; engargolado plano pendiente). */
      var finishOpts = [
        { v: "ninguno", t: "Ninguno" },
        { v: "engargolado", t: "Engargolado · " + mxn(45) },
        { v: "enmicado", t: "Enmicado" + (ENMICADO[f.cfg.size] ? (" · " + mxn(ENMICADO[f.cfg.size]) + "/hoja") : "") }
      ];
      var thumb = f.thumb
        ? '<img class="file-card__thumb" src="' + f.thumb + '" alt="">'
        : '<span class="file-card__thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>';
      return '<div class="file-card" data-i="' + i + '">' +
        '<div class="file-card__top">' + thumb +
          '<div class="file-card__meta"><b>' + esc(f.name) + '</b><span>' + f.pages + ' pág. · ' + Math.round(f.size / 1024) + ' KB</span></div>' +
          '<span class="file-card__price' + (p.quote ? ' file-card__price--quote' : '') + '">' + (p.quote ? "Cotización personalizada" : mxn(p.line)) + '</span>' +
          '<button class="file-card__remove" data-rm="' + i + '" aria-label="Quitar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</div>' +
        '<div class="file-cfg">' +
          cfgSelect(i, "size", "Tamaño", SIZES.map(function (s) {
            var pu = perSheetFor(s.id, f.cfg.color, count);
            var tag = (pu == null) ? " · cotizar" : (" · " + mxn(pu));
            return { v: s.id, t: s.label + tag };
          }), f.cfg.size) +
          cfgSeg(i, "color", "Color", colorOpts, f.cfg.color) +
          cfgSelect(i, "paper", "Papel", PAPERS.map(function (p2) { return { v: p2, t: p2 }; }), f.cfg.paper) +
          cfgSeg(i, "sides", "Caras", [["una", "Una"], ["doble", "Doble"]], f.cfg.sides) +
          cfgSelect(i, "finish", "Acabado", finishOpts, f.cfg.finish) +
          cfgQty(i, f.cfg.copies) +
        '</div>' +
        (p.quote ? '<p class="file-card__note">Gran formato 24": cotización personalizada — te confirmamos por WhatsApp.</p>' : '') +
      '</div>';
    }).join("");

    wire();
    renderSummary();
    $("#order-submit").disabled = files.length === 0;
  }

  function cfgSelect(i, key, label, opts, val) {
    var id = "fcfg-" + i + "-" + key;
    return '<div class="file-cfg__row"><label for="' + id + '">' + label + '</label><select id="' + id + '" data-i="' + i + '" data-k="' + key + '">' +
      opts.map(function (o) { return '<option value="' + o.v + '"' + (o.v === val ? " selected" : "") + '>' + esc(o.t) + '</option>'; }).join("") +
      '</select></div>';
  }
  function cfgSeg(i, key, label, opts, val) {
    return '<div class="file-cfg__row"><label>' + label + '</label><div class="seg">' +
      opts.map(function (o) { return '<button type="button" data-i="' + i + '" data-k="' + key + '" data-v="' + o[0] + '" class="' + (o[0] === val ? "is-on" : "") + '">' + o[1] + '</button>'; }).join("") +
      '</div></div>';
  }
  function cfgQty(i, val) {
    return '<div class="file-cfg__row"><label>Copias</label><div class="qty">' +
      '<button type="button" data-qm="' + i + '">−</button><span>' + val + '</span><button type="button" data-qp="' + i + '">+</button></div></div>';
  }

  function wire() {
    var host = $("#order-files");
    Array.prototype.forEach.call(host.querySelectorAll("select[data-k]"), function (sel) {
      sel.addEventListener("change", function () { files[+sel.dataset.i].cfg[sel.dataset.k] = sel.value; render(); });
    });
    Array.prototype.forEach.call(host.querySelectorAll(".seg button"), function (b) {
      b.addEventListener("click", function () { files[+b.dataset.i].cfg[b.dataset.k] = b.dataset.v; render(); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-qm]"), function (b) {
      b.addEventListener("click", function () { var f = files[+b.dataset.qm]; f.cfg.copies = Math.max(1, f.cfg.copies - 1); render(); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-qp]"), function (b) {
      b.addEventListener("click", function () { var f = files[+b.dataset.qp]; f.cfg.copies = Math.min(500, f.cfg.copies + 1); render(); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-rm]"), function (b) {
      b.addEventListener("click", function () { files.splice(+b.dataset.rm, 1); render(); });
    });
  }

  /* Descripción legible de la configuración de un archivo (tamaño · color · acabado). */
  function fileDesc(f) {
    var parts = [sizeById(f.cfg.size).label];
    if (PRINT_TIERS[f.cfg.size]) parts.push(f.cfg.color === "color" ? "Color" : "B/N");
    if (PRINT_TIERS[f.cfg.size] && f.cfg.sides === "doble") parts.push("Doble cara");
    if (f.cfg.finish && f.cfg.finish !== "ninguno") parts.push(f.cfg.finish.charAt(0).toUpperCase() + f.cfg.finish.slice(1));
    return parts.join(" · ");
  }
  function renderSummary() {
    var copies = 0, totalIncl = 0;
    /* Los precios del catálogo son IVA INCLUIDO (como en el ticket de mostrador):
       el TOTAL = suma de líneas; el subtotal y el IVA se desglosan a partir del total. */
    files.forEach(function (f) { var p = priceOf(f); copies += f.cfg.copies; totalIncl += p.line; });
    totalIncl = Math.round(totalIncl * 100) / 100;
    var subtotal = Math.round(totalIncl / (1 + TAX) * 100) / 100;
    var tax = Math.round((totalIncl - subtotal) * 100) / 100;
    /* Detalle por archivo: el cliente ve QUÉ pidió y CUÁNTO cuesta cada uno. */
    var detail = $("#sum-detail");
    if (detail) {
      detail.innerHTML = files.map(function (f) {
        var p = priceOf(f);
        var count = Math.max(1, (f.pages || 1) * (f.cfg.copies || 1));
        var isPhoto = PHOTO[f.cfg.size] != null;
        var qtyTxt = isPhoto
          ? (count + (count === 1 ? " foto" : " fotos"))
          : ((f.pages || 1) + " pág × " + (f.cfg.copies || 1) + " = " + count + (count === 1 ? " hoja" : " hojas"));
        var unitTxt = p.quote ? "" : (isPhoto ? (mxn(p.unit) + " c/u") : (mxn(p.unit) + "/hoja" + (f.cfg.sides === "doble" ? " × 2 caras" : "")));
        var right = p.quote ? "Cotización" : mxn(p.line);
        return '<div class="order-summary__item">' +
          '<div class="order-summary__item-top"><span class="order-summary__item-name">' + esc(f.name) + '</span><b>' + right + '</b></div>' +
          '<div class="order-summary__item-sub">' + esc(fileDesc(f)) + ' · ' + esc(qtyTxt) + (unitTxt ? (' · ' + esc(unitTxt)) : '') + '</div>' +
          '</div>';
      }).join("");
    }
    $("#sum-files").textContent = files.length;
    $("#sum-copies").textContent = copies;
    $("#sum-subtotal").textContent = mxn(subtotal);
    $("#sum-tax").textContent = mxn(tax);
    $("#sum-total").textContent = mxn(totalIncl);
  }

  /* Precios de referencia CON TRAMOS por cantidad (para que el cliente sepa cuánto baja por volumen). */
  function tiersText(tiers) {
    var prev = 0, parts = [];
    for (var i = 0; i < tiers.length; i++) {
      var max = tiers[i][0], price = tiers[i][1];
      var range = (max === Infinity) ? ((prev + 1) + " o +") : ((prev + 1) + "–" + max);
      parts.push(range + ": " + mxn(price));
      prev = max;
    }
    return parts.join("  ·  ");
  }
  /* Filas de la tabla de referencia (se usan dentro del modal). */
  function referenceRowsHtml() {
    function row(label, val) { return '<li><span>' + esc(label) + '</span><b>' + esc(val) + '</b></li>'; }
    return (
      row("Carta — B/N", tiersText(PRINT_TIERS.carta.bn)) +
      row("Carta — Color", tiersText(PRINT_TIERS.carta.color)) +
      row("Oficio — B/N", tiersText(PRINT_TIERS.oficio.bn)) +
      row("Oficio — Color", tiersText(PRINT_TIERS.oficio.color)) +
      row("A4 — B/N", tiersText(PRINT_TIERS.a4.bn)) +
      row("A4 — Color", tiersText(PRINT_TIERS.a4.color)) +
      row("Doble carta", "B/N " + mxn(5) + "  ·  Color " + mxn(20)) +
      row("Foto 10×15 (6×4\")", mxn(10) + " c/u") +
      row("Foto 13×18 (5×7\")", mxn(30) + " c/u") +
      row("Gran formato 24×36\" — foto Gloss", mxn(380) + " c/u") +
      row("Gran formato 24×36\" — hoja bond", mxn(190) + " c/u")
    );
  }
  function closePricesModal() {
    var m = $("#oprices-modal");
    if (m) m.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", pricesOnKey);
  }
  function pricesOnKey(e) { if (e.key === "Escape") closePricesModal(); }
  function openPricesModal() {
    if ($("#oprices-modal")) return;
    var m = document.createElement("div");
    m.id = "oprices-modal";
    m.className = "oprices-modal";
    m.innerHTML =
      '<div class="oprices-modal__overlay" data-close></div>' +
      '<div class="oprices-modal__panel" role="dialog" aria-modal="true" aria-label="Precios de referencia">' +
        '<div class="oprices-modal__head"><h3>Precios de referencia</h3>' +
          '<button type="button" class="oprices-modal__close" data-close aria-label="Cerrar">&times;</button></div>' +
        '<div class="oprices-modal__body">' +
          '<ul class="order-prices__list order-prices__list--tiers">' + referenceRowsHtml() + '</ul>' +
          '<p class="order-prices__note">El precio por hoja baja según la cantidad total. El total final depende de color, acabado y cantidad. El gran formato 24×36" tiene precio fijo (foto Gloss o hoja bond).</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    document.body.style.overflow = "hidden";
    m.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) closePricesModal(); });
    document.addEventListener("keydown", pricesOnKey);
  }
  /* Panel compacto: solo un botón que abre el modal con todos los precios (sin scroll molesto). */
  function renderPrices() {
    var host = $("#order-prices");
    if (!host) return;
    host.innerHTML =
      '<div class="order-prices__ref">' +
        '<div><p class="order-prices__title" style="margin:0">Precios de referencia</p>' +
        '<span class="order-prices__hint">Copias e impresiones por hoja (baja por volumen), fotos y más.</span></div>' +
        '<button type="button" class="btn btn--light btn--sm" id="order-prices-open">Ver precios</button>' +
      '</div>';
    var btn = $("#order-prices-open");
    if (btn) btn.addEventListener("click", openPricesModal);
  }

  /* ── Crear pedido + ticket ── */
  function submit() {
    if (!requireAuth()) return;
    alertErr("");
    if (!files.length) return;
    /* Teléfono OBLIGATORIO: lo usan las trabajadoras para contactar al cliente. */
    var phoneEl = $("#order-phone");
    /* El módulo compartido (assets/phone-cc.js) fuerza dígitos y añade el código
       de país; guardamos el número completo "+52 6647194117". */
    var phoneDigits = phoneEl ? String(phoneEl.value).replace(/\D/g, "") : "";
    var phone = (window.OKPhone && phoneEl) ? window.OKPhone.full(phoneEl) : phoneDigits;
    var phoneErr = $("#order-phone-error");
    if (phoneDigits.length < 10) {
      if (phoneErr) { phoneErr.textContent = "Ingresa un teléfono válido a 10 dígitos para poder contactarte."; phoneErr.hidden = false; }
      if (phoneEl) { phoneEl.setAttribute("aria-invalid", "true"); phoneEl.focus(); }
      return;
    }
    if (phoneErr) phoneErr.hidden = true;
    if (phoneEl) phoneEl.removeAttribute("aria-invalid");
    var btn = $("#order-submit"); btn.disabled = true; btn.textContent = "Enviando…";
    var items = files.map(function (f) {
      var p = priceOf(f);
      return { uploaded_file_id: f.fileId, config: f.cfg, qty: f.cfg.copies, unit_price: p.unit, line_total: p.line };
    });
    fetch(API + "/orders/create.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ items: items, comments: $("#order-comments").value.trim(), contact_phone: phone })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) { alertErr((res && res.error) || "No se pudo crear el pedido."); btn.disabled = false; btn.textContent = "Enviar pedido"; return; }
      confirmOrder(res.order);
    }).catch(function () { alertErr("Sin conexión con el servidor."); btn.disabled = false; btn.textContent = "Enviar pedido"; });
  }

  function confirmOrder(order) {
    $("#order-builder").hidden = true;
    $("#confirm-code").textContent = order.code;
    $("#order-confirm").hidden = false;

    var link = $("#confirm-ticket");
    try {
      var dataUri = buildTicket(order);          // PDF en base64 (data URI)
      if (link) {
        // Blob URL: descarga fiable (mejor que un data-URI grande con target=_blank).
        var href = dataUri;
        try {
          var b64 = dataUri.split(",")[1], bin = atob(b64), arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          href = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
        } catch (e2) { /* si falla el blob, usamos el data-URI */ }
        link.href = href;
        link.setAttribute("download", "ticket-" + order.code + ".pdf");
        link.removeAttribute("target");          // descarga en el momento, sin abrir pestaña en blanco
        link.hidden = false;
      }
      // Guarda copia en el servidor y la asocia al pedido
      fetch(API + "/orders/ticket-store.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        body: JSON.stringify({ order_id: order.id, pdf_base64: dataUri })
      });
    } catch (e) {
      /* Si falla el PDF en el cliente, el pedido YA quedó creado: ofrecemos el ticket
         del servidor para que el usuario siempre pueda descargarlo. */
      if (link) {
        link.href = API + "/orders/ticket.php?id=" + encodeURIComponent(order.id);
        link.removeAttribute("download");
        link.textContent = "Descargar ticket PDF";
        link.hidden = false;
      }
    }
    /* Pago en línea del pedido — MISMO motor que el anticipo de citas (Mercado Pago).
       Aparece justo aquí, tras crear el pedido, igual que en el flujo de citas. */
    try { renderOrderPayCTA(order); } catch (e) {}

    /* Dejar la vista EXACTAMENTE en el banner del ticket (¡Pedido recibido! + botón
       de descarga), no al inicio de la página. Esperamos un frame para que el layout
       ya tenga su posición final tras ocultar el builder. */
    var confirmEl = $("#order-confirm");
    if (confirmEl) {
      requestAnimationFrame(function () {
        var top = confirmEl.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: top, behavior: "smooth" });
      });
    }
  }

  /* CTA de pago en línea del pedido (espejo de renderCitaPayCTA en app.js).
     Se inserta dentro del banner "¡Pedido recibido!". El usuario ya está
     autenticado (el envío del pedido exige sesión), así que se puede pagar de una. */
  function renderOrderPayCTA(order) {
    if (!order) return;
    var host = $(".order-done", $("#order-confirm")) || $("#order-confirm");
    if (!host) return;
    var old = $(".order-pay-cta", host); if (old) old.parentNode.removeChild(old);
    var total = +order.total || 0;
    var pay = order.payment_status || "pendiente";
    if (total <= 0 || pay === "pagado") return;   /* sin monto o ya pagado: no se muestra */
    var box = document.createElement("div");
    box.className = "order-pay-cta";
    box.style.cssText = "margin-top:18px;padding-top:16px;border-top:1px solid var(--border-light);text-align:center";
    box.innerHTML =
      '<p style="margin:0 0 6px;font-weight:700;color:var(--text-strong)">Se necesita el pago para poder procesar tu pedido.</p>' +
      '<p style="margin:0 0 8px;color:var(--text-muted)">Total a pagar: ' +
        '<b style="color:var(--brand-blue)">' + mxn(total) + '</b></p>' +
      '<button type="button" class="btn btn--primary btn--sm" id="order-pay-btn">Pagar en línea ahora</button>' +
      '<p style="margin:8px 0 0;font-size:.8rem;color:var(--text-muted)">Pago seguro con Mercado Pago. También puedes pagarlo desde “Mis pedidos”.</p>';
    host.appendChild(box);
    var pb = $("#order-pay-btn", box);
    if (pb) pb.addEventListener("click", function () { startOrderPayment(order.id, this); });
  }

  /* Lleva a la página de cobro unificada (pago.html), que decide el método de pago
     (tarjeta en el sitio / Mercado Pago / sandbox) y recalcula el monto en el servidor. */
  function startOrderPayment(orderId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Abriendo…"; }
    window.location.href = "pago.html?order=" + encodeURIComponent(orderId);
  }

  /* Ticket PDF del pedido — MISMO diseño que el comprobante de cita (assets/cita-ticket.js):
     banner degradado con tarjeta de logo, píldora "Comprobante de pedido", QR con leyenda,
     detalle en filas etiqueta/valor y pie fijo (mapa + WhatsApp + franja de marca). */
  function buildTicket(order) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4" });
    var PW = 210, x = 16;

    // Paleta de marca
    var purple = [156, 29, 255], blue = [6, 108, 255], cyan = [0, 198, 255];
    var dark = [15, 23, 42], muted = [110, 122, 140];
    function lerp(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
    function gradBand(x0, y0, w, h) {
      var n = Math.max(2, Math.round(w)), s = w / n;
      for (var i = 0; i < n; i++) { var t = i / (n - 1); var c = t < 0.5 ? lerp(purple, blue, t * 2) : lerp(blue, cyan, (t - 0.5) * 2); doc.setFillColor(c[0], c[1], c[2]); doc.rect(x0 + s * i, y0, s + 0.4, h, "F"); }
    }
    /* Degradado en ÁNGULO recortado a un banner redondeado — idéntico al del ticket de cita. */
    function gradBandAngled(x0, y0, w, h, r, deg) {
      var rad = deg * Math.PI / 180, cosA = Math.cos(rad), sinA = Math.sin(rad);
      var cxA = [0, w, 0, w], cyA = [0, 0, h, h], uMin = Infinity, uMax = -Infinity, k, u;
      for (k = 0; k < 4; k++) { u = cxA[k] * cosA + cyA[k] * sinA; if (u < uMin) uMin = u; if (u > uMax) uMax = u; }
      var R = (uMax - uMin) || 1, px = -sinA, py = cosA, L = Math.sqrt(w * w + h * h) + 4;
      doc.saveGraphicsState();
      doc.roundedRect(x0, y0, w, h, r, r, null).clip().discardPath();
      var du = 1.1, over = 0.5, t, c, b1x, b1y, b2x, b2y;
      for (u = uMin; u < uMax; u += du) {
        t = (u - uMin) / R;
        c = t < 0.5 ? lerp(purple, blue, t * 2) : lerp(blue, cyan, (t - 0.5) * 2);
        doc.setFillColor(c[0], c[1], c[2]);
        b1x = x0 + u * cosA; b1y = y0 + u * sinA;
        b2x = x0 + (u + du + over) * cosA; b2y = y0 + (u + du + over) * sinA;
        doc.triangle(b1x + px * L, b1y + py * L, b1x - px * L, b1y - py * L, b2x - px * L, b2y - py * L, "F");
        doc.triangle(b1x + px * L, b1y + py * L, b2x - px * L, b2y - py * L, b2x + px * L, b2y + py * L, "F");
      }
      doc.restoreGraphicsState();
    }

    // ── Encabezado: banner degradado + tarjeta blanca con logo + píldora ──
    var _logo = (window.OKTicketLogo && window.OKTicketLogo()) || null;   /* logo ya optimizado del ticket de cita */
    (function drawHeader() {
      var MX = 8, bx = MX, by = 8, bw = PW - 2 * MX, bh = 30, br = 8;
      try { gradBandAngled(bx, by, bw, bh, br, -21.3664); }
      catch (e) { gradBand(0, 0, PW, 34); bx = 0; by = 0; bh = 34; }
      /* Tarjeta blanca (izquierda) con el logo oficial centrado. */
      var cw = 66, ch = 20, cx = bx + 6, cy = by + (bh - ch) / 2, cr = 7;
      doc.setFillColor(255, 255, 255); doc.roundedRect(cx, cy, cw, ch, cr, cr, "F");
      if (_logo) {
        var ar = _logo.w / _logo.h, lh = 11, lw = lh * ar, maxw = cw - 12;
        if (lw > maxw) { lw = maxw; lh = lw / ar; }
        doc.addImage(_logo.png, "PNG", cx + (cw - lw) / 2, cy + (ch - lh) / 2, lw, lh);
      } else {
        doc.setFont("helvetica", "bold"); doc.setFontSize(19);
        var t1 = "Ok", t2 = ".station", w1 = doc.getTextWidth(t1), w2 = doc.getTextWidth(t2);
        var tx = cx + (cw - (w1 + w2)) / 2, tyv = cy + ch / 2 + 2.4;
        doc.setTextColor(blue[0], blue[1], blue[2]); doc.text(t1, tx, tyv);
        doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(t2, tx + w1, tyv);
      }
      /* Píldora blanca (derecha) con "Comprobante de pedido". */
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      var plabel = "Comprobante de pedido", pw = doc.getTextWidth(plabel) + 14, ph = 12;
      var pxp = bx + bw - 6 - pw, pyp = by + (bh - ph) / 2;
      doc.setFillColor(255, 255, 255); doc.roundedRect(pxp, pyp, pw, ph, ph / 2, ph / 2, "F");
      doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(plabel, pxp + 7, pyp + ph / 2 + 1.6);
    })();

    // ── QR (lleva a "Mis pedidos") ──
    try {
      var tmp = document.createElement("div");
      new QRCode(tmp, { text: location.origin + "/perfil.html?pedido=" + order.code, width: 160, height: 160 });
      var canvas = tmp.querySelector("canvas");
      if (canvas) {
        doc.addImage(canvas.toDataURL("image/png"), "PNG", PW - x - 38, 44, 38, 38);
        /* Leyenda debajo del QR: a dónde lleva y que hay que iniciar sesión. */
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text("Al escanear el código QR", PW - x - 19, 85.5, { align: "center" });
        doc.text("te mandará a tus pedidos", PW - x - 19, 88.5, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.text("(inicia sesión primero)", PW - x - 19, 91.8, { align: "center" });
      }
    } catch (e) {}

    // ── Emitido + folio + estado ──
    function two(n) { return (n < 10 ? "0" : "") + n; }
    function fmtDateTime(d) { return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + ":" + two(d.getMinutes()); }
    var emitted = order.created_at ? new Date(String(order.created_at).replace(" ", "T")) : new Date();
    doc.setTextColor(muted[0], muted[1], muted[2]); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text("Emitido: " + fmtDateTime(emitted), x, 49);
    doc.setTextColor(dark[0], dark[1], dark[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(String(order.code || ""), x, 57);

    var STAT = { recibido: "Recibido", en_revision: "En revisión", en_produccion: "En producción", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
    var label = STAT[order.status] || order.status || "Recibido";
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); var lw = doc.getTextWidth(label) + 8;
    doc.setFillColor(blue[0], blue[1], blue[2]); doc.roundedRect(x, 61, lw, 7, 3.5, 3.5, "F");
    doc.setTextColor(255, 255, 255); doc.text(label, x + 4, 65.8);

    /* El pie (mapa + contactos) va FIJO al pie; el contenido nunca debe invadirlo. */
    var FOOTER_TOP = 250;   /* límite inferior del área de contenido (mm) */
    var ty = 82;
    doc.setTextColor(blue[0], blue[1], blue[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Detalle del pedido", x, ty); ty += 8;
    function needSpace(h) { if (ty + h > FOOTER_TOP) { doc.addPage(); ty = 22; } }

    // ── Archivos (mismo estilo que "Servicios adicionales" del ticket de cita) ──
    var items = order.items || [];
    for (var ii = 0; ii < items.length; ii++) {
      var it = items[ii];
      var cfg = {};
      if (it.config_json) { try { cfg = typeof it.config_json === "string" ? JSON.parse(it.config_json) : it.config_json; } catch (e) { cfg = {}; } }
      var meta = [cfg.size, cfg.color, cfg.sides, cfg.finish].filter(Boolean).join(" · ");
      meta = (meta ? meta + " · " : "") + "x" + (it.qty || 1);
      var nameLines = doc.splitTextToSize("• " + (it.original_name || "Archivo"), 165);
      var metaLines = doc.splitTextToSize(meta, 160);
      needSpace(nameLines.length * 5 + metaLines.length * 4.6 + 3);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.text(nameLines, x, ty); ty += nameLines.length * 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text(metaLines, x + 5, ty); ty += metaLines.length * 4.6 + 2;
    }

    // ── Totales en filas etiqueta/valor (igual que el desglose del ticket de cita) ──
    ty += 3; needSpace(34);
    var artCount = items.reduce(function (s, it) { return s + (parseInt(it.qty, 10) || 1); }, 0);
    var totalRows = [["No. de artículos", String(artCount)], ["Subtotal", mxn(order.subtotal)], ["IVA (8%)", mxn(order.tax)], ["Total", mxn(order.total)]];
    doc.setFontSize(10.5);
    totalRows.forEach(function (r) {
      doc.setFont("helvetica", "normal"); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(r[0], x, ty);
      doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(String(r[1]), x + 45, ty);
      ty += 8;
    });

    // ── Aviso de pago ──
    needSpace(10);
    ty += 1; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(doc.splitTextToSize("Se necesita el pago para poder procesar tu pedido. Conserva este comprobante con tu folio.", 175), x, ty);

    // ── Pie FIJO: cómo llegar (Google Maps) + WhatsApp ──
    var WA_URL = "https://wa.me/526647194117?text=" + encodeURIComponent("Hola Ok.station, tengo un pedido y quiero confirmar / hacer mi pago.");
    var MAPS_URL = "https://www.google.com/maps/place/Ok.station/@32.5292376,-116.9514835,17z/data=!4m6!3m5!1s0x80d9475a2b534615:0x80c51bb5b3fe8f55!8m2!3d32.5292376!4d-116.9514835!16s%2Fg%2F11k63fhrhb";
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("Dirección: Centro Comercial Otay, Local G-03 · Carretera Aeropuerto 1900, Tijuana, B.C.", x, 262);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(blue[0], blue[1], blue[2]);
    doc.textWithLink("Cómo llegar — abrir en Google Maps", x, 269, { url: MAPS_URL });
    doc.setTextColor(22, 163, 74);   // verde WhatsApp
    doc.textWithLink("WhatsApp: (664) 719-4117 — abrir chat", x, 275.5, { url: WA_URL });
    gradBand(0, 287, PW, 3);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("okstation.mx · You say tech, we listen · Tel. 664 719 4117", x, 283);

    return doc.output("datauristring");
  }

  /* ── Init ── */
  var drop = $("#order-drop"), input = $("#order-input");
  drop.addEventListener("click", function () { input.click(); });
  drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", function () { addFiles(input.files); input.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-drag"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-drag"); }); });
  drop.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  $("#order-submit").addEventListener("click", submit);

  /* Sincroniza el estimado con los precios que el admin haya editado en el panel
     (settings print.prices). Aditivo: si falla, se quedan los valores por defecto. */
  function syncPrices() {
    fetch(API + "/print-prices.php").then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.prices) return;
      var p = j.prices;
      function n(k, d) { return (p[k] != null && !isNaN(p[k])) ? +p[k] : d; }
      PRINT_TIERS.carta = { bn: [[10, n("carta_bn_1", 2)], [60, n("carta_bn_2", 1.5)], [Infinity, n("carta_bn_3", 1.3)]], color: [[10, n("carta_color_1", 12)], [60, n("carta_color_2", 9)], [Infinity, n("carta_color_3", 5)]] };
      PRINT_TIERS.a4 = PRINT_TIERS.carta;
      PRINT_TIERS.oficio = { bn: [[10, n("oficio_bn_1", 2.5)], [50, n("oficio_bn_2", 2)], [Infinity, n("oficio_bn_3", 1.5)]], color: [[10, n("oficio_color_1", 15)], [50, n("oficio_color_2", 13)], [Infinity, n("oficio_color_3", 10)]] };
      PRINT_TIERS.tabloide = { bn: [[Infinity, n("tabloide_bn", 5)]], color: [[Infinity, n("tabloide_color", 20)]] };
      PHOTO.foto_10x15 = n("foto_10x15", 10); PHOTO.foto_13x18 = n("foto_13x18", 30);
      ENMICADO.carta = n("enmicado_carta", 20); ENMICADO.tabloide = n("enmicado_tabloide", 30);
      FINISH_FLAT.engargolado = n("engargolado", 45);
      if (j.tax_rate != null && !isNaN(j.tax_rate)) TAX = +j.tax_rate;
      SIZES.forEach(function (s) {
        if (s.id === "carta" || s.id === "a4") s.price = PRINT_TIERS.carta.bn[2][1];
        else if (s.id === "oficio") s.price = PRINT_TIERS.oficio.bn[2][1];
        else if (s.id === "tabloide") s.price = PRINT_TIERS.tabloide.bn[0][1];
        else if (s.id === "foto_10x15") s.price = PHOTO.foto_10x15;
        else if (s.id === "foto_13x18") s.price = PHOTO.foto_13x18;
      });
      render();
    }).catch(function () { /* sin conexión: se usan los valores por defecto del catálogo */ });
  }

  renderPrices();
  render();
  syncPrices();
})();

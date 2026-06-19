/* ============================================================
   OK.station — Configurador de pedidos (Fase 2, front)
   Subida (PDF/imagen) → configuración independiente por archivo →
   costo en tiempo real → crear pedido → ticket PDF con QR.
   Habla con /backend/api (orders/*). Requiere sesión.
   ============================================================ */
(function () {
  "use strict";

  var API = "/backend/api";
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  /* Guard de sesión */
  if (!token()) { window.location.href = "cuenta.html"; return; }

  /* ── Catálogo de precios (estimado en cliente; el servidor recalcula IVA) ── */
  var SIZES = [
    { id: "carta",        label: "Carta",            price: 1.5 },
    { id: "oficio",       label: "Oficio",           price: 2 },
    { id: "tabloide",     label: "Tabloide",         price: 5 },
    { id: "a4",           label: "A4",               price: 1.5 },
    { id: "foto_10x15",   label: "Foto 10×15",       price: 8 },
    { id: "foto_13x18",   label: "Foto 13×18",       price: 15 },
    { id: "gran_formato", label: "Gran formato 24\"", price: 0 }
  ];
  var COLOR  = { color: 1, grises: 0.8, bn: 0.5 };
  var SIDES  = { una: 1, doble: 0.9 };
  var FINISH = { ninguno: 0, engargolado: 25, enmicado: 15, grapado: 5 };
  var PAPERS = ["Bond", "Opalina", "Couché", "Fotográfico", "Cartulina", "Adhesivo"];

  var TAX = 0.16;
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
  function mxn(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n); }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function sizeById(id) { for (var i = 0; i < SIZES.length; i++) if (SIZES[i].id === id) return SIZES[i]; return SIZES[0]; }
  function alertErr(msg) { var a = $("#order-alert"); a.className = "order-alert order-alert--error"; a.textContent = msg; a.hidden = !msg; }

  function priceOf(f) {
    var base = sizeById(f.cfg.size).price;
    if (base === 0) return { unit: 0, line: 0, quote: true };
    var unit = base * (COLOR[f.cfg.color] || 1) * (SIDES[f.cfg.sides] || 1);
    var line = unit * f.pages * f.cfg.copies + (FINISH[f.cfg.finish] || 0);
    return { unit: Math.round(unit * 100) / 100, line: Math.round(line * 100) / 100, quote: false };
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
            var tag = s.price > 0 ? (" · " + mxn(s.price)) : " · cotizar";
            return { v: s.id, t: s.label + tag };
          }), f.cfg.size) +
          cfgSeg(i, "color", "Color", [["color", "Color"], ["grises", "Grises"], ["bn", "B/N"]], f.cfg.color) +
          cfgSelect(i, "paper", "Papel", PAPERS.map(function (p2) { return { v: p2, t: p2 }; }), f.cfg.paper) +
          cfgSeg(i, "sides", "Caras", [["una", "Una"], ["doble", "Doble"]], f.cfg.sides) +
          cfgSelect(i, "finish", "Acabado", [{ v: "ninguno", t: "Ninguno" }, { v: "engargolado", t: "Engargolado" }, { v: "enmicado", t: "Enmicado" }, { v: "grapado", t: "Grapado" }], f.cfg.finish) +
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

  function renderSummary() {
    var copies = 0, subtotal = 0;
    files.forEach(function (f) { var p = priceOf(f); copies += f.cfg.copies; subtotal += p.line; });
    var tax = Math.round(subtotal * TAX * 100) / 100;
    $("#sum-files").textContent = files.length;
    $("#sum-copies").textContent = copies;
    $("#sum-subtotal").textContent = mxn(subtotal);
    $("#sum-tax").textContent = mxn(tax);
    $("#sum-total").textContent = mxn(subtotal + tax);
  }

  /* Precios de referencia por tamaño, visibles ANTES de subir archivos (U2). */
  function renderPrices() {
    var host = $("#order-prices");
    if (!host) return;
    host.innerHTML =
      '<p class="order-prices__title">Precios base de referencia</p>' +
      '<ul class="order-prices__list">' +
      SIZES.map(function (s) {
        var val = s.price > 0 ? ("desde " + mxn(s.price)) : "Cotización personalizada";
        return '<li><span>' + esc(s.label) + '</span><b>' + esc(val) + '</b></li>';
      }).join("") +
      '</ul>' +
      '<p class="order-prices__note">Precio base por página (documentos) o por copia (fotos). El total depende de color, caras, acabado y cantidad. El gran formato 24" se cotiza por WhatsApp.</p>';
  }

  /* ── Crear pedido + ticket ── */
  function submit() {
    alertErr("");
    if (!files.length) return;
    var btn = $("#order-submit"); btn.disabled = true; btn.textContent = "Enviando…";
    var items = files.map(function (f) {
      var p = priceOf(f);
      return { uploaded_file_id: f.fileId, config: f.cfg, qty: f.cfg.copies, unit_price: p.unit, line_total: p.line };
    });
    fetch(API + "/orders/create.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ items: items, comments: $("#order-comments").value.trim() })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) { alertErr((res && res.error) || "No se pudo crear el pedido."); btn.disabled = false; btn.textContent = "Enviar pedido"; return; }
      confirmOrder(res.order);
    }).catch(function () { alertErr("Sin conexión con el servidor."); btn.disabled = false; btn.textContent = "Enviar pedido"; });
  }

  function confirmOrder(order) {
    $("#order-builder").hidden = true;
    $("#confirm-code").textContent = order.code;
    $("#order-confirm").hidden = false;

    try {
      var dataUri = buildTicket(order);          // PDF en base64 (data URI)
      var link = $("#confirm-ticket");
      link.href = dataUri;
      link.setAttribute("download", "ticket-" + order.code + ".pdf");
      // Guarda copia en el servidor y la asocia al pedido
      fetch(API + "/orders/ticket-store.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        body: JSON.stringify({ order_id: order.id, pdf_base64: dataUri })
      });
    } catch (e) { /* si falla el PDF, el pedido ya quedó creado */ }
    window.scrollTo(0, 0);
  }

  /* Ticket PDF con la identidad de OK.station (degradado de marca, colores y lema). */
  function buildTicket(order) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4" });
    var PW = 210, x = 16;

    // Paleta de marca
    var purple = [156, 29, 255], blue = [6, 108, 255], cyan = [0, 198, 255];
    var dark = [15, 23, 42], muted = [110, 122, 140];
    function lerp(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
    function gradBand(x0, y0, w, h) {
      var n = Math.max(2, Math.round(w));
      var step = w / n;
      for (var i = 0; i < n; i++) {
        var t = i / (n - 1);
        var c = t < 0.5 ? lerp(purple, blue, t * 2) : lerp(blue, cyan, (t - 0.5) * 2);
        doc.setFillColor(c[0], c[1], c[2]);
        doc.rect(x0 + step * i, y0, step + 0.4, h, "F");
      }
    }

    // ── Encabezado con degradado de marca ──
    gradBand(0, 0, PW, 34);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("OK.station", x, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.text("Ticket de pedido", x, 26);

    // ── QR (para consultar el pedido) ──
    try {
      var tmp = document.createElement("div");
      new QRCode(tmp, { text: location.origin + "/perfil.html?pedido=" + order.code, width: 160, height: 160 });
      var canvas = tmp.querySelector("canvas");
      if (canvas) doc.addImage(canvas.toDataURL("image/png"), "PNG", PW - x - 38, 44, 38, 38);
    } catch (e) {}

    // ── Folio + estado ──
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(String(order.code || ""), x, 52);

    var STAT = { recibido: "Recibido", en_revision: "En revisión", en_produccion: "En producción", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
    var label = STAT[order.status] || order.status || "—";
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    var lw = doc.getTextWidth(label) + 8;
    doc.setFillColor(blue[0], blue[1], blue[2]);
    doc.roundedRect(x, 56, lw, 7, 3.5, 3.5, "F");
    doc.setTextColor(255, 255, 255); doc.text(label, x + 4, 60.8);

    // ── Archivos ──
    var ty = 78;
    doc.setTextColor(blue[0], blue[1], blue[2]);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Archivos", x, ty);
    ty += 7;
    (order.items || []).forEach(function (it) {
      var cfg = {};
      if (it.config_json) { try { cfg = typeof it.config_json === "string" ? JSON.parse(it.config_json) : it.config_json; } catch (e) { cfg = {}; } }
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.text("• " + (it.original_name || "Archivo"), x, ty);
      var meta = [cfg.size, cfg.color, cfg.sides, cfg.finish].filter(Boolean).join(" · ");
      meta = (meta ? meta + " · " : "") + "x" + (it.qty || 1);
      doc.setFont("helvetica", "normal"); doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text(doc.splitTextToSize(meta, 120), x + 5, ty + 5);
      ty += 12;
    });

    // ── Totales ──
    ty += 2;
    doc.setDrawColor(230, 233, 238); doc.line(x, ty, x + 95, ty); ty += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text("Subtotal", x, ty); doc.text(mxn(order.subtotal), x + 95, ty, { align: "right" }); ty += 6;
    doc.text("IVA (16%)", x, ty); doc.text(mxn(order.tax), x + 95, ty, { align: "right" }); ty += 9;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(blue[0], blue[1], blue[2]);
    doc.text("Total", x, ty); doc.text(mxn(order.total), x + 95, ty, { align: "right" });

    // ── Pie con línea de marca + lema ──
    gradBand(0, 287, PW, 3);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("okstation.mx · You say tech, we listen", x, 283);

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

  renderPrices();
  render();
})();

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
          '<span class="file-card__price">' + (p.quote ? "Cotizar" : mxn(p.line)) + '</span>' +
          '<button class="file-card__remove" data-rm="' + i + '" aria-label="Quitar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</div>' +
        '<div class="file-cfg">' +
          cfgSelect(i, "size", "Tamaño", SIZES.map(function (s) { return { v: s.id, t: s.label }; }), f.cfg.size) +
          cfgSeg(i, "color", "Color", [["color", "Color"], ["grises", "Grises"], ["bn", "B/N"]], f.cfg.color) +
          cfgSelect(i, "paper", "Papel", PAPERS.map(function (p2) { return { v: p2, t: p2 }; }), f.cfg.paper) +
          cfgSeg(i, "sides", "Caras", [["una", "Una"], ["doble", "Doble"]], f.cfg.sides) +
          cfgSelect(i, "finish", "Acabado", [{ v: "ninguno", t: "Ninguno" }, { v: "engargolado", t: "Engargolado" }, { v: "enmicado", t: "Enmicado" }, { v: "grapado", t: "Grapado" }], f.cfg.finish) +
          cfgQty(i, f.cfg.copies) +
        '</div>' +
      '</div>';
    }).join("");

    wire();
    renderSummary();
    $("#order-submit").disabled = files.length === 0;
  }

  function cfgSelect(i, key, label, opts, val) {
    return '<div class="file-cfg__row"><label>' + label + '</label><select data-i="' + i + '" data-k="' + key + '">' +
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

  function buildTicket(order) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4" });
    var x = 16, y = 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("OK.station", x, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("Ticket de pedido", x, y + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(order.code, x, y + 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("Estado: " + order.status, x, y + 22);

    var ty = y + 34;
    doc.setFont("helvetica", "bold"); doc.text("Archivos", x, ty);
    doc.setFont("helvetica", "normal"); ty += 6;
    (order.items || []).forEach(function (it) {
      var cfg = it.config_json ? (typeof it.config_json === "string" ? JSON.parse(it.config_json) : it.config_json) : {};
      var line = "• " + (it.original_name || "Archivo") + "  —  " + (cfg.size || "") + ", " + (cfg.color || "") + ", x" + it.qty;
      doc.text(doc.splitTextToSize(line, 150), x, ty); ty += 6;
    });

    ty += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Subtotal: " + mxn(order.subtotal), x, ty); ty += 6;
    doc.text("IVA: " + mxn(order.tax), x, ty); ty += 6;
    doc.setFontSize(13); doc.text("Total: " + mxn(order.total), x, ty);

    // QR con el folio (para consultar el pedido)
    try {
      var tmp = document.createElement("div");
      new QRCode(tmp, { text: location.origin + "/perfil.html?pedido=" + order.code, width: 120, height: 120 });
      var canvas = tmp.querySelector("canvas");
      if (canvas) doc.addImage(canvas.toDataURL("image/png"), "PNG", 150, y + 8, 40, 40);
    } catch (e) {}

    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("Gracias por tu pedido · okstation.mx", x, 285);
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

  render();
})();

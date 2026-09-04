(function () {
  "use strict";
  var API = "/backend/api";
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  var host = document.querySelector("#shop-history");
  if (!host || !token()) return;

  var LABELS = { recibido: "Recibido", en_preparacion: "En preparación", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
  var PAY_LABELS = { pendiente: "Pago pendiente", procesando: "Pago en proceso", pagado: "Pagado", error: "Error en el pago", reembolsado: "Reembolsado" };
  function mxn2(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(+n || 0); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function getJSON(path) {
    return fetch(API + "/" + path, { headers: { Authorization: "Bearer " + token() } }).then(function (r) { return r.json(); });
  }
  function post(path, body) {
    return fetch(API + "/" + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function userName() {
    var el = document.querySelector("[data-user-name]");
    var n = el ? el.textContent.trim() : "";
    return (n && n !== "Usuario" && n !== "—") ? n : "";
  }

  var pollTimer = null;
  var generating = {};

  function payBlock(o) {
    var pay = o.payment_status || "pendiente";
    var canceled = o.status === "cancelado";
    var date = o.payment_date ? String(o.payment_date).slice(0, 16).replace("T", " ") : "";

    var chip = '<span class="opay opay--' + esc(pay) + '">' + (PAY_LABELS[pay] || pay) + '</span>';
    var summary =
      '<div class="order-pay__row"><span>Total a pagar</span><b>' + mxn2(o.total) + '</b></div>' +
      (pay === "pagado" && date ? '<div class="order-pay__row order-pay__muted"><span>Fecha de pago</span><span>' + esc(date) + '</span></div>' : '');

    var action = "";
    if (pay === "pagado") {
      action = '<span class="order-pay__done">✓ Compra pagada</span>';
    } else if (canceled) {
      action = '<span class="order-pay__muted">Compra cancelada</span>';
    } else {
      var txt = pay === "error" ? "Reintentar pago" : (pay === "procesando" ? "Continuar pago" : "Pagar ahora");
      action = '<button class="btn btn--primary btn--sm" data-pay="' + o.id + '">' + txt + '</button>';
    }

    return '<div class="order-pay' + (pay === "pagado" ? " order-pay--paid" : "") + '">' +
        '<div class="order-pay__head"><span class="order-pay__title">Pago en línea</span>' + chip + '</div>' +
        '<div class="order-pay__body">' + summary + '</div>' +
        '<div class="order-pay__foot">' + action + '</div>' +
      '</div>';
  }

  function load() {
    host.innerHTML = '<p style="color:var(--text-muted)">Cargando…</p>';
    getJSON("shop/list.php")
      .then(function (res) {
        var list = (res && res.orders) || [];
        var ticketsEnabled = !res || res.tickets_enabled !== false;
        if (!list.length) { host.innerHTML = '<p style="color:var(--text-muted)">Aún no tienes compras de la tienda. ¡Date una vuelta!</p>'; return; }
        host.innerHTML = list.map(function (o) {
          var paid = o.payment_status === "pagado";
          return '<div class="order-row">' +
            '<div><div class="order-row__code">' + esc(o.code) + '</div>' +
            '<div class="order-row__meta">' + (o.items_count || 0) + ' producto(s) · ' + mxn2(o.total) + ' · ' + String(o.created_at).slice(0, 10) +
              (o.ship_mode === "envio" ? ' · Envío a domicilio' : ' · Recoges en tienda') + '</div></div>' +
            '<span class="ostatus ostatus--' + esc(o.status) + '">' + (LABELS[o.status] || o.status) + '</span>' +
            '<div class="order-row__actions">' +
              (ticketsEnabled && paid ? '<button class="btn btn--light btn--sm" data-ticket="' + o.id + '" data-code="' + esc(o.code) + '" data-has="' + (+o.has_ticket ? 1 : 0) + '">Descargar recibo</button>' : '') +
            '</div>' +
            payBlock(o) +
          '</div>';
        }).join("");
        wire();
        if (ticketsEnabled) {
          list.forEach(function (o) {
            if (o.payment_status === "pagado" && !+o.has_ticket && !generating[o.id]) ensureTicket(o.id);
          });
        }
        if (list.some(function (o) { return o.payment_status === "procesando"; })) schedulePoll();
      })
      .catch(function () { host.innerHTML = '<p style="color:var(--color-error)">No se pudo cargar tu historial de compras.</p>'; });
  }

  function schedulePoll() {
    var tries = 0;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      tries++;
      if (tries > 6) { clearInterval(pollTimer); pollTimer = null; return; }
      getJSON("shop/list.php")
        .then(function (res) {
          var list = (res && res.orders) || [];
          if (!list.some(function (o) { return o.payment_status === "procesando"; })) {
            clearInterval(pollTimer); pollTimer = null; load();
          }
        }).catch(function () {});
    }, 4000);
  }

  function waitForLibs(cb, tries) {
    tries = tries || 0;
    if (window.jspdf && window.jspdf.jsPDF && window.OKShopTicket) { cb(); return; }
    if (tries > 25) { cb(); return; }
    setTimeout(function () { waitForLibs(cb, tries + 1); }, 200);
  }

  function buildTicket(id) {
    return getJSON("shop/get.php?id=" + id).then(function (res) {
      if (!res || !res.ok || !res.order) throw new Error("detalle");
      var o = res.order;
      o.name = userName();
      var uri = window.OKShopTicket(o);
      if (!uri) throw new Error("libs");
      return { order: o, uri: uri };
    });
  }

  function ensureTicket(id) {
    generating[id] = true;
    waitForLibs(function () {
      buildTicket(id)
        .then(function (t) { return post("shop/ticket-store.php", { shop_order_id: id, pdf_base64: t.uri }); })
        .then(function (res) {
          if (res && res.ok) {
            var b = host.querySelector('[data-ticket="' + id + '"]');
            if (b) b.dataset.has = "1";
          }
        })
        .catch(function () { generating[id] = false; });
    });
  }

  function downloadTicket(id, code, btn) {
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Descargando…";
    var done = function () { btn.disabled = false; btn.textContent = orig; };

    if (+btn.dataset.has) {
      fetch(API + "/shop/ticket.php?id=" + id, { headers: { Authorization: "Bearer " + token() } })
        .then(function (r) { if (!r.ok) throw new Error("err"); return r.blob(); })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url; a.download = "recibo-" + code + ".pdf";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          done();
        })
        .catch(function () { done(); window.alert("No se pudo descargar el recibo. Revisa tu conexión e inténtalo de nuevo."); });
      return;
    }

    waitForLibs(function () {
      buildTicket(id)
        .then(function (t) {
          window.OKShopTicketDownload(t.order);
          done();
          return post("shop/ticket-store.php", { shop_order_id: id, pdf_base64: t.uri })
            .then(function (res) { if (res && res.ok) btn.dataset.has = "1"; })
            .catch(function () {});
        })
        .catch(function () { done(); window.alert("No se pudo generar el recibo. Recarga la página e inténtalo de nuevo."); });
    });
  }

  function wire() {
    Array.prototype.forEach.call(host.querySelectorAll("[data-ticket]"), function (b) {
      b.addEventListener("click", function () { downloadTicket(+b.dataset.ticket, b.dataset.code, b); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-pay]"), function (b) {
      b.addEventListener("click", function () {
        b.disabled = true; b.textContent = "Abriendo…";
        window.location.href = "pago.html?shop=" + encodeURIComponent(b.dataset.pay);
      });
    });
  }

  load();
})();

/* ============================================================
   OK.station — Historial de pedidos (perfil): listar, repetir, cancelar
   y PAGO EN LÍNEA (iniciar checkout y reflejar el estado del pago).
   ============================================================ */
(function () {
  "use strict";
  var API = "/backend/api";
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  var host = document.querySelector("#orders-history");
  if (!host || !token()) return;

  var LABELS = { recibido: "Recibido", en_revision: "En revisión", en_produccion: "En producción", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
  var PAY_LABELS = { pendiente: "Pago pendiente", procesando: "Pago en proceso", pagado: "Pagado", error: "Error en el pago", reembolsado: "Reembolsado" };
  function mxn(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n); }
  function mxn2(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function post(path, body) {
    return fetch(API + "/" + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }

  var pollTimer = null;

  /* Bloque "Pago en línea" dentro del detalle de cada pedido. */
  function payBlock(o) {
    var pay = o.payment_status || "pendiente";
    var canceled = o.status === "cancelado";
    var hasTotal = (+o.total || 0) > 0;
    var date = o.payment_date ? String(o.payment_date).slice(0, 16).replace("T", " ") : "";

    var chip = '<span class="opay opay--' + esc(pay) + '">' + (PAY_LABELS[pay] || pay) + '</span>';
    var summary =
      '<div class="order-pay__row"><span>Total a pagar</span><b>' + mxn2(+o.total || 0) + '</b></div>' +
      (o.payment_reference ? '<div class="order-pay__row order-pay__muted"><span>Referencia</span><span class="mono">' + esc(o.payment_reference) + '</span></div>' : '') +
      (pay === "pagado" && date ? '<div class="order-pay__row order-pay__muted"><span>Fecha de pago</span><span>' + esc(date) + '</span></div>' : '');

    var action = "";
    if (pay === "pagado") {
      action = '<span class="order-pay__done">✓ Pedido pagado</span>';
    } else if (canceled) {
      action = '<span class="order-pay__muted">Pedido cancelado</span>';
    } else if (!hasTotal) {
      action = '<span class="order-pay__muted">Confirmamos el monto al revisar tus archivos.</span>';
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
    fetch(API + "/orders/list.php", { headers: { Authorization: "Bearer " + token() } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var list = (res && res.orders) || [];
        if (!list.length) { host.innerHTML = '<p style="color:var(--text-muted)">Aún no tienes pedidos. ¡Haz el primero!</p>'; return; }
        host.innerHTML = list.map(function (o) {
          var cancelable = (o.status === "recibido" || o.status === "en_revision");
          return '<div class="order-row">' +
            '<div><div class="order-row__code">' + esc(o.code) + '</div>' +
            '<div class="order-row__meta">' + (o.items_count || 0) + ' archivo(s) · ' + mxn(o.total) + ' · ' + String(o.created_at).slice(0, 10) + '</div></div>' +
            '<span class="ostatus ostatus--' + o.status + '">' + (LABELS[o.status] || o.status) + '</span>' +
            '<div class="order-row__actions">' +
              (+o.has_ticket ? '<button class="btn btn--light btn--sm" data-ticket="' + o.id + '" data-code="' + esc(o.code) + '">Descargar ticket</button>' : '') +
              '<button class="btn btn--light btn--sm" data-repeat="' + o.id + '">Repetir</button>' +
              (cancelable ? '<button class="btn btn--light btn--sm" data-cancel="' + o.id + '">Cancelar</button>' : '') +
            '</div>' +
            payBlock(o) +
          '</div>';
        }).join("");
        wire();
        // Si algún pedido quedó "procesando" (volviste del checkout), refresca el estado.
        if (list.some(function (o) { return o.payment_status === "procesando"; })) schedulePoll();
      })
      .catch(function () { host.innerHTML = '<p style="color:var(--color-error)">No se pudo cargar el historial.</p>'; });
  }

  /* Tras volver del checkout, el webhook puede tardar unos segundos: reintenta. */
  function schedulePoll() {
    var tries = 0;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      tries++;
      if (tries > 6) { clearInterval(pollTimer); pollTimer = null; return; }
      fetch(API + "/orders/list.php", { headers: { Authorization: "Bearer " + token() } })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var list = (res && res.orders) || [];
          if (!list.some(function (o) { return o.payment_status === "procesando"; })) {
            clearInterval(pollTimer); pollTimer = null; load();
          }
        }).catch(function () {});
    }, 4000);
  }

  function startPayment(id, btn) {
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Conectando…";
    post("payments/create.php", { order_id: +id })
      .then(function (res) {
        if (res && res.ok && res.checkout_url) {
          window.location.href = res.checkout_url;   // abre el checkout
          return;
        }
        btn.disabled = false; btn.textContent = orig;
        if (res && res.payment_status === "pagado") { window.alert("Este pedido ya está pagado."); load(); return; }
        window.alert((res && res.error) || "No se pudo iniciar el pago. Inténtalo de nuevo.");
      })
      .catch(function () { btn.disabled = false; btn.textContent = orig; window.alert("Sin conexión con el servidor."); });
  }

  function downloadTicket(id, code, btn) {
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Descargando…";
    fetch(API + "/orders/ticket.php?id=" + id, { headers: { Authorization: "Bearer " + token() } })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status === 404 ? "no-ticket" : "err");
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "ticket-" + code + ".pdf";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        btn.disabled = false; btn.textContent = orig;
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = orig;
        window.alert(e && e.message === "no-ticket"
          ? "El ticket de este pedido aún no está disponible. Si acabas de hacerlo, espera un momento y recarga la página."
          : "No se pudo descargar el ticket. Revisa tu conexión e inténtalo de nuevo.");
      });
  }

  function wire() {
    Array.prototype.forEach.call(host.querySelectorAll("[data-ticket]"), function (b) {
      b.addEventListener("click", function () { downloadTicket(+b.dataset.ticket, b.dataset.code, b); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-repeat]"), function (b) {
      b.addEventListener("click", function () { post("orders/repeat.php", { id: +b.dataset.repeat }).then(load); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-cancel]"), function (b) {
      b.addEventListener("click", function () { if (window.confirm("¿Cancelar este pedido?")) post("orders/cancel.php", { id: +b.dataset.cancel }).then(load); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-pay]"), function (b) {
      b.addEventListener("click", function () { startPayment(b.dataset.pay, b); });
    });
  }

  load();
})();

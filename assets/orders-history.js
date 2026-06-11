/* ============================================================
   OK.station — Historial de pedidos (perfil): listar, repetir, cancelar.
   ============================================================ */
(function () {
  "use strict";
  var API = "/backend/api";
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  var host = document.querySelector("#orders-history");
  if (!host || !token()) return;

  var LABELS = { recibido: "Recibido", en_revision: "En revisión", en_produccion: "En producción", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
  function mxn(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function post(path, body) {
    return fetch(API + "/" + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
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
              '<button class="btn btn--light btn--sm" data-repeat="' + o.id + '">Repetir</button>' +
              (cancelable ? '<button class="btn btn--light btn--sm" data-cancel="' + o.id + '">Cancelar</button>' : '') +
            '</div></div>';
        }).join("");
        wire();
      })
      .catch(function () { host.innerHTML = '<p style="color:var(--color-error)">No se pudo cargar el historial.</p>'; });
  }

  function wire() {
    Array.prototype.forEach.call(host.querySelectorAll("[data-repeat]"), function (b) {
      b.addEventListener("click", function () { post("orders/repeat.php", { id: +b.dataset.repeat }).then(load); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-cancel]"), function (b) {
      b.addEventListener("click", function () { if (window.confirm("¿Cancelar este pedido?")) post("orders/cancel.php", { id: +b.dataset.cancel }).then(load); });
    });
  }

  load();
})();

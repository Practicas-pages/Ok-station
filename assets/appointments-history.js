/* ============================================================
   OK.station — Historial de citas (perfil). Misma experiencia visual
   que "Mis pedidos": lista las citas del usuario autenticado.
   ============================================================ */
(function () {
  "use strict";
  var API = "/backend/api";
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  var host = document.querySelector("#appts-history");
  if (!host || !token()) return;

  var LABELS = { pendiente: "Pendiente", confirmada: "Confirmada", completada: "Completada", cancelada: "Cancelada", no_show: "No asistió" };
  var TRAMITE = { pasaporte: "Pasaporte", visa: "Visa Americana", sentri: "SENTRI / Global Entry", i94: "I-94" };
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  function load() {
    host.innerHTML = '<p style="color:var(--text-muted)">Cargando…</p>';
    fetch(API + "/appointments/mine.php", { headers: { Authorization: "Bearer " + token() } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var list = (res && res.appointments) || [];
        if (!list.length) {
          host.innerHTML = '<p style="color:var(--text-muted)">Aún no tienes citas registradas. ¡Agenda la primera!</p>';
          return;
        }
        host.innerHTML = list.map(function (a) {
          return '<div class="order-row">' +
            '<div><div class="order-row__code">' + esc(a.code) + '</div>' +
            '<div class="order-row__meta">' + esc(TRAMITE[a.tramite] || a.tramite) + ' · ' + esc(a.date) + ' · ' + esc(a.time) + ' hrs · creada ' + String(a.created_at).slice(0, 10) + '</div></div>' +
            '<span class="ostatus ostatus--' + esc(a.status) + '">' + (LABELS[a.status] || a.status) + '</span>' +
            '</div>';
        }).join("");
      })
      .catch(function () { host.innerHTML = '<p style="color:var(--color-error)">No se pudo cargar el historial de citas.</p>'; });
  }

  load();
})();

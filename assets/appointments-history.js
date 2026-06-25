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
  var TRAMITE = {
    pasaporte: "Pasaporte", visa: "Visa Americana", sentri: "SENTRI / Global Entry", i94: "I-94",
    curp: "CURP / Acta", ine: "INE / Credencial", licencia: "Licencia de conducir",
    apostille: "Apostille / Traducción", medica: "Cita médica / Examen"
  };
  var SUBTYPE = { mexicano: "Mexicano", americano: "Americano" };
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  /* Datos por persona (requisitos): JSON guardado en la cita, o []. */
  function parseGuests(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { var p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  }

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
        var canPdf = !!window.OKCitaTicketDownload;
        host.innerHTML = list.map(function (a, i) {
          var svc = esc(TRAMITE[a.tramite] || a.tramite);
          if (a.tramite === "pasaporte" && a.passport_subtype) svc += " (" + esc(SUBTYPE[a.passport_subtype] || a.passport_subtype) + ")";
          var ppl = (parseInt(a.party_size, 10) || 1) > 1 ? " · " + parseInt(a.party_size, 10) + " personas" : "";
          return '<div class="order-row">' +
            '<div><div class="order-row__code">' + esc(a.code) + '</div>' +
            '<div class="order-row__meta">' + svc + ppl + ' · ' + esc(a.date) + ' · ' + esc(a.time) + ' hrs · creada ' + String(a.created_at).slice(0, 10) + '</div></div>' +
            '<div class="order-row__actions">' +
              '<span class="ostatus ostatus--' + esc(a.status) + '">' + (LABELS[a.status] || a.status) + '</span>' +
              (canPdf ? '<button type="button" class="btn btn--light btn--sm cita-dl" data-i="' + i + '">Comprobante</button>' : '') +
            '</div>' +
            '</div>';
        }).join("");
        Array.prototype.forEach.call(host.querySelectorAll(".cita-dl"), function (btn) {
          btn.addEventListener("click", function () {
            var a = list[+btn.dataset.i];
            if (a) window.OKCitaTicketDownload({ code: a.code, tramite: a.tramite, passport_subtype: a.passport_subtype, party_size: a.party_size, date: a.date, time: a.time, status: a.status, name: a.contact_name, phone: a.contact_phone, guests: parseGuests(a.guests_json), services: parseGuests(a.services_json) });
          });
        });
      })
      .catch(function () { host.innerHTML = '<p style="color:var(--color-error)">No se pudo cargar el historial de citas.</p>'; });
  }

  load();
})();

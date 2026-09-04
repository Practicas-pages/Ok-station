(function () {
  "use strict";
  var API = "/backend/api";
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  var host = document.querySelector("#appts-history");
  if (!host || !token()) return;

  var pollTimer = null;
  function schedulePoll() {
    var tries = 0;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      tries++;
      if (tries > 6) { clearInterval(pollTimer); pollTimer = null; return; }
      fetch(API + "/appointments/mine.php", { headers: { Authorization: "Bearer " + token() } })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var list = (res && res.appointments) || [];
          if (!list.some(function (a) { return a.payment_status === "procesando"; })) {
            clearInterval(pollTimer); pollTimer = null; load();
          }
        }).catch(function () {});
    }, 4000);
  }

  var LABELS = { pendiente: "Pendiente", confirmada: "Confirmada", completada: "Completada", cancelada: "Cancelada", no_show: "No asistió" };
  var TRAMITE = {
    pasaporte: "Pasaporte", visa: "Visa Americana", sentri: "SENTRI / Global Entry", i94: "I-94",
    curp: "CURP", acta: "Acta de Nacimiento", ine: "INE / Credencial", licencia: "Licencia de conducir",
    apostille: "Apostille / Traducción", medica: "Cita médica / Examen"
  };
  var SUBTYPE = { mexicano: "Mexicano", americano: "Americano" };
  var ACTA_STATE_NAMES = {
    aguascalientes: "Aguascalientes", baja_california: "Baja California", baja_california_sur: "Baja California Sur",
    campeche: "Campeche", chiapas: "Chiapas", chihuahua: "Chihuahua", ciudad_de_mexico: "Ciudad de México",
    coahuila: "Coahuila", colima: "Colima", durango: "Durango", guanajuato: "Guanajuato", guerrero: "Guerrero",
    hidalgo: "Hidalgo", jalisco: "Jalisco", mexico: "Estado de México", michoacan: "Michoacán", morelos: "Morelos",
    nayarit: "Nayarit", nuevo_leon: "Nuevo León", oaxaca: "Oaxaca", puebla: "Puebla", queretaro: "Querétaro",
    quintana_roo: "Quintana Roo", san_luis_potosi: "San Luis Potosí", sinaloa: "Sinaloa", sonora: "Sonora",
    tabasco: "Tabasco", tamaulipas: "Tamaulipas", tlaxcala: "Tlaxcala", veracruz: "Veracruz", yucatan: "Yucatán",
    zacatecas: "Zacatecas"
  };
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function parseGuests(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { var p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  }

  function startPayment(apptId, btn) {
    if (!apptId) return;
    if (btn) { btn.disabled = true; btn.textContent = "Abriendo…"; }
    location.href = "pago.html?appt=" + encodeURIComponent(apptId);
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
        var mxn = window.OKMxn0 || function (n) { return "$" + (n || 0); };
        host.innerHTML = list.map(function (a, i) {
          var svc = esc(TRAMITE[a.tramite] || a.tramite);
          if (a.tramite === "pasaporte" && a.passport_subtype) svc += " (" + esc(SUBTYPE[a.passport_subtype] || a.passport_subtype) + ")";
          if (a.tramite === "acta" && a.acta_state) svc += " (" + esc(ACTA_STATE_NAMES[a.acta_state] || a.acta_state) + ")";
          var ppl = (parseInt(a.party_size, 10) || 1) > 1 ? " · " + parseInt(a.party_size, 10) + " personas" : "";
          var amount = (a.amount_total != null && +a.amount_total > 0) ? +a.amount_total : 0;
          var closed = (a.status === "cancelada" || a.status === "no_show");
          var requiresPay = (window.OK_APPT_REQUIRE_PAY || ["visa", "pasaporte"]).indexOf(a.tramite) >= 0;
          var unpaid = (a.payment_status !== "pagado");
          var payHtml = "";
          if (amount > 0 && !closed) {
            if (a.payment_status === "pagado") {
              payHtml = '<span class="opay opay--pagado">Pagado</span>';
            } else {
              var lbl = (a.payment_status === "procesando") ? "Continuar pago"
                      : ((requiresPay ? "Pagar para confirmar · " : "Pagar · ") + mxn(amount));
              payHtml = '<button type="button" class="btn btn--primary btn--sm cita-pay" data-i="' + i + '">' + esc(lbl) + '</button>';
            }
          }
          var warn = (requiresPay && amount > 0 && !closed && unpaid)
            ? ' · <span style="color:#B45309;font-weight:600">Falta pago para confirmar</span>' : '';
          var awaitingQuote = (amount <= 0) && !closed &&
            ((+a.needs_quote === 1) || (String(a.needs_quote) === "1")) && !a.quoted_at;
          var quoteNote = awaitingQuote
            ? ' · <span style="color:#B45309;font-weight:600">En cotización — te avisaremos por correo</span>' : '';
          return '<div class="order-row">' +
            '<div><div class="order-row__code">' + esc(a.code) + '</div>' +
            '<div class="order-row__meta">' + svc + ppl + ' · ' + esc(a.date) + ' · ' + esc(a.time) + ' hrs · creada ' + String(a.created_at).slice(0, 10) + warn + quoteNote + '</div></div>' +
            '<div class="order-row__actions">' +
              '<span class="ostatus ostatus--' + esc(a.status) + '">' + (LABELS[a.status] || a.status) + '</span>' +
              payHtml +
              (canPdf ? '<button type="button" class="btn btn--light btn--sm cita-dl" data-i="' + i + '">Comprobante</button>' : '') +
            '</div>' +
            '</div>';
        }).join("");
        Array.prototype.forEach.call(host.querySelectorAll(".cita-dl"), function (btn) {
          btn.addEventListener("click", function () {
            var a = list[+btn.dataset.i];
            if (a) window.OKCitaTicketDownload({ code: a.code, tramite: a.tramite, passport_subtype: a.passport_subtype, acta_state: a.acta_state, party_size: a.party_size, date: a.date, time: a.time, status: a.status, name: a.contact_name, phone: a.contact_phone, guests: parseGuests(a.guests_json), services: parseGuests(a.services_json) });
          });
        });
        Array.prototype.forEach.call(host.querySelectorAll(".cita-pay"), function (btn) {
          btn.addEventListener("click", function () {
            var a = list[+btn.dataset.i];
            if (a) startPayment(a.id, btn);
          });
        });
        if (list.some(function (a) { return a.payment_status === "procesando"; })) schedulePoll();
      })
      .catch(function () { host.innerHTML = '<p style="color:var(--color-error)">No se pudo cargar el historial de citas.</p>'; });
  }

  load();
})();

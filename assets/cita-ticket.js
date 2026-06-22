/* ============================================================
   OK.station — Comprobante PDF de cita (módulo compartido)
   Expone window.OKCitaTicket(appt) → data-URI del PDF (o null si faltan libs).
   Reutilizado por: wizard de citas (app.js), "Mis citas" (perfil) y panel admin.
   Requiere jsPDF (window.jspdf) y QRCode cargados en la página.
   appt: { code, tramite, passport_subtype, party_size, date, time, status, name, phone }
   ============================================================ */
(function () {
  "use strict";

  var SERVICE_NAMES = {
    pasaporte: "Pasaporte", visa: "Visa Americana", sentri: "SENTRI / Global Entry", i94: "I-94 / Permiso de Viaje",
    curp: "CURP / Acta", ine: "INE / Credencial", licencia: "Licencia de conducir",
    apostille: "Apostille / Traducción", medica: "Cita médica / Examen"
  };
  var SUBTYPE = { mexicano: "Mexicano", americano: "Americano" };
  var STATUS = { pendiente: "Pendiente de confirmar", confirmada: "Confirmada", completada: "Completada", cancelada: "Cancelada", no_show: "No asistió" };
  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function fmtDate(iso) {
    if (!iso) return "—";
    var p = String(iso).split("-");
    if (p.length < 3) return String(iso);
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear();
  }

  /** @returns {string|null} data-URI del PDF, o null si faltan librerías. */
  window.OKCitaTicket = function (appt) {
    if (!appt || !window.jspdf || !window.jspdf.jsPDF || typeof QRCode === "undefined") return null;
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var PW = 210, x = 16;
    var purple = [156, 29, 255], blue = [6, 108, 255], cyan = [0, 198, 255], dark = [15, 23, 42], muted = [110, 122, 140];
    function lerp(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
    function gradBand(x0, y0, w, h) {
      var n = Math.max(2, Math.round(w)), s = w / n;
      for (var i = 0; i < n; i++) { var t = i / (n - 1); var c = t < 0.5 ? lerp(purple, blue, t * 2) : lerp(blue, cyan, (t - 0.5) * 2); doc.setFillColor(c[0], c[1], c[2]); doc.rect(x0 + s * i, y0, s + 0.4, h, "F"); }
    }
    gradBand(0, 0, PW, 34);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("OK.station", x, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.text("Comprobante de cita", x, 26);
    try {
      var tmp = document.createElement("div");
      new QRCode(tmp, { text: location.origin + "/perfil.html?cita=" + appt.code, width: 160, height: 160 });
      var cv = tmp.querySelector("canvas");
      if (cv) doc.addImage(cv.toDataURL("image/png"), "PNG", PW - x - 38, 44, 38, 38);
    } catch (e) {}
    doc.setTextColor(dark[0], dark[1], dark[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(String(appt.code || ""), x, 52);
    var label = STATUS[appt.status] || "Pendiente de confirmar";
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); var lw = doc.getTextWidth(label) + 8;
    doc.setFillColor(blue[0], blue[1], blue[2]); doc.roundedRect(x, 56, lw, 7, 3.5, 3.5, "F");
    doc.setTextColor(255, 255, 255); doc.text(label, x + 4, 60.8);
    var ty = 80;
    doc.setTextColor(blue[0], blue[1], blue[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Detalle de la cita", x, ty); ty += 8;
    var svcName = SERVICE_NAMES[appt.tramite] || appt.tramite;
    if (appt.tramite === "pasaporte" && appt.passport_subtype) svcName += " (" + (SUBTYPE[appt.passport_subtype] || appt.passport_subtype) + ")";
    var rows = [["Servicio", svcName], ["Personas", String(appt.party_size || 1)]];
    if (appt.name) rows.push(["Nombre", appt.name]);
    if (appt.phone) rows.push(["Teléfono", appt.phone]);
    rows.push(["Fecha", fmtDate(appt.date)]);
    rows.push(["Hora", (appt.time || "") + " hrs"]);
    doc.setFontSize(10.5);
    rows.forEach(function (r) {
      doc.setFont("helvetica", "normal"); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(r[0], x, ty);
      doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(doc.splitTextToSize(String(r[1]), 120), x + 45, ty);
      ty += 8;
    });
    ty += 4; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(doc.splitTextToSize("Te contactaremos para confirmar tu cita. Conserva este comprobante con tu folio.", 120), x, ty);
    /* ── Cómo llegar (Google Maps) ── */
    var MAPS_URL = "https://www.google.com/maps/dir/?api=1&destination=32.5360,-116.9690";
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("Recoge en: Centro Comercial Otay, Local G-03 · Carretera Aeropuerto 1900, Tijuana, B.C.", x, 262);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(blue[0], blue[1], blue[2]);
    doc.textWithLink("Cómo llegar — abrir en Google Maps", x, 269, { url: MAPS_URL });
    gradBand(0, 287, PW, 3); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("okstation.mx · You say tech, we listen", x, 283);
    return doc.output("datauristring");
  };

  /** Dispara la descarga del comprobante (genera + click en <a download>). */
  window.OKCitaTicketDownload = function (appt) {
    var uri = window.OKCitaTicket(appt);
    if (!uri) return false;
    var a = document.createElement("a");
    a.href = uri; a.download = "cita-" + (appt.code || "okstation") + ".pdf";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return true;
  };
})();

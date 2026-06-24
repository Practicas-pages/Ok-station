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
  /* Tipo de trámite por persona (renovación con/sin documentos, etc.). */
  var DOCTYPE = {
    primera:   "Primera vez",
    renov_con: "Renovación con documentos",
    renov_sin: "Renovación sin documentos",
    renovacion: "Renovación"
  };
  var STATUS = { pendiente: "Pendiente de confirmar", confirmada: "Confirmada", completada: "Completada", cancelada: "Cancelada", no_show: "No asistió" };
  /* Contacto de OK.station (WhatsApp canónico, 12 dígitos). */
  var WA_URL = "https://wa.me/526647194117?text=" + encodeURIComponent("Hola OK.station, tengo una cita agendada y quiero confirmar / hacer mi anticipo.");
  var MAPS_URL = "https://www.google.com/maps/place/Ok.station/@32.5292376,-116.9514835,17z/data=!4m6!3m5!1s0x80d9475a2b534615:0x80c51bb5b3fe8f55!8m2!3d32.5292376!4d-116.9514835!16s%2Fg%2F11k63fhrhb";

  /* ── Precios OFICIALES de trámite/cita (MXN, por persona). Los no listados se cotizan. ── */
  var CITA_PRICES = { pasaporte: 200, visa: 800, sentri: 900, ine: 80, curp: 35 };
  var CITA_TAX = 0.08;   /* IVA 8% (los precios ya lo incluyen, como el ticket de mostrador) */
  function mxn0(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n); }
  function mxn2(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
  /* Devuelve {quote, unit, total, party}. quote=true → "se cotiza" (precio a confirmar). */
  window.OKCitaPrice = function (tramite, subtype, party) {
    party = Math.max(1, parseInt(party, 10) || 1);
    var unit = CITA_PRICES[tramite];
    if (tramite === "pasaporte" && subtype === "americano") unit = undefined; // pasaporte americano → cotizar
    if (unit == null) return { quote: true, party: party };
    return { quote: false, unit: unit, party: party, total: unit * party };
  };
  /* Texto listo para mostrar al cliente. */
  window.OKCitaPriceText = function (tramite, subtype, party) {
    var p = window.OKCitaPrice(tramite, subtype, party);
    if (p.quote) return "Te confirmamos el precio";
    if (p.party > 1) return mxn0(p.unit) + " por persona · Total estimado " + mxn0(p.total) + " (" + p.party + " personas)";
    return mxn0(p.unit);
  };
  /* Filas [etiqueta, valor] de costo para resumen y ticket. Desglosa el IVA 8%
     a partir del total (precio IVA incluido, igual que el ticket de mostrador). */
  window.OKCitaPriceRows = function (tramite, subtype, party) {
    var p = window.OKCitaPrice(tramite, subtype, party);
    if (p.quote) return [["Precio", "Te confirmamos el precio"]];
    var total = p.total;
    var sub = Math.round(total / (1 + CITA_TAX) * 100) / 100;
    var iva = Math.round((total - sub) * 100) / 100;
    var rows = [];
    if (p.party > 1) rows.push(["Concepto", mxn0(p.unit) + " × " + p.party + " personas"]);
    rows.push(["Subtotal", mxn2(sub)]);
    rows.push(["IVA (8%)", mxn2(iva)]);
    rows.push(["Total estimado", mxn0(total)]);
    return rows;
  };
  window.OKMxn0 = mxn0;
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
    /* ── Datos fiscales del negocio (como el ticket de mostrador) ── */
    function two(n) { return (n < 10 ? "0" : "") + n; }
    function fmtDateTime(d) { return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + ":" + two(d.getMinutes()); }
    doc.setTextColor(muted[0], muted[1], muted[2]); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text("Aeropuerto 1900 G03, Ctro. Com. Otay, Tijuana, B.C.", x, 40);
    doc.text("Tel. (664) 623-1595  ·  RFC: RUOJ6704222M5", x, 44.5);
    doc.text("Emitido: " + fmtDateTime(new Date()), x, 49);
    doc.setTextColor(dark[0], dark[1], dark[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(String(appt.code || ""), x, 57);
    var label = STATUS[appt.status] || "Pendiente de confirmar";
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); var lw = doc.getTextWidth(label) + 8;
    doc.setFillColor(blue[0], blue[1], blue[2]); doc.roundedRect(x, 61, lw, 7, 3.5, 3.5, "F");
    doc.setTextColor(255, 255, 255); doc.text(label, x + 4, 65.8);
    /* El pie (mapa + contactos) va FIJO al pie; el contenido nunca debe invadirlo. */
    var FOOTER_TOP = 250;   /* límite inferior del área de contenido (mm) */
    var ty = 82;
    doc.setTextColor(blue[0], blue[1], blue[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Detalle de la cita", x, ty); ty += 8;
    var svcName = SERVICE_NAMES[appt.tramite] || appt.tramite;
    if (appt.tramite === "pasaporte" && appt.passport_subtype) svcName += " (" + (SUBTYPE[appt.passport_subtype] || appt.passport_subtype) + ")";
    var rows = [["Servicio", svcName], ["Personas", String(appt.party_size || 1)]];
    if (appt.name) rows.push(["Contacto", appt.name]);
    if (appt.phone) rows.push(["Teléfono", appt.phone]);
    rows.push(["Fecha", fmtDate(appt.date)]);
    rows.push(["Hora", (appt.time || "") + " hrs"]);
    window.OKCitaPriceRows(appt.tramite, appt.passport_subtype, appt.party_size).forEach(function (pr) { rows.push(pr); });
    doc.setFontSize(10.5);
    rows.forEach(function (r) {
      doc.setFont("helvetica", "normal"); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(r[0], x, ty);
      doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(doc.splitTextToSize(String(r[1]), 120), x + 45, ty);
      ty += 8;
    });

    /* ── Datos de cada persona (requisitos capturados en la cita) ── */
    var guests = (appt.guests && appt.guests.length) ? appt.guests : null;
    if (guests) {
      ty += 3;
      doc.setTextColor(blue[0], blue[1], blue[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("Datos de las personas", x, ty); ty += 7;
      for (var gi = 0; gi < guests.length; gi++) {
        if (ty > FOOTER_TOP - 8) {   /* sin espacio: resume el resto */
          doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(muted[0], muted[1], muted[2]);
          doc.text("y " + (guests.length - gi) + " persona(s) más (ver detalle en tu cuenta).", x, ty); ty += 6;
          break;
        }
        var g = guests[gi] || {};
        var dt = g.doctype ? (DOCTYPE[g.doctype] || g.doctype) : "";
        var line = (gi + 1) + ". " + (g.name || "—");
        var sub = [];
        if (g.dob) sub.push("Nac. " + fmtDate(g.dob));
        if (dt) sub.push(dt);
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text(doc.splitTextToSize(line, 170), x, ty); ty += 5;
        if (sub.length) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
          doc.text(sub.join("  ·  "), x + 5, ty); ty += 5.5;
        }
        ty += 1.5;
      }
    }

    if (ty < FOOTER_TOP - 10) {
      ty += 3; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text(doc.splitTextToSize("Se requiere el anticipo del 100% para confirmar tu cita. Conserva este comprobante con tu folio.", 175), x, ty);
    }

    /* ── Pie FIJO: cómo llegar (Google Maps) + WhatsApp ── */
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("Recoge en: Centro Comercial Otay, Local G-03 · Carretera Aeropuerto 1900, Tijuana, B.C.", x, 262);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(blue[0], blue[1], blue[2]);
    doc.textWithLink("Cómo llegar — abrir en Google Maps", x, 269, { url: MAPS_URL });
    doc.setTextColor(22, 163, 74);   /* verde WhatsApp */
    doc.textWithLink("WhatsApp: (664) 719-4117 — abrir chat", x, 275.5, { url: WA_URL });
    gradBand(0, 287, PW, 3); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("okstation.mx · You say tech, we listen", x, 283);
    return doc.output("datauristring");
  };

  /** Convierte el data-URI del PDF en un Blob URL (la descarga por data-URI no
      funciona en muchos navegadores móviles; el Blob URL sí). @returns {string|null} */
  window.OKCitaTicketBlobUrl = function (appt) {
    var uri = window.OKCitaTicket(appt);
    if (!uri) return null;
    try {
      var b64 = uri.split(",")[1];
      var bin = atob(b64);
      var len = bin.length, bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    } catch (e) { return null; }
  };

  /** Dispara la descarga/visualización del comprobante. Usa Blob URL para que
      funcione también en celular (iOS/Android no abren enlaces data-URI). */
  window.OKCitaTicketDownload = function (appt) {
    var url = window.OKCitaTicketBlobUrl(appt);
    if (!url) return false;
    var a = document.createElement("a");
    a.href = url; a.download = "cita-" + (appt.code || "okstation") + ".pdf";
    a.rel = "noopener"; a.target = "_blank";   /* móvil: abre el visor si no descarga */
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return true;
  };
})();

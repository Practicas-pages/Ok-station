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

  /* ============================================================
     CUESTIONARIO POR TRÁMITE (requisitos que el cliente captura por persona).
     Fuente: hojas oficiales de requisitos de OK.station. Se define UNA sola vez
     aquí y lo consumen: el wizard (app.js, para pintar el formulario), el
     comprobante PDF (abajo) y el panel admin (admin.js) — todos muestran las
     mismas etiquetas. Tipos: text | tel | textarea | select | check | date.
     Campos con help = texto de ayuda/ejemplo para que el usuario sepa qué poner.
     ============================================================ */
  var OKQ_CFG = {
    pasaporte_mexicano: [
      { k: "curp",         q: "¿Cuál es tu CURP?",                                   help: "18 caracteres. La encuentras en tu acta o en gob.mx/curp. Ej: GOMC900512MBCNZR09", type: "text" },
      { k: "has_acta",     q: "¿Cuentas con tu acta de nacimiento (original o copia certificada)?", type: "check" },
      { k: "has_domicilio",q: "¿Tienes un comprobante de domicilio reciente?",       help: "Recibo de luz, agua o teléfono (no mayor a 3 meses).", type: "check" },
      { k: "has_ine",      q: "¿Tienes tu credencial de elector (INE)?",             type: "check" },
      { k: "emer_nombre",  q: "Contacto de emergencia: nombre completo",             help: "Una persona que NO viaje contigo.", type: "text" },
      { k: "emer_tel",     q: "Contacto de emergencia: teléfono",                    type: "tel" },
      { k: "emer_dom",     q: "Contacto de emergencia: domicilio",                   type: "text" }
    ],
    pasaporte_americano: [
      { k: "has_pasaporte_us", q: "¿Tienes tu pasaporte americano (libro o tarjeta)?", type: "check" },
      { k: "padres",       q: "Nombre completo de tus padres",                       help: "Ambos padres, si aplica.", type: "text" },
      { k: "padres_nac",   q: "Fecha y lugar de nacimiento de tus padres",           type: "text" },
      { k: "has_acta",     q: "¿Cuentas con tu acta de nacimiento?",                 type: "check" },
      { k: "correo",       q: "Correo electrónico",                                  type: "text" },
      { k: "direccion",    q: "Dirección para recibir el pasaporte",                 help: "Tu dirección permanente o una de EE. UU.", type: "text" },
      { k: "ojos_cabello", q: "Color de ojos y de cabello",                          type: "text" },
      { k: "estatura",     q: "Estatura (pies y pulgadas)",                          help: "Ej: 5'7\"", type: "text" },
      { k: "estado_civil", q: "Estado civil",                                        type: "select", opts: ["Soltero(a)", "Casado(a)", "Divorciado(a)"] }
    ],
    visa: [
      { k: "ocupacion",    q: "¿Cuál es tu ocupación actual?",                       type: "select", opts: ["Trabajador / Empleador", "Pensionado", "Estudiante", "Hogar / Otro"] },
      { k: "empresa",      q: "Nombre del trabajo o escuela",                        help: "Donde trabajas o estudias actualmente.", type: "text" },
      { k: "empresa_dir",  q: "Dirección del trabajo o escuela",                     type: "text" },
      { k: "empresa_tel",  q: "Teléfono del trabajo o escuela",                      type: "tel", optional: true },
      { k: "puesto",       q: "Puesto/actividad o carrera que cursas",               type: "text" },
      { k: "salario",      q: "Salario mensual aproximado",                          help: "Solo si trabajas o estás pensionado.", type: "text", optional: true },
      { k: "paises",       q: "Países que has visitado en los últimos 5 años",       help: "Sepáralos por comas. Si ninguno, escribe 'Ninguno'.", type: "textarea" },
      { k: "redes",        q: "Correo y usuario de redes sociales",                  help: "Facebook, Instagram, etc. (los que tengas).", type: "text", optional: true },
      { k: "acompanantes", q: "¿Quién te acompañará a EE. UU.? (nombre y parentesco)", type: "text", optional: true },
      { k: "padres",       q: "Nombre de tus padres y su fecha de nacimiento",       type: "text" },
      { k: "conyuge",      q: "Cónyuge: nombre completo, fecha y lugar de nacimiento", help: "Solo si estás casado(a) o en unión libre.", type: "text", optional: true },
      { k: "familiares_us",q: "Familiares directos en EE. UU. (ciudadanos o residentes)", help: "Solo hermanos, hijos, padres o cónyuge con visa.", type: "text", optional: true },
      { k: "ultima_visita",q: "Fecha aproximada de tu última visita a EE. UU.",      help: "Solo si ya has tenido visa.", type: "text", optional: true },
      { k: "estudios",     q: "Último grado de estudios (escuela, fechas y grado)",  type: "text" }
    ],
    sentri: [
      { k: "doc_ingreso",  q: "¿Con qué documento ingresas a EE. UU.?",              type: "select", opts: ["Pasaporte americano", "Tarjeta de residente (green card)", "Visa americana"] },
      { k: "has_doc_ingreso", q: "¿Ese documento está vigente?",                     type: "check" },
      { k: "empleo",       q: "Empleo: empresa, dirección, teléfono y puesto",       type: "textarea" },
      { k: "rfc",          q: "RFC vigente",                                         type: "text" },
      { k: "direccion",    q: "Dirección y teléfono personal (celular y casa)",      type: "text" },
      { k: "direccion_us", q: "Dirección en EE. UU. (para recibir la tarjeta SENTRI)", type: "text" },
      { k: "paises",       q: "Países visitados en los últimos 5 años",              help: "Descarta EE. UU. y Canadá.", type: "textarea" },
      { k: "add_vehiculo", q: "¿Deseas añadir un vehículo?",                         type: "check", optional: true },
      { k: "vehiculo",     q: "Datos del vehículo (licencia vigente y tarjeta de circulación)", type: "text", optional: true }
    ]
  };
  function okqKey(tramite, subtype) {
    if (tramite === "pasaporte") return subtype === "americano" ? "pasaporte_americano" : "pasaporte_mexicano";
    if (tramite === "visa") return "visa";
    if (tramite === "sentri") return "sentri";
    return null;
  }
  /* Devuelve los campos del cuestionario para un trámite/subtipo/tipo de trámite. */
  function okqFields(tramite, subtype, doctype) {
    var key = okqKey(tramite, subtype);
    var arr = (key && OKQ_CFG[key]) ? OKQ_CFG[key].slice() : [];
    /* La visa láser solo se pide en renovación. */
    if (tramite === "visa" && (doctype === "renov_con" || doctype === "renov_sin")) {
      arr = [{ k: "visa_laser", q: "¿Tienes tu visa láser actual o vencida?", help: "Solo para renovación.", type: "check" }].concat(arr);
    }
    return arr;
  }
  var OKQ_LABELS = { visa_laser: "¿Tienes tu visa láser actual o vencida?" };
  Object.keys(OKQ_CFG).forEach(function (k) { OKQ_CFG[k].forEach(function (f) { OKQ_LABELS[f.k] = f.q; }); });
  window.OKQ = {
    fields: okqFields,
    label: function (k) { return OKQ_LABELS[k] || k; },
    /* Texto legible de un valor de respuesta (checkbox → Sí/No). */
    valueText: function (v) {
      if (v === true) return "Sí";
      if (v === false) return "No";
      return (v == null || v === "") ? "—" : String(v);
    }
  };
  /* Contacto de OK.station (WhatsApp canónico, 12 dígitos). */
  var WA_URL = "https://wa.me/526647194117?text=" + encodeURIComponent("Hola OK.station, tengo una cita agendada y quiero confirmar / hacer mi anticipo.");
  var MAPS_URL = "https://www.google.com/maps/place/Ok.station/@32.5292376,-116.9514835,17z/data=!4m6!3m5!1s0x80d9475a2b534615:0x80c51bb5b3fe8f55!8m2!3d32.5292376!4d-116.9514835!16s%2Fg%2F11k63fhrhb";

  /* ── Precios de trámite/cita (MXN, por persona, IVA incluido). Los no listados se cotizan. ──
     Estos valores por defecto coinciden con la semilla del servidor (settings appt.prices);
     al cargar la página se sincronizan con el panel vía /appointments/prices.php (abajo). */
  var CITA_PRICES = { pasaporte: 200, pasaporte_americano: 400, visa: 800, sentri: 900, ine: 80, curp: 35 };
  var CITA_TAX = 0.08;   /* IVA 8% (los precios ya lo incluyen, como el ticket de mostrador) */
  function mxn0(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n); }
  function mxn2(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
  /* Resuelve el precio unitario: usa el catálogo del servidor (OK_APPT_PRICES, claves
     'pasaporte_mexicano'…) si ya se cargó; si no, los valores por defecto de arriba. */
  function apptUnit(tramite, subtype) {
    var srv = window.OK_APPT_PRICES;
    if (srv && typeof srv === "object") {
      var key = (tramite === "pasaporte") ? ("pasaporte_" + (subtype === "americano" ? "americano" : "mexicano")) : tramite;
      return srv[key];
    }
    var unit = CITA_PRICES[tramite];
    if (tramite === "pasaporte" && subtype === "americano") unit = CITA_PRICES.pasaporte_americano; // formato $200 + cita = $400
    return unit;
  }
  /* Devuelve {quote, unit, total, party}. quote=true → "se cotiza" (precio a confirmar). */
  window.OKCitaPrice = function (tramite, subtype, party) {
    party = Math.max(1, parseInt(party, 10) || 1);
    var unit = apptUnit(tramite, subtype);
    if (unit == null || +unit <= 0) return { quote: true, party: party };
    return { quote: false, unit: +unit, party: party, total: +unit * party };
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
  /* Sincroniza precios/IVA con el panel (público). Si falla, se quedan los defaults.
     No bloquea el render: el resumen del wizard se construye al llegar al último paso. */
  try {
    fetch("/backend/api/appointments/prices.php")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.prices) window.OK_APPT_PRICES = j.prices;
        if (j && j.require_payment) window.OK_APPT_REQUIRE_PAY = j.require_payment;
        if (j && j.tax_rate) CITA_TAX = +j.tax_rate;
      })
      .catch(function () {});
  } catch (e) {}
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

    /* El detalle por persona (datos del cuestionario) NO va en el comprobante:
       este es el RECIBO del cliente. Toda esa información va en el EXPEDIENTE
       (window.OKCitaExpedientePDF), que descarga el trabajador desde el panel. */
    function needSpace(h) { if (ty + h > FOOTER_TOP) { doc.addPage(); ty = 22; } }

    /* ── Servicios adicionales seleccionados (venta cruzada) ── */
    var services = (appt.services && appt.services.length) ? appt.services : null;
    if (services) {
      ty += 3; needSpace(14);
      doc.setTextColor(blue[0], blue[1], blue[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("Servicios adicionales", x, ty); ty += 7;
      for (var si = 0; si < services.length; si++) {
        var sv = services[si] || {};
        var slabel = sv.label || sv.key || "";
        var slines = doc.splitTextToSize("• " + slabel, 165);
        needSpace(slines.length * 5 + 1);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text(slines, x + 5, ty); ty += slines.length * 5;
      }
      ty += 2;
    }

    needSpace(10);
    ty += 3; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(doc.splitTextToSize("Se requiere el anticipo del 100% para confirmar tu cita. Conserva este comprobante con tu folio.", 175), x, ty);

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

  /* ============================================================
     EXPEDIENTE (PDF para el TRABAJADOR) — distinto del comprobante/ticket.
     Documento limpio con TODA la información que llenó el cliente de CADA
     persona de la cita (datos, respuestas del cuestionario y documentos
     subidos). Sin QR, sin precio, sin datos fiscales: es para operar el trámite.
     appt: { code, tramite, passport_subtype, party_size, date, time, status,
             name, phone, guests:[{name,dob,doctype,answers}], files:[...] }
     ============================================================ */
  window.OKCitaExpedientePDF = function (appt) {
    if (!appt || !window.jspdf || !window.jspdf.jsPDF) return null;   /* no requiere QRCode */
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var PW = 210, x = 16, RIGHT = PW - 16;
    var blue = [6, 108, 255], dark = [15, 23, 42], muted = [110, 122, 140], rule = [225, 229, 238];
    var ty, CONTENT_BOTTOM = 280;
    function two(n) { return (n < 10 ? "0" : "") + n; }
    function nowStr() { var d = new Date(); return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + ":" + two(d.getMinutes()); }
    function needSpace(h) { if (ty + h > CONTENT_BOTTOM) { doc.addPage(); ty = 22; } }

    /* Encabezado sobrio (navy) */
    doc.setFillColor(10, 31, 77); doc.rect(0, 0, PW, 24, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("OK.station", x, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("Expediente de la cita", x, 18);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(String(appt.code || ""), RIGHT, 15, { align: "right" });

    ty = 34;
    var svcName = SERVICE_NAMES[appt.tramite] || appt.tramite;
    if (appt.tramite === "pasaporte" && appt.passport_subtype) svcName += " (" + (SUBTYPE[appt.passport_subtype] || appt.passport_subtype) + ")";
    var nPeople = appt.party_size || (appt.guests && appt.guests.length) || 1;
    var info = [
      ["Servicio", svcName],
      ["Fecha", fmtDate(appt.date) + (appt.time ? "   ·   " + appt.time + " hrs" : "")],
      ["Personas", String(nPeople)],
      ["Contacto", (appt.name || "—") + (appt.phone ? "   ·   " + appt.phone : "")],
    ];
    doc.setFontSize(10);
    info.forEach(function (r) {
      doc.setFont("helvetica", "normal"); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(r[0], x, ty);
      doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(doc.splitTextToSize(String(r[1]), 135), x + 32, ty);
      ty += 7;
    });
    ty += 1; doc.setDrawColor(rule[0], rule[1], rule[2]); doc.line(x, ty, RIGHT, ty); ty += 9;

    /* Documentos agrupados por persona (guest_index). */
    var filesByGuest = {};
    (appt.files || []).forEach(function (f) {
      var gi = (f.guest_index === 0 || f.guest_index) ? parseInt(f.guest_index, 10) : NaN;
      if (!isNaN(gi)) (filesByGuest[gi] = filesByGuest[gi] || []).push(f);
    });

    var guests = (appt.guests && appt.guests.length) ? appt.guests : [{}];
    doc.setTextColor(blue[0], blue[1], blue[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    needSpace(10); doc.text("Información de las personas (" + guests.length + ")", x, ty); ty += 8;

    for (var gi = 0; gi < guests.length; gi++) {
      var g = guests[gi] || {};
      needSpace(18);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.text(doc.splitTextToSize((gi + 1) + ".  " + (g.name || "—"), 175), x, ty); ty += 5.5;
      var sub = [];
      if (g.dob) sub.push("Nac. " + fmtDate(g.dob));
      if (g.doctype) sub.push(DOCTYPE[g.doctype] || g.doctype);
      if (sub.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(sub.join("   ·   "), x + 5, ty); ty += 6; }

      /* Respuestas del cuestionario (etiqueta tenue, valor en negrita). */
      var ans = g.answers || {}, akeys = Object.keys(ans);
      if (akeys.length) {
        for (var ai = 0; ai < akeys.length; ai++) {
          var lbl = window.OKQ ? window.OKQ.label(akeys[ai]) : akeys[ai];
          var val = window.OKQ ? window.OKQ.valueText(ans[akeys[ai]]) : String(ans[akeys[ai]]);
          var lblLines = doc.splitTextToSize(lbl, 168);
          var valLines = doc.splitTextToSize(String(val || "—"), 168);
          needSpace((lblLines.length + valLines.length) * 4.4 + 3);
          doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]);
          doc.text(lblLines, x + 5, ty); ty += lblLines.length * 4.2;
          doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]);
          doc.text(valLines, x + 5, ty); ty += valLines.length * 4.6 + 2;
        }
      } else {
        doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.text("Sin respuestas capturadas.", x + 5, ty); ty += 6;
      }

      /* Documentos subidos por esta persona. */
      var gf = filesByGuest[gi] || [];
      needSpace(8);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(blue[0], blue[1], blue[2]);
      doc.text("Documentos subidos:", x + 5, ty); ty += 5;
      if (gf.length) {
        for (var fi = 0; fi < gf.length; fi++) {
          var dn = (gf[fi].doc_label || gf[fi].doc_key || "Documento") + (gf[fi].original_name ? "  (" + gf[fi].original_name + ")" : "");
          var dlines = doc.splitTextToSize("•  " + dn, 163);
          needSpace(dlines.length * 4.4);
          doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(dark[0], dark[1], dark[2]);
          doc.text(dlines, x + 8, ty); ty += dlines.length * 4.4;
        }
      } else {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.text("Ninguno (el cliente puede traerlos físicos el día de la cita).", x + 8, ty); ty += 5;
      }

      ty += 4;
      if (gi < guests.length - 1) { doc.setDrawColor(rule[0], rule[1], rule[2]); doc.line(x, ty, RIGHT, ty); ty += 7; }
    }

    /* Pie con numeración en todas las páginas. */
    var total = doc.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(rule[0], rule[1], rule[2]); doc.line(x, 286, RIGHT, 286);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text("Expediente generado el " + nowStr() + "  ·  OK.station", x, 291);
      doc.text("Página " + p + " de " + total, RIGHT, 291, { align: "right" });
    }
    return doc.output("datauristring");
  };

  window.OKCitaExpedienteBlobUrl = function (appt) {
    var uri = window.OKCitaExpedientePDF(appt);
    if (!uri) return null;
    try {
      var b64 = uri.split(",")[1], bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    } catch (e) { return null; }
  };

  /** Descarga/visualiza el EXPEDIENTE (datos de las personas) para el trabajador. */
  window.OKCitaExpedienteDownload = function (appt) {
    var url = window.OKCitaExpedienteBlobUrl(appt);
    if (!url) return false;
    var a = document.createElement("a");
    a.href = url; a.download = "expediente-" + (appt.code || "okstation") + ".pdf";
    a.rel = "noopener"; a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return true;
  };
})();

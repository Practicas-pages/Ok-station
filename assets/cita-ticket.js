/* ============================================================
   Ok.station — Comprobante PDF de cita (módulo compartido)
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
     Fuente: hojas oficiales de requisitos de Ok.station. Se define UNA sola vez
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
      { k: "estado_civil", q: "Estado civil",                                        type: "select", opts: ["Soltero(a)", "Casado(a)", "Divorciado(a)"] },
      { k: "tipo_pasaporte_us", q: "Tipo de pasaporte que tramitas (Libro o Tarjeta)", type: "select", opts: ["Libro", "Tarjeta"] },
      { k: "emer_us_nombre", q: "Contacto de emergencia en EE. UU.: nombre completo", type: "text" },
      { k: "emer_us_dir",    q: "Contacto de emergencia en EE. UU.: dirección completa", type: "text" },
      { k: "emer_us_tel",    q: "Contacto de emergencia en EE. UU.: teléfono",         help: "Opcional.", type: "tel", optional: true },
      { k: "conyuge",        q: "Cónyuge: nombre, fecha y lugar de nacimiento, y fecha de matrimonio o divorcio", help: "Solo si estás casado(a) o divorciado(a).", type: "text", optional: true }
    ],
    visa: [
      { k: "ocupacion",    q: "¿Cuál es tu ocupación actual?",                       type: "select", opts: ["Trabajador / Empleador", "Pensionado", "Estudiante", "Hogar / Otro"] },
      { k: "direccion_casa", q: "Tu dirección actual (domicilio)",                   type: "text" },
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
      { k: "empleo",       q: "Historial laboral (últimos 5 años): empresa, dirección, teléfono, puesto y fechas", type: "textarea" },
      { k: "rfc",          q: "RFC vigente",                                         help: "Solo para Global Entry.", type: "text", optional: true },
      { k: "direccion",    q: "Dirección y teléfono personal (celular y casa)",      type: "text" },
      { k: "vivienda",     q: "Historial de vivienda (últimos 5 años): direcciones y fechas", type: "textarea" },
      { k: "direccion_us", q: "Dirección en EE. UU. (para recibir la tarjeta SENTRI)", type: "text" },
      { k: "paises",       q: "Países visitados en los últimos 5 años",              help: "Descarta EE. UU. y Canadá.", type: "textarea" },
      { k: "add_vehiculo", q: "¿Deseas añadir un vehículo?",                         type: "check", optional: true },
      { k: "vehiculo",     q: "Datos del vehículo (licencia vigente y tarjeta de circulación)", type: "text", optional: true }
    ],
    i94: [
      { k: "i94_fecha", q: "Fecha aproximada de tu último ingreso a EE. UU.",        type: "text", optional: true },
      { k: "i94_lugar", q: "Lugar/puerto de ingreso (garita o aeropuerto)",          type: "text", optional: true },
      { k: "i94_doc",   q: "Documento con el que ingresaste (visa, pasaporte, etc.)", type: "text", optional: true }
    ],
    medica: [
      { k: "med_tramite", q: "¿Para qué trámite necesitas el examen médico?",        help: "Ej. visa, residencia o ajuste de estatus.", type: "text", optional: true }
    ]
  };
  function okqKey(tramite, subtype) {
    if (tramite === "pasaporte") return subtype === "americano" ? "pasaporte_americano" : "pasaporte_mexicano";
    if (tramite === "visa") return "visa";
    if (tramite === "sentri") return "sentri";
    if (tramite === "i94") return "i94";
    if (tramite === "medica") return "medica";
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
  /* Contacto de Ok.station (WhatsApp canónico, 12 dígitos). */
  var WA_URL = "https://wa.me/526647194117?text=" + encodeURIComponent("Hola Ok.station, tengo una cita agendada y quiero confirmar / hacer mi pago.");
  var MAPS_URL = "https://www.google.com/maps/place/Ok.station/@32.5292376,-116.9514835,17z/data=!4m6!3m5!1s0x80d9475a2b534615:0x80c51bb5b3fe8f55!8m2!3d32.5292376!4d-116.9514835!16s%2Fg%2F11k63fhrhb";

  /* Logo oficial para el encabezado del comprobante. Se precarga una vez y se
     convierte a PNG (jsPDF no incrusta WebP directamente). Si aún no cargó o falla
     la carga, el ticket usa el texto "Ok.station" como respaldo: nunca rompe la
     generación del PDF. Misma ruta que usa el header/footer del sitio. */
  var LOGO_SRC = "assets/img/okstation-logo.webp";
  var _ticketLogo = null;   /* { png, w, h } una vez lista */
  (function preloadTicketLogo() {
    try {
      if (typeof Image === "undefined") return;
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) return;
          /* IMPORTANTE: reducir el logo antes de incrustarlo. El original mide
             ~7826px de ancho; a resolución completa el PNG resultante inflaba el
             PDF a ~41 MB y el comprobante se rechazaba por tamaño (send-receipt.php
             corta a 5 MB) → el correo NUNCA se enviaba. En el ticket el logo se
             dibuja a ~54 mm, así que 640px de ancho sobra para verse nítido y deja
             el PDF en ~200 KB. Se conserva la proporción (w/h no cambia). */
          var MAXW = 640;
          var scale = w > MAXW ? (MAXW / w) : 1;
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var c = document.createElement("canvas");
          c.width = cw; c.height = ch;
          c.getContext("2d").drawImage(img, 0, 0, cw, ch);
          _ticketLogo = { png: c.toDataURL("image/png"), w: cw, h: ch };
        } catch (e) {}
      };
      img.src = LOGO_SRC;
    } catch (e) {}
  })();
  /* Logo ya optimizado del ticket; lo reutiliza el comprobante de pedido (order.js)
     para dibujar el mismo encabezado de marca. Devuelve null si aún no cargó. */
  window.OKTicketLogo = function () { return _ticketLogo; };

  /* ── Precios de trámite/cita (MXN, por persona, IVA incluido). Los no listados se cotizan. ──
     Estos valores por defecto coinciden con la semilla del servidor (settings appt.prices);
     al cargar la página se sincronizan con el panel vía /appointments/prices.php (abajo). */
  var CITA_PRICES = { pasaporte: 200, pasaporte_americano: 400, visa: 800, sentri: 900, ine: 80, curp: 35, i94: 200, licencia: 40 };
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
    if (p.party > 1) return mxn0(p.unit) + " por persona · Total " + mxn0(p.total) + " (" + p.party + " personas)";
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
    rows.push(["Total", mxn0(total)]);
    return rows;
  };
  window.OKMxn0 = mxn0;
  /* Ya hay catálogo (los defaults de arriba): pinta los precios de las tarjetas de
     trámite YA, sin esperar al servidor, para que nunca salga "a cotizar" por lentitud. */
  if (window.OKRenderTramitePrices) { try { window.OKRenderTramitePrices(); } catch (e) {} }
  /* Sincroniza precios/IVA con el panel (público). Si falla, se quedan los defaults.
     No bloquea el render: el resumen del wizard se construye al llegar al último paso. */
  try {
    fetch("/backend/api/appointments/prices.php")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.prices) window.OK_APPT_PRICES = j.prices;
        if (j && j.require_payment) window.OK_APPT_REQUIRE_PAY = j.require_payment;
        if (j && j.tax_rate) CITA_TAX = +j.tax_rate;
        /* Re-pinta con los precios vigentes del servidor (por si difieren de los defaults). */
        if (window.OKRenderTramitePrices) { try { window.OKRenderTramitePrices(); } catch (e) {} }
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
    var PW = 210, x = 16, RIGHT = PW - 16, CW = RIGHT - x;
    var purple = [156, 29, 255], blue = [6, 108, 255], cyan = [0, 198, 255],
        dark = [15, 23, 42], muted = [110, 122, 140], rule = [228, 232, 240], green = [22, 163, 74];
    function lerp(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
    function gradBand(x0, y0, w, h) {
      var n = Math.max(2, Math.round(w)), s = w / n;
      for (var i = 0; i < n; i++) { var t = i / (n - 1); var c = t < 0.5 ? lerp(purple, blue, t * 2) : lerp(blue, cyan, (t - 0.5) * 2); doc.setFillColor(c[0], c[1], c[2]); doc.rect(x0 + s * i, y0, s + 0.4, h, "F"); }
    }
    function two(n) { return (n < 10 ? "0" : "") + n; }
    function dt(d) { return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + ":" + two(d.getMinutes()); }
    function sdate(iso) { if (!iso) return "—"; var p = String(iso).split("-"); if (p.length < 3) return String(iso); return two(+p[2]) + "/" + two(+p[1]) + "/" + p[0]; }

    /* ── Franja de marca + título de comprobante de pago ── */
    gradBand(0, 0, PW, 3);
    doc.setTextColor(dark[0], dark[1], dark[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(25);
    doc.text("Comprobante", x, 24);
    doc.text("de pago", x, 34);
    if (_ticketLogo) {
      var ar = _ticketLogo.w / _ticketLogo.h, lh = 9, lw = lh * ar; if (lw > 52) { lw = 52; lh = lw / ar; }
      doc.addImage(_ticketLogo.png, "PNG", RIGHT - lw, 15, lw, lh);
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("OK.station", RIGHT, 22, { align: "right" });
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("Una marca de OK Dock", RIGHT, 30, { align: "right" });

    /* ── DE (negocio) ── */
    var dy = 50;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("DE", x, dy);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text("Ok.station", x, dy + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("Centro Comercial Otay, Local G-03", x, dy + 11.5);
    doc.text("Carretera Aeropuerto 1900", x, dy + 16);
    doc.text("22425 Tijuana, B.C.", x, dy + 20.5);

    /* ── Metadatos (folio de la cita y fechas), apilados a la derecha ── */
    var meta = [["EMITIDO", dt(new Date())], ["N° DE CITA", String(appt.code || "—")],
                ["FECHA DE CITA", sdate(appt.date) + (appt.time ? " · " + appt.time + " hrs" : "")]];
    var my = dy;
    meta.forEach(function (r) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(r[0], RIGHT, my, { align: "right" }); my += 3.8;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]);
      var vl = doc.splitTextToSize(String(r[1]), 70); doc.text(vl, RIGHT, my, { align: "right" }); my += vl.length * 4.4 + 2.5;
    });

    /* ── CLIENTE ── */
    var cyc = dy + 30;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("CLIENTE", x, cyc);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(String(appt.name || "—"), x, cyc + 6);
    if (appt.phone) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("Tel. " + appt.phone, x, cyc + 11); }

    /* ── Tabla de conceptos (arranca justo bajo CLIENTE; el QR va al pie) ── */
    var ty = cyc + 18;
    var descX = x + 14, unitR = RIGHT - 30, impR = RIGHT;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("CANT.", x, ty); doc.text("DESCRIPCIÓN", descX, ty);
    doc.text("P. UNITARIO", unitR, ty, { align: "right" }); doc.text("IMPORTE", impR, ty, { align: "right" });
    ty += 2.5; doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.4); doc.line(x, ty, RIGHT, ty); ty += 6.5;

    var svcName = SERVICE_NAMES[appt.tramite] || appt.tramite;
    if (appt.tramite === "pasaporte" && appt.passport_subtype) svcName += " (" + (SUBTYPE[appt.passport_subtype] || appt.passport_subtype) + ")";
    var pr = window.OKCitaPrice(appt.tramite, appt.passport_subtype, appt.party_size);
    var items = [];
    if (pr.quote) items.push({ qty: pr.party, desc: "Gestión de cita — " + svcName, unit: "", imp: "Te confirmamos el precio" });
    else items.push({ qty: pr.party, desc: "Gestión de cita — " + svcName, unit: mxn2(pr.unit), imp: mxn2(pr.total) });
    (appt.services || []).forEach(function (sv) { items.push({ qty: 1, desc: sv.label || sv.key || "Servicio adicional", unit: "", imp: "—" }); });

    items.forEach(function (it) {
      var dl = doc.splitTextToSize(String(it.desc), unitR - 10 - descX);
      var rh = Math.max(6, dl.length * 4.6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.text(String(it.qty), x + 1, ty);
      doc.text(dl, descX, ty);
      doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(String(it.unit || ""), unitR, ty, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(String(it.imp), impR, ty, { align: "right" });
      ty += rh; doc.setDrawColor(242, 244, 248); doc.setLineWidth(0.3); doc.line(x, ty - 1.5, RIGHT, ty - 1.5); ty += 1.5;
    });

    /* ── Totales (subtotal / IVA a la derecha, TOTAL en barra) ── */
    var rowsT = window.OKCitaPriceRows(appt.tramite, appt.passport_subtype, appt.party_size);
    var sub = null, iva = null, ivaLbl = "IVA", tot = null;
    rowsT.forEach(function (r) {
      if (/subtotal/i.test(r[0])) sub = r[1];
      else if (/iva/i.test(r[0])) { ivaLbl = r[0]; iva = r[1]; }
      else if (/total/i.test(r[0])) tot = r[1];
    });
    ty += 4;
    if (sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("Subtotal", unitR, ty, { align: "right" }); doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(String(sub), impR, ty, { align: "right" }); ty += 6; }
    if (iva) { doc.setFont("helvetica", "normal"); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(ivaLbl, unitR, ty, { align: "right" }); doc.setFont("helvetica", "bold"); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(String(iva), impR, ty, { align: "right" }); ty += 6; }
    ty += 2;
    var barH = 14;
    doc.setFillColor(blue[0], blue[1], blue[2]); doc.roundedRect(x, ty, CW, barH, 3, 3, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("TOTAL", x + 8, ty + barH / 2 + 1.2);
    if (tot) { doc.setFontSize(15); doc.text(String(tot) + " MXN", RIGHT - 8, ty + barH / 2 + 1.6, { align: "right" }); }
    else { doc.setFontSize(11); doc.text("Te confirmamos el precio", RIGHT - 8, ty + barH / 2 + 1.2, { align: "right" }); }
    ty += barH + 12;

    /* ── Condiciones y forma de pago (izquierda) + QR de consulta (derecha) ── */
    var condY = ty;
    var paid = (appt.status === "confirmada" || appt.status === "completada");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("CONDICIONES Y FORMA DE PAGO", x, condY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(dark[0], dark[1], dark[2]);
    var cond = paid
      ? "Pago recibido. Conserva este comprobante con tu folio para el día de tu cita."
      : "Se requiere el pago del 100% para confirmar tu cita. Conserva este comprobante con tu folio.";
    doc.text(doc.splitTextToSize(cond, CW - 42), x, condY + 6);   /* ancho reducido: deja sitio al QR a la derecha */
    /* QR (se conserva: escanear → ver tus citas). Se ancla abajo-derecha, sin encimar. */
    try {
      var tmp = document.createElement("div");
      new QRCode(tmp, { text: location.origin + "/perfil.html?cita=" + appt.code, width: 160, height: 160 });
      var cv = tmp.querySelector("canvas");
      if (cv) {
        var qrS = 24, qy = Math.min(condY - 3, 244), qx = RIGHT - qrS;
        doc.addImage(cv.toDataURL("image/png"), "PNG", qx, qy, qrS, qrS);
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.6); doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.text("Al escanear el código QR", qx + qrS / 2, qy + qrS + 3.2, { align: "center" });
        doc.text("te mandará a tus citas", qx + qrS / 2, qy + qrS + 5.8, { align: "center" });
      }
    } catch (e) {}

    /* ── Pie: contacto (Google Maps / WhatsApp / correo) ── */
    doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.4); doc.line(x, 276, RIGHT, 276);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("Ok.station · Centro Comercial Otay, Local G-03 · Tijuana, B.C.", x, 281);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(blue[0], blue[1], blue[2]);
    doc.textWithLink("Cómo llegar", x, 286.5, { url: MAPS_URL });
    doc.setTextColor(green[0], green[1], green[2]); doc.textWithLink("WhatsApp (664) 719-4117", x + 26, 286.5, { url: WA_URL });
    doc.setTextColor(muted[0], muted[1], muted[2]); doc.textWithLink("station@okdock.mx", x + 92, 286.5, { url: "mailto:station@okdock.mx" });
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
    var MX = 12, PW = 210, x = MX, RIGHT = PW - MX, CW = PW - 2 * MX;
    var blue = [6, 108, 255], purple = [156, 29, 255], teal = [13, 148, 136], navy = [10, 31, 77],
        dark = [15, 23, 42], muted = [110, 122, 140], rule = [225, 229, 238], green = [22, 163, 74], soft = [247, 249, 252];
    var ty, CONTENT_BOTTOM = 274;
    function two(n) { return (n < 10 ? "0" : "") + n; }
    function nowStr() { var d = new Date(); return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + ":" + two(d.getMinutes()); }
    function tint(c, t) { return [Math.round(c[0] + (255 - c[0]) * t), Math.round(c[1] + (255 - c[1]) * t), Math.round(c[2] + (255 - c[2]) * t)]; }
    function needSpace(h) { if (ty + h > CONTENT_BOTTOM) { doc.addPage(); ty = 18; } }
    function labelOf(k) { return window.OKQ ? window.OKQ.label(k) : k; }
    function valueOf(k, ans) { return (window.OKQ ? window.OKQ.valueText(ans[k]) : String(ans[k])) || "—"; }

    /* Agrupación temática de respuestas por trámite (SOLO presentación: ningún dato
       se pierde; lo no clasificado cae en "Otros datos"). */
    var EXP_GROUPS = {
      visa: [
        { t: "Datos personales y estudios", c: blue,   keys: ["ocupacion", "direccion_casa", "empresa", "empresa_dir", "empresa_tel", "puesto", "salario", "estudios", "redes"] },
        { t: "Familia y viajes",            c: purple, keys: ["padres", "conyuge", "familiares_us", "acompanantes", "paises", "ultima_visita", "visa_laser"] }
      ],
      pasaporte_americano: [
        { t: "Datos personales", c: blue,   keys: ["correo", "direccion", "tipo_pasaporte_us", "estado_civil", "ojos_cabello", "estatura", "has_pasaporte_us", "has_acta"] },
        { t: "Familia",          c: purple, keys: ["padres", "padres_nac"] },
        { t: "Emergencia y cónyuge", c: teal, keys: ["emer_us_nombre", "emer_us_dir", "emer_us_tel", "conyuge"] }
      ],
      pasaporte_mexicano: [
        { t: "Documentos y CURP",      c: blue,   keys: ["curp", "has_acta", "has_domicilio", "has_ine"] },
        { t: "Contacto de emergencia", c: purple, keys: ["emer_nombre", "emer_tel", "emer_dom"] }
      ],
      sentri: [
        { t: "Ingreso y empleo",   c: blue,   keys: ["doc_ingreso", "has_doc_ingreso", "empleo", "rfc"] },
        { t: "Domicilio y viajes", c: purple, keys: ["direccion", "vivienda", "direccion_us", "paises", "add_vehiculo", "vehiculo"] }
      ]
    };
    function buildGroups(ans) {
      var akeys = Object.keys(ans), key = okqKey(appt.tramite, appt.passport_subtype);
      var cfg = key ? EXP_GROUPS[key] : null, out = [], used = {};
      if (cfg) cfg.forEach(function (grp) {
        var fields = [];
        grp.keys.forEach(function (kk) { if (Object.prototype.hasOwnProperty.call(ans, kk)) { fields.push({ label: labelOf(kk), value: valueOf(kk, ans) }); used[kk] = 1; } });
        if (fields.length) out.push({ t: grp.t, c: grp.c, fields: fields });
      });
      var rest = akeys.filter(function (k) { return !used[k]; });
      if (rest.length) out.push({ t: cfg ? "Otros datos" : "Datos capturados", c: cfg ? teal : blue, fields: rest.map(function (k) { return { label: labelOf(k), value: valueOf(k, ans) }; }) });
      return out;
    }
    /* Encabezado de sección: barra suave con acento de color. */
    function groupHeader(title, c) {
      needSpace(13);
      var hh = 8, bg = tint(c, 0.86);
      doc.setFillColor(bg[0], bg[1], bg[2]); doc.roundedRect(x, ty, CW, hh, 2, 2, "F");
      doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(x, ty, 2.4, hh, 1, 1, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(c[0], c[1], c[2]);
      doc.text(String(title).toUpperCase(), x + 6, ty + 5.4);
      ty += hh + 4;
    }
    /* Rejilla de 2 columnas etiqueta/valor. */
    function fieldsGrid(fields) {
      var gap = 8, colW = (CW - gap) / 2, wrap = colW - 1;
      for (var i = 0; i < fields.length; i += 2) {
        var L = fields[i], R = fields[i + 1];
        var lLab = doc.splitTextToSize(L.label, wrap), lVal = doc.splitTextToSize(String(L.value), wrap);
        var rLab = R ? doc.splitTextToSize(R.label, wrap) : [], rVal = R ? doc.splitTextToSize(String(R.value), wrap) : [];
        var lH = lLab.length * 3.7 + lVal.length * 4.4 + 3, rH = R ? (rLab.length * 3.7 + rVal.length * 4.4 + 3) : 0;
        var rowH = Math.max(lH, rH);
        needSpace(rowH + 2);
        var top = ty, rx = x + colW + gap;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(lLab, x, top);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(lVal, x, top + lLab.length * 3.7 + 1.5);
        if (R) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(rLab, rx, top);
          doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(rVal, rx, top + rLab.length * 3.7 + 1.5);
        }
        ty = top + rowH;
      }
    }

    /* ── Encabezado navy con folio + estado ── */
    var hy = 10, hh = 24, hr = 6;
    doc.setFillColor(navy[0], navy[1], navy[2]); doc.roundedRect(x, hy, CW, hh, hr, hr, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("OK.station", x + 8, hy + 10.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(200, 210, 230); doc.text("Expediente de la cita", x + 8, hy + 17.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 255, 255); doc.text(String(appt.code || ""), RIGHT - 8, hy + 10.5, { align: "right" });
    var stTxt = STATUS[appt.status] || "Pendiente de confirmar";
    var okState = (appt.status === "confirmada" || appt.status === "completada");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    var bw = doc.getTextWidth(stTxt) + 9, bxx = RIGHT - 8 - bw, byy = hy + 14.5;
    var bf = okState ? green : [255, 255, 255], bt = okState ? [255, 255, 255] : navy;
    doc.setFillColor(bf[0], bf[1], bf[2]); doc.roundedRect(bxx, byy, bw, 6.5, 3.25, 3.25, "F");
    doc.setFillColor(bt[0], bt[1], bt[2]); doc.circle(bxx + 3.4, byy + 3.25, 0.9, "F");
    doc.setTextColor(bt[0], bt[1], bt[2]); doc.text(stTxt, bxx + 6, byy + 4.4);

    /* ── Banda de datos de la cita (2×2) ── */
    ty = hy + hh + 6;
    var bandH = 26;
    doc.setFillColor(soft[0], soft[1], soft[2]); doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.3); doc.roundedRect(x, ty, CW, bandH, 4, 4, "FD");
    var svcName = SERVICE_NAMES[appt.tramite] || appt.tramite;
    if (appt.tramite === "pasaporte" && appt.passport_subtype) svcName += " (" + (SUBTYPE[appt.passport_subtype] || appt.passport_subtype) + ")";
    var nPeople = appt.party_size || (appt.guests && appt.guests.length) || 1;
    var cells = [
      { c: blue,   k: "SERVICIO", v: svcName },
      { c: purple, k: "FECHA",    v: fmtDate(appt.date) + (appt.time ? " · " + appt.time + " hrs" : "") },
      { c: teal,   k: "PERSONAS", v: String(nPeople) },
      { c: green,  k: "CONTACTO", v: (appt.name || "—") + (appt.phone ? " · " + appt.phone : "") }
    ];
    var cellW = CW / 2;
    cells.forEach(function (cell, idx) {
      var col = idx % 2, row = Math.floor(idx / 2);
      var cx = x + 6 + col * cellW, cyr = ty + 9 + row * 12;
      var chip = tint(cell.c, 0.8);
      doc.setFillColor(chip[0], chip[1], chip[2]); doc.roundedRect(cx, cyr - 5, 7, 7, 1.6, 1.6, "F");
      doc.setFillColor(cell.c[0], cell.c[1], cell.c[2]); doc.roundedRect(cx + 2.1, cyr - 2.9, 2.8, 2.8, 0.6, 0.6, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(cell.k, cx + 10, cyr - 1.4);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(doc.splitTextToSize(String(cell.v), cellW - 15), cx + 10, cyr + 3);
    });
    ty += bandH + 8;

    /* Documentos agrupados por persona (guest_index). */
    var filesByGuest = {};
    (appt.files || []).forEach(function (f) {
      var gi2 = (f.guest_index === 0 || f.guest_index) ? parseInt(f.guest_index, 10) : NaN;
      if (!isNaN(gi2)) (filesByGuest[gi2] = filesByGuest[gi2] || []).push(f);
    });

    var guests = (appt.guests && appt.guests.length) ? appt.guests : [{}];
    for (var gi = 0; gi < guests.length; gi++) {
      var g = guests[gi] || {};
      needSpace(20);
      var pchip = tint(blue, 0.8);
      doc.setFillColor(pchip[0], pchip[1], pchip[2]); doc.roundedRect(x, ty - 4.2, 5.5, 5.5, 1.4, 1.4, "F");
      doc.setTextColor(blue[0], blue[1], blue[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5);
      doc.text("Persona " + (gi + 1) + "  ·  " + (g.name || "—"), x + 8, ty); ty += 5.5;
      var sub = [];
      if (g.dob) sub.push("Nac. " + fmtDate(g.dob));
      if (g.doctype) sub.push(DOCTYPE[g.doctype] || g.doctype);
      if (sub.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text(sub.join("   ·   "), x + 8, ty); ty += 5.5; }
      ty += 2;

      var ans = g.answers || {};
      if (Object.keys(ans).length) {
        buildGroups(ans).forEach(function (grp) { groupHeader(grp.t, grp.c); fieldsGrid(grp.fields); ty += 3; });
      } else {
        doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("Sin respuestas capturadas.", x + 2, ty); ty += 6;
      }

      /* Documentos subidos por esta persona. */
      var gf = filesByGuest[gi] || [];
      groupHeader("Documentos subidos", green);
      if (gf.length) {
        for (var fi = 0; fi < gf.length; fi++) {
          var dn = (gf[fi].doc_label || gf[fi].doc_key || "Documento") + (gf[fi].original_name ? "  ·  " + gf[fi].original_name : "");
          var dlines = doc.splitTextToSize(dn, CW - 8);
          needSpace(dlines.length * 4.4 + 1);
          doc.setFillColor(green[0], green[1], green[2]); doc.roundedRect(x, ty - 2.6, 2.6, 3.2, 0.5, 0.5, "F");
          doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(dlines, x + 5, ty); ty += dlines.length * 4.4 + 1;
        }
      } else {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text("Ninguno (el cliente puede traerlos físicos el día de la cita).", x + 2, ty); ty += 5;
      }

      ty += 6;
      if (gi < guests.length - 1) { needSpace(6); doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.3); doc.line(x, ty, RIGHT, ty); ty += 8; }
    }

    /* Pie con numeración en todas las páginas. */
    var total = doc.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(rule[0], rule[1], rule[2]); doc.setLineWidth(0.3); doc.line(x, 284, RIGHT, 284);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text("Expediente generado el " + nowStr() + "  ·  Ok.station", x, 289);
      doc.text("Página " + p + " de " + total, RIGHT, 289, { align: "right" });
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

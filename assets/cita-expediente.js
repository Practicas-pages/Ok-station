(function () {
  "use strict";

  var MAX_MB = 10;
  var ACCEPT = ".pdf,.jpg,.jpeg,.png";
  var ACCEPT_MIME = ["application/pdf", "image/jpeg", "image/png"];
  var WA = "https://wa.me/526647194117?text=";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  var REQS = {
    pasaporte_mexicano_primera_mayor: [
      "CURP",
      "Acta de nacimiento",
      "Comprobante de domicilio",
      "Número de teléfono",
      "Credencial de elector (INE)",
      "Nombre completo, número de teléfono y domicilio completo de una persona en caso de emergencia"
    ],
    pasaporte_mexicano_renovacion_mayor: [
      "CURP",
      "Pasaporte a renovar",
      "Comprobante de domicilio",
      "Número de teléfono",
      "Credencial de elector (INE)",
      "Nombre completo, número de teléfono y domicilio completo de una persona en caso de emergencia",
      "En caso de robo o extravío del pasaporte, traer constancia de extravío expedida por la Fiscalía"
    ],
    pasaporte_mexicano_primera_menor: [
      "CURP",
      "Acta de nacimiento",
      "Comprobante de domicilio y número de teléfono",
      "Constancia de estudios, certificado o tarjeta IMSS",
      { group: "Comparecencia de ambos padres (documento oficial vigente con fotografía y firma del titular)", items: [
        "Credencial de elector (INE)", "Pasaporte mexicano", "Cédula profesional"
      ]},
      "Nombre completo, número de teléfono y domicilio completo de una persona en caso de emergencia"
    ],
    pasaporte_mexicano_renovacion_menor: [
      "CURP",
      "Pasaporte a renovar",
      "Comprobante de domicilio y número de teléfono",
      { group: "Comparecencia de ambos padres (documento oficial vigente con fotografía y firma del titular)", items: [
        "Credencial de elector (INE)", "Pasaporte mexicano", "Cédula profesional"
      ]},
      "Nombre completo, número de teléfono y domicilio completo de una persona en caso de emergencia",
      "En caso de robo o extravío del pasaporte, traer constancia de extravío expedida por la Fiscalía"
    ],
    pasaporte_americano: [
      { group: "Datos generales", items: [
        "Tipo de pasaporte (Libro o Tarjeta)",
        "Acta de nacimiento",
        "Número de teléfono",
        "Correo electrónico",
        "Dirección permanente o dirección en Estados Unidos",
        "Color de ojos",
        "Color de cabello",
        "Estatura (pies y pulgadas)"
      ]},
      { group: "Datos de los padres", items: [
        "Nombre completo", "Fecha de nacimiento", "Lugar de nacimiento"
      ]},
      { group: "Contacto de emergencia en Estados Unidos", items: [
        "Nombre completo", "Dirección completa", "Teléfono (opcional)"
      ]},
      { group: "Si es casado o divorciado", items: [
        "Nombre completo del cónyuge", "Fecha de nacimiento", "Lugar de nacimiento",
        "Fecha de matrimonio o divorcio"
      ]}
    ],
    visa: [
      { group: "Documentos base", items: [
        "Pasaporte mexicano",
        "Credencial para votar (INE)",
        "Visa anterior (si es renovación)",
        "Teléfono personal",
        "Dirección actual"
      ]},
      { group: "Situación laboral — Empleados o empleadores", items: [
        "Empresa", "Dirección", "Teléfono", "Puesto", "Actividad",
        "Fecha de inicio", "Último empleo", "Salario mensual"
      ]},
      { group: "Situación laboral — Pensionados", items: [
        "Información del último empleo", "Empresa", "Dirección",
        "Fechas laboradas", "Puesto", "Actividad", "Salario mensual"
      ]},
      { group: "Situación laboral — Estudiantes", items: [
        "Nombre de escuela", "Dirección", "Teléfono", "Fecha de inicio", "Carrera",
        "Comprobante escolar (boleta, constancia o credencial escolar vigente)"
      ]},
      { group: "Información adicional", items: [
        "Países visitados en los últimos 5 años",
        "Correo electrónico",
        "Redes sociales (si tiene)",
        "Personas que lo acompañarán a EUA (nombre y parentesco)"
      ]},
      { group: "Datos familiares", items: [
        "Nombre de los padres", "Fecha de nacimiento de los padres"
      ]},
      { group: "Si está casado o en unión libre", items: [
        "Nombre completo del cónyuge", "Fecha de nacimiento", "Lugar de nacimiento"
      ]},
      { group: "Familiares directos en Estados Unidos", items: [
        "Padre", "Madre", "Cónyuge", "Hijos", "Hermanos"
      ]},
      { group: "Última visita a Estados Unidos", items: [
        "Fecha aproximada"
      ]},
      { group: "Escolaridad", items: [
        "Último grado de estudios", "Escuela", "Dirección",
        "Fechas cursadas", "Carrera o grado obtenido"
      ]}
    ],
    sentri: [
      { group: "Documentos", items: [
        "Pasaporte vigente o acta de nacimiento",
        "Documento para ingresar a EUA (pasaporte americano, tarjeta de residente o visa americana)"
      ]},
      { group: "Historial laboral (últimos 5 años)", items: [
        "Empresa", "Dirección", "Teléfono", "Puesto", "Fecha inicio", "Fecha término"
      ]},
      { group: "Historial de vivienda (últimos 5 años)", items: [
        "Dirección", "Fecha inicio", "Fecha término"
      ]},
      { group: "Información adicional", items: [
        "RFC vigente (solo para Global Entry)", "Dirección personal", "Celular", "Teléfono de casa",
        "Dirección en Estados Unidos",
        "Lista de países visitados en los últimos 5 años (excepto EUA y Canadá)"
      ]}
    ],
    i94: [
      "Pasaporte vigente o identificación oficial",
      "Visa americana o documento de viaje",
      "Información de tu ingreso a Estados Unidos"
    ],
    curp: [
      "Acta de nacimiento",
      "Identificación oficial"
    ],
    acta: [
      "CURP",
      "Nombre completo de los padres"
    ],
    ine: [
      "Acta de nacimiento",
      "CURP",
      "Comprobante de domicilio",
      "Identificación vigente"
    ],
    licencia: [
      "PDF de tu licencia (el que te entregan en la oficina de arrendamiento)",
      "Identificación oficial (opcional)"
    ],
    apostille: [
      "Documento original a apostillar o traducir",
      "Identificación oficial"
    ],
    medica: [
      "Identificación oficial",
      "Información del trámite que requiere el examen médico"
    ]
  };

  var DOCS = {
    pasaporte_mexicano: [
      { key: "acta", label: "Acta de nacimiento" },
      { key: "curp", label: "CURP" },
      { key: "domicilio", label: "Comprobante de domicilio" },
      { key: "ine", label: "Credencial para votar (INE)" }
    ],
    pasaporte_americano: [
      { key: "acta", label: "Acta de nacimiento" },
      { key: "id", label: "Identificación oficial" }
    ],
    visa: [
      { key: "pasaporte", label: "Pasaporte mexicano" },
      { key: "ine", label: "Credencial para votar (INE)" },
      { key: "visa_anterior", label: "Visa anterior (si es renovación)" },
      { key: "comprobante", label: "Comprobante (laboral o escolar)" }
    ],
    sentri: [
      { key: "pasaporte", label: "Pasaporte vigente o acta de nacimiento" },
      { key: "doc_ingreso", label: "Documento para ingresar a EUA" },
      { key: "rfc", label: "RFC vigente (solo para Global Entry)" }
    ],
    i94: [
      { key: "identificacion", label: "Identificación oficial" },
      { key: "visa_doc", label: "Visa o documento de viaje" }
    ],
    curp: [
      { key: "acta", label: "Acta de nacimiento" },
      { key: "identificacion", label: "Identificación oficial" }
    ],
    acta: [
      { key: "curp", label: "CURP" }
    ],
    ine: [
      { key: "acta", label: "Acta de nacimiento" },
      { key: "curp", label: "CURP" },
      { key: "domicilio", label: "Comprobante de domicilio" },
      { key: "identificacion", label: "Identificación vigente" }
    ],
    licencia: [
      { key: "licencia_pdf", label: "PDF de tu licencia (oficina de arrendamiento) — se imprime en PVC" },
      { key: "id", label: "Identificación oficial (opcional)" }
    ],
    apostille: [
      { key: "documento", label: "Documento a apostillar o traducir" },
      { key: "identificacion", label: "Identificación oficial" }
    ],
    medica: [
      { key: "identificacion", label: "Identificación oficial" }
    ]
  };

  var UP = {
    curp:      { q: "¿No tienes tu CURP?",                 cta: "Tramitar CURP",               wa: "Hola, necesito tramitar mi CURP para mi cita." },
    acta:      { q: "¿No tienes tu Acta de Nacimiento?",   cta: "Obtener Acta",                wa: "Hola, necesito obtener mi acta de nacimiento para mi cita." },
    fotos:     { q: "¿Necesitas fotografías para tu trámite?", cta: "Fotografías para documentos", href: "#fotos" },
    impresion: { q: "¿Necesitas impresiones?",             cta: "Servicio de impresión",       href: "#servicios" },
    copias:    { q: "¿Necesitas copias certificadas?",     cta: "Solicitar apoyo",             wa: "Hola, necesito copias certificadas para mi cita." }
  };

  var UPSELL = {
    pasaporte_mexicano: ["curp", "acta", "fotos", "copias"],
    pasaporte_americano: ["acta", "fotos", "copias"],
    visa: ["fotos", "impresion", "copias"],
    sentri: ["fotos", "impresion", "copias"],
    i94: ["fotos", "impresion", "copias"],
    curp: ["acta", "impresion", "copias"],
    acta: ["curp", "impresion", "copias"],
    ine: ["curp", "acta", "fotos", "copias"],
    licencia: ["curp", "fotos", "copias"],
    apostille: ["acta", "impresion", "copias"],
    medica: ["fotos", "impresion"]
  };

  var TLABEL = {
    pasaporte_mexicano: "Pasaporte Mexicano",
    pasaporte_mexicano_primera_mayor: "Pasaporte Mexicano — Primera vez (mayor de edad)",
    pasaporte_mexicano_renovacion_mayor: "Pasaporte Mexicano — Renovación (mayor de edad)",
    pasaporte_mexicano_primera_menor: "Pasaporte Mexicano — Primera vez (menor de edad)",
    pasaporte_mexicano_renovacion_menor: "Pasaporte Mexicano — Renovación (menor de edad)",
    pasaporte_americano: "Pasaporte Americano",
    visa: "Visa Americana",
    sentri: "SENTRI / Global Entry",
    i94: "I-94 / Permiso de Viaje",
    curp: "CURP",
    acta: "Acta de Nacimiento",
    ine: "INE / Credencial",
    licencia: "Licencia de Conducir",
    apostille: "Apostille / Traducción",
    medica: "Cita Médica / Examen"
  };

  var UP_PRICE = {
    curp:      50,
    acta:      150,
    fotos:     90,
    impresion: 15,
    copias:    20
  };
  var UP_PRICE_TRAMITE = {
  };
  function upPrice(upKey, tramiteKey) {
    var srv = window.OK_APPT_SERVICE_PRICES;
    if (srv && typeof srv === "object" && srv[upKey] != null) return +srv[upKey];
    var byT = UP_PRICE_TRAMITE[tramiteKey];
    if (byT && byT[upKey] != null) return byT[upKey];
    return (UP_PRICE[upKey] != null) ? UP_PRICE[upKey] : null;
  }
  function fmtMXN(n) {
    try { return "$" + Number(n).toLocaleString("es-MX"); }
    catch (e) { return "$" + n; }
  }

  var current = null;
  var docFiles = {};
  var services = {};

  function selectedTramite() {
    var btn = qs(".tramite-btn.is-selected");
    return btn ? btn.getAttribute("data-tramite") : null;
  }
  function passportSubtype() {
    var r = qs("input[name='cita-subtype']:checked");
    return r ? r.value : "";
  }
  function passportTramite() { var r = qs("input[name='cita-ppt-tramite']:checked"); return r ? r.value : ""; }
  function passportEdad()    { var r = qs("input[name='cita-ppt-edad']:checked");    return r ? r.value : ""; }
  function resolveKey() {
    var t = selectedTramite();
    if (!t) return null;
    if (t === "pasaporte") {
      var sub = passportSubtype();
      if (!sub) return "pasaporte";
      if (sub === "mexicano") {
        var tr = passportTramite(), ed = passportEdad();
        return (tr && ed) ? ("pasaporte_mexicano_" + tr + "_" + ed) : "pasaporte";
      }
      return "pasaporte_" + sub;
    }
    return t;
  }

  function renderReqs() {
    var box = qs("#cita-requisitos");
    if (!box) return;
    var key = resolveKey();

    if (!key) { box.hidden = true; box.innerHTML = ""; return; }

    if (key === "pasaporte") {
      box.hidden = false;
      box.innerHTML = '<div class="cita-reqs__head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><b>Elige el tipo de pasaporte</b></div><p class="cita-reqs__note">Selecciona <b>Mexicano</b> o <b>Americano</b> para ver los requisitos de tu trámite.</p>';
      return;
    }

    var data = REQS[key];
    if (!data) { box.hidden = true; box.innerHTML = ""; return; }

    var html = '<div class="cita-reqs__head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg><b>Requisitos para ' + esc(TLABEL[key] || key) + '</b></div>';
    html += renderReqList(data);
    box.hidden = false;
    box.innerHTML = html;
  }

  function renderReqList(data) {
    var out = "";
    var loose = [];
    data.forEach(function (entry) {
      if (typeof entry === "string") { loose.push(entry); return; }
    });
    if (loose.length) out += ul(loose);
    var groups = "";
    data.forEach(function (entry) {
      if (typeof entry === "object" && entry.group) {
        groups += '<div class="cita-reqs__group"><span class="cita-reqs__gtitle">' + esc(entry.group) + '</span>' + ul(entry.items) + '</div>';
      }
    });
    if (groups) out += '<div class="cita-reqs__groups">' + groups + '</div>';
    return out;
  }
  function ul(items) {
    return '<ul class="cita-reqs__list">' + items.map(function (it) {
      return '<li>' + esc(it) + '</li>';
    }).join("") + '</ul>';
  }

  function renderDocs() {
    var wrap = qs("#cita-docs");
    if (!wrap) return;
    var key = resolveKey();

    if (!key || key === "pasaporte") {
      wrap.innerHTML = '<p class="cita-docs__empty">Selecciona primero un trámite (paso 1) para ver los documentos que puedes adjuntar.</p>';
      return;
    }
    var html = '';

    var ups = UPSELL[key] || [];
    if (ups.length) {
      html += '<div class="cita-upsell"><span class="cita-upsell__title">¿Te falta algo? Lo resolvemos aquí</span><div class="cita-upsell__list">';
      ups.forEach(function (k) {
        var u = UP[k]; if (!u) return;
        var on = !!services[k];
        var price = upPrice(k, key);
        var priceHtml = (price != null && price > 0)
          ? '<span class="upsell-row__price">' + fmtMXN(price) + '</span>'
          : '';
        html += '<div class="upsell-row' + (on ? ' is-on' : '') + '" data-up="' + esc(k) + '">' +
          '<span class="upsell-row__q">' + esc(u.q) + '</span>' +
          '<div class="upsell-row__actions">' +
            priceHtml +
            '<button type="button" class="btn btn--ghost-dark btn--sm upsell-add" data-up-add="' + esc(k) + '" aria-pressed="' + (on ? "true" : "false") + '">' + (on ? "✓ Agregado" : esc(u.cta)) + '</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div><p class="cita-upsell__note">Los servicios que marques se incluirán en tu cita para que el equipo los tenga listos.</p></div>';
    }

    if (!html) html = '<p class="cita-docs__empty">No hay servicios adicionales sugeridos para este trámite. Tus documentos los subes en el paso de cada persona.</p>';

    wrap.innerHTML = html;
    bindDocInputs();
    refreshDocStatuses();
  }

  function bindDocInputs() {
    qsa("[data-doc-input]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var k = inp.getAttribute("data-doc-input");
        var f = inp.files && inp.files[0];
        if (!f) { delete docFiles[k]; setDocStatus(k, "", false); return; }
        var okType = ACCEPT_MIME.indexOf(f.type) !== -1 || /\.(pdf|jpe?g|png)$/i.test(f.name);
        if (!okType) { inp.value = ""; delete docFiles[k]; setDocStatus(k, "Formato no permitido. Usa PDF, JPG o PNG.", false, true); return; }
        if (f.size > MAX_MB * 1024 * 1024) { inp.value = ""; delete docFiles[k]; setDocStatus(k, "El archivo supera " + MAX_MB + " MB.", false, true); return; }
        docFiles[k] = f;
        setDocStatus(k, f.name + " · " + fmtSize(f.size), true);
      });
    });

    qsa("[data-up-add]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-up-add");
        services[k] = !services[k];
        var row = b.closest(".upsell-row");
        if (row) row.classList.toggle("is-on", !!services[k]);
        b.setAttribute("aria-pressed", services[k] ? "true" : "false");
        b.textContent = services[k] ? "✓ Agregado" : (UP[k] ? UP[k].cta : "Agregar");
      });
    });
  }

  function setDocStatus(k, msg, ok, isErr) {
    var el = qs('[data-doc-status="' + cssEsc(k) + '"]');
    if (!el) return;
    if (!msg) { el.innerHTML = ""; el.className = "doc-field__status"; return; }
    el.className = "doc-field__status " + (isErr ? "is-error" : (ok ? "is-ok" : ""));
    var icon = isErr
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    el.innerHTML = icon + '<span>' + esc(msg) + '</span>';
  }
  function refreshDocStatuses() {
    Object.keys(docFiles).forEach(function (k) {
      var f = docFiles[k];
      if (f) setDocStatus(k, f.name + " · " + fmtSize(f.size), true);
    });
  }
  function cssEsc(s) { return String(s).replace(/"/g, '\\"'); }
  function fmtSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(0) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }

  function onTramiteChanged() {
    var key = resolveKey();
    if (key === current) return;
    current = key;
    docFiles = {};
    services = {};
    renderReqs();
    var wrap = qs("#cita-docs");
    if (wrap && !wrap.hidden) renderDocs();
  }

  function bindToggle() {
    var toggle = qs("#cita-docs-toggle");
    var wrap = qs("#cita-docs");
    if (!toggle || !wrap) return;
    toggle.addEventListener("click", function () {
      var open = wrap.hidden;
      if (open) renderDocs();
      wrap.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.classList.toggle("is-open", open);
      if (open) { try { wrap.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {} }
    });
  }

  function init() {
    if (!qs(".tramite-grid")) return;

    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".tramite-btn") : null;
      if (btn) setTimeout(onTramiteChanged, 0);
    });
    qsa("input[name='cita-subtype']").forEach(function (r) {
      r.addEventListener("change", function () { setTimeout(onTramiteChanged, 0); });
    });
    qsa("input[name='cita-ppt-tramite'], input[name='cita-ppt-edad']").forEach(function (r) {
      r.addEventListener("change", function () { setTimeout(onTramiteChanged, 0); });
    });
    var subtypeConfirm = qs("#cita-subtype-confirm");
    if (subtypeConfirm) subtypeConfirm.addEventListener("click", function () { setTimeout(onTramiteChanged, 0); });

    bindToggle();
    onTramiteChanged();
  }

  window.OKCitaExpediente = {
    getState: function () {
      var docs = Object.keys(docFiles).map(function (k) {
        var f = docFiles[k];
        var label = "";
        var list = DOCS[current] || [];
        for (var i = 0; i < list.length; i++) if (list[i].key === k) { label = list[i].label; break; }
        return { key: k, label: label, name: f.name, size: f.size, type: f.type, file: f };
      });
      var svc = Object.keys(services).filter(function (k) { return services[k]; }).map(function (k) {
        var pr = upPrice(k, current);
        return { key: k, label: UP[k] ? UP[k].cta : k, price: (pr != null ? +pr : null) };
      });
      return { tramite: current, documents: docs, services: svc };
    },
    requiredDocs: function () { return (DOCS[current] || []).slice(); },
    docsFor: function (tramite, subtype) {
      var key = (tramite === "pasaporte") ? (subtype ? "pasaporte_" + subtype : "pasaporte") : tramite;
      return (DOCS[key] || []).slice();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

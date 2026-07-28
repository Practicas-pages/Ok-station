/* ============================================================
   Ok.station — Panel administrativo (front)
   MODO DEMO: datos simulados. La capa de datos está aislada en
   DataSource para conectar al backend (CloudPanel) cambiando DEMO=false.
   ============================================================ */
(function () {
  "use strict";

  var DEMO = false;                 // PRODUCCIÓN: usa el API real (admin/*.php)
  var API_BASE = "/backend/api";

  /* ── Sesión (compartida con auth.js) ── */
  function cachedUser() { try { return JSON.parse(localStorage.getItem("okstation.user") || "null"); } catch (e) { return null; } }
  function token() { try { return localStorage.getItem("okstation.token"); } catch (e) { return null; } }

  /* ── Utilidades ── */
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function mxn(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n); }
  /* Escapa para insertar con innerHTML. textContent cubre <, > y &, pero NO las
     comillas, y aquí casi todo acaba DENTRO de un atributo. Se vio en el panel:
     el producto «Arillo Fellowes 1" Plastico C/10 Negro» rompía
     data-foto-nombre="…" en la comilla y el diálogo mostraba solo "Arillo
     Fellowes 1". Peor que el corte: un nombre con `" onerror="…` se habría
     ejecutado, y los nombres vienen de la API de Exel, no de nosotros.
     Escapar las comillas es seguro también fuera de atributos: dentro de
     innerHTML, &quot; se pinta como una comilla normal. */
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var STATUS = {
    recibido: "Recibido", en_revision: "En revisión", en_produccion: "En producción",
    listo: "Listo", entregado: "Entregado", cancelado: "Cancelado"
  };
  var APPT_STATUS = {
    pendiente: "Pendiente", confirmada: "Confirmada", cancelada: "Cancelada",
    completada: "Completada", no_show: "No asistió"
  };
  var TRAMITE_LABEL = {
    pasaporte: "Pasaporte", visa: "Visa Americana", sentri: "SENTRI / Global Entry", i94: "I-94",
    curp: "CURP / Acta", ine: "INE / Credencial", licencia: "Licencia de conducir",
    apostille: "Apostille / Traducción", medica: "Cita médica / Examen"
  };
  var SUBTYPE_LABEL = { mexicano: "Mexicano", americano: "Americano" };
  var DOCTYPE_LABEL = { primera: "Primera vez", renov_con: "Renovación con documentos", renov_sin: "Renovación sin documentos" };
  /* Datos por persona (requisitos): JSON guardado en la cita, o []. */
  function parseGuests(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { var p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  }
  /* Celda de servicio: servicio (cualquiera de los 9) + subtipo de pasaporte + nº de personas
     + datos de cada persona (nombre, nacimiento, tipo de trámite con/sin documentos). */
  function apptServiceCell(a) {
    var html = '<b>' + esc(TRAMITE_LABEL[a.tramite] || a.tramite) + '</b>';
    if (a.tramite === "pasaporte" && a.passport_subtype) {
      html += ' <span class="appt-tag">' + esc(SUBTYPE_LABEL[a.passport_subtype] || a.passport_subtype) + '</span>';
    }
    var n = parseInt(a.party_size, 10) || 1;
    if (n > 1) html += '<br><span class="appt-extra">' + n + ' personas</span>';
    if (window.OKCitaPriceText) html += '<br><span class="appt-extra" style="color:var(--brand-blue);font-weight:600">' + esc(window.OKCitaPriceText(a.tramite, a.passport_subtype, a.party_size)) + '</span>';
    /* Estado del ANTICIPO en línea: el trabajador ve de un vistazo si el cliente
       pagó (verde) o no (ámbar). Solo se muestra si el trámite tiene anticipo
       (amount_total > 0) o ya hay algún movimiento de pago. */
    var payable = (a.amount_total != null && a.amount_total !== "" && +a.amount_total > 0);
    var pstat = a.payment_status || "";
    if (payable || pstat === "pagado" || pstat === "procesando" || pstat === "reembolsado" || pstat === "error") {
      var pInfo = pstat === "pagado"      ? { c: "#047857", t: "✓ Pagado" }
                : pstat === "procesando"  ? { c: "#b45309", t: "⏳ Pago en proceso" }
                : pstat === "reembolsado" ? { c: "#6b7280", t: "↩ Pago reembolsado" }
                : pstat === "error"       ? { c: "#b91c1c", t: "✕ Pago con error" }
                :                           { c: "#b45309", t: "⏳ Pago pendiente" };
      html += '<br><span style="display:inline-block;margin-top:4px;font-size:.78rem;font-weight:700;color:' + pInfo.c + '">' + pInfo.t + '</span>';
    }
    var guests = parseGuests(a.guests_json);
    if (guests.length) {
      html += '<div class="appt-guests" style="margin-top:6px">' + guests.map(function (g, i) {
        var sub = [];
        if (g.dob) sub.push("Nac. " + esc(g.dob));
        if (g.doctype) sub.push(esc(DOCTYPE_LABEL[g.doctype] || g.doctype));
        /* Solo nombre + nacimiento/tipo de trámite. Las RESPUESTAS del cuestionario
           NO se muestran aquí: van únicamente en el expediente (PDF). */
        return '<div class="appt-guest" style="font-size:.82rem">' + (i + 1) + '. <b>' + esc(g.name || "—") + '</b>' +
          (sub.length ? ' <span style="color:var(--text-muted)">· ' + sub.join(" · ") + '</span>' : '') + '</div>';
      }).join("") + '</div>';
    }
    return html;
  }
  function badge(status, labels) {
    var map = labels || STATUS;
    return '<span class="badge badge--' + status + '">' + esc(map[status] || status) + '</span>';
  }
  var PAY_STATUS = { pendiente: "Pendiente", procesando: "Procesando", pagado: "Pagado", error: "Error", reembolsado: "Reembolsado" };
  function payBadge(status) {
    var s = status || "pendiente";
    return '<span class="badge badge--pay-' + s + '">' + esc(PAY_STATUS[s] || s) + '</span>';
  }
  /* Señal "confirmado por el cliente": ya NO se pide confirmación por correo
     (los correos son solo comprobante), así que solo mostramos el ✓ para citas
     viejas que sí confirmaron; nunca el "sin confirmar" (sería engañoso). */
  function confirmChip(when) {
    return when
      ? '<span class="badge badge--listo" title="El cliente confirmó por correo el ' + esc(String(when)) + '">✓ Confirmado por el cliente</span>'
      : '';
  }
  /* Banner de confirmación para los modales de detalle (solo el positivo). */
  function confirmBanner(when) {
    return when
      ? '<div style="display:flex;align-items:center;gap:8px;background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;border-radius:8px;padding:9px 12px;font-size:.86rem;font-weight:600;margin:0 0 14px">✓ Confirmado por el cliente <span style="font-weight:400;color:#059669">· ' + esc(String(when)) + '</span></div>'
      : '';
  }
  /* Nombre de cliente: enlace al historial si tiene cuenta (user_id); si es invitado, texto plano. */
  function clientCell(userId, name) {
    return userId
      ? '<button type="button" class="client-link" data-uview="' + esc(userId) + '">' + esc(name) + '</button>'
      : '<b>' + esc(name || "—") + '</b>';
  }
  /* Botón directo al WhatsApp del cliente que hizo el pedido (apoyo a las trabajadoras). */
  function waDigits(phone) {
    var d = String(phone || "").replace(/\D/g, "");
    if (d.length < 10) return "";
    if (d.length === 10) d = "52" + d;          // 10 dígitos → anteponer lada de México
    return d;
  }
  function clientWaBtn(o) {
    var d = waDigits(o && o.contact_phone);
    if (!d) return "";
    /* Mensaje listo para el trabajador, con el folio del pedido. */
    var msg = "Hola, le escribimos de Ok.station sobre su pedido " + ((o && o.code) || "") + ".";
    var href = "https://wa.me/" + d + "?text=" + encodeURIComponent(msg);
    return ' <a class="admin-btn-sm" style="background:#25D366;color:#fff;border-color:#25D366" ' +
      'href="' + href + '" target="_blank" rel="noopener" title="Escribir al cliente por WhatsApp">WhatsApp</a>';
  }

  /* ============================================================
     CAPA DE DATOS (simulada). Aquí se conecta el backend real.
     ============================================================ */
  var MOCK = {
    stats: { orders: 128, sales: 48230, users: 86, pending: 14, dOrders: 12, dSales: 8, dUsers: 5, dPending: -3 },
    sales7: [
      { d: "Lun", v: 4200 }, { d: "Mar", v: 6100 }, { d: "Mié", v: 5300 },
      { d: "Jue", v: 7400 }, { d: "Vie", v: 9200 }, { d: "Sáb", v: 11200 }, { d: "Dom", v: 4830 }
    ],
    topServices: [
      { name: "Impresión de fotografías", count: 64 },
      { name: "Copias fotostáticas", count: 52 },
      { name: "Fotos para trámites", count: 41 },
      { name: "Engargolado", count: 23 },
      { name: "Enmicado", count: 18 }
    ],
    orders: [
      { code: "OKS-2026-000128", client: "Juan Pérez", items: 3, total: 240, status: "recibido", date: "2026-06-10" },
      { code: "OKS-2026-000127", client: "Jorge Ramírez", items: 1, total: 85, status: "en_revision", date: "2026-06-10" },
      { code: "OKS-2026-000126", client: "Ana López", items: 5, total: 620, status: "en_produccion", date: "2026-06-09" },
      { code: "OKS-2026-000125", client: "Luis Pérez", items: 2, total: 150, status: "listo", date: "2026-06-09" },
      { code: "OKS-2026-000124", client: "Carla Méndez", items: 4, total: 410, status: "entregado", date: "2026-06-08" },
      { code: "OKS-2026-000123", client: "Diego Salas", items: 1, total: 60, status: "cancelado", date: "2026-06-08" },
      { code: "OKS-2026-000122", client: "Paola Ruiz", items: 6, total: 880, status: "recibido", date: "2026-06-08" }
    ],
    users: [
      { name: "Juan Pérez", email: "juan@ejemplo.com", phone: "664 100 0001", orders: 7, active: true, joined: "2026-01-12" },
      { name: "Jorge Ramírez", email: "jorge@ejemplo.com", phone: "664 100 0002", orders: 3, active: true, joined: "2026-02-03" },
      { name: "Ana López", email: "ana@ejemplo.com", phone: "664 100 0003", orders: 12, active: true, joined: "2025-11-20" },
      { name: "Diego Salas", email: "diego@ejemplo.com", phone: "664 100 0004", orders: 1, active: false, joined: "2026-05-30" }
    ],
    reviews: [
      { name: "Karla T.", rating: 5, comment: "Rápido y excelente atención.", status: "aprobada", date: "2026-06-09" },
      { name: "Jorge R.", rating: 5, comment: "Mi tesis quedó impecable.", status: "pendiente", date: "2026-06-10" },
      { name: "Anónimo", rating: 2, comment: "Tardó más de lo esperado.", status: "oculta", date: "2026-06-07" }
    ],
    appointments: [
      { code: "CITA-2026-000031", tramite: "pasaporte", passport_subtype: "mexicano", party_size: 2, date: "2026-06-20", time: "09:00", status: "pendiente", contact_name: "Juan Pérez", contact_phone: "664 100 0001", contact_email: "juan@ejemplo.com", contact_pref: "whatsapp", notes: "Renovación", account_name: "Juan Pérez" },
      { code: "CITA-2026-000030", tramite: "curp", party_size: 4, date: "2026-06-20", time: "11:00", status: "confirmada", contact_name: "Jorge Ramírez", contact_phone: "664 100 0002", contact_email: "", contact_pref: "llamada", notes: "", account_name: null },
      { code: "CITA-2026-000029", tramite: "sentri", date: "2026-06-19", time: "16:00", status: "completada", contact_name: "Ana López", contact_phone: "664 100 0003", contact_email: "ana@ejemplo.com", contact_pref: "correo", notes: "Primera vez", account_name: "Ana López" },
      { code: "CITA-2026-000028", tramite: "i94", date: "2026-06-18", time: "10:00", status: "cancelada", contact_name: "Diego Salas", contact_phone: "664 100 0004", contact_email: "", contact_pref: "whatsapp", notes: "", account_name: null }
    ]
  };

  function apiGet(p) { return fetch(API_BASE + p, { headers: { Authorization: "Bearer " + token() } }).then(function (r) { return r.json(); }); }
  function apiPost(p, body) { return fetch(API_BASE + p, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

  /* ¿Este usuario puede ver datos financieros (montos/referencias)? Lo confirma el
     backend (solo administrador/directivo). Se refina al cargar la lista de pedidos. */
  var ordersCanSeeMoney = true;
  /* ¿El pago en línea está activo (migración 0008 aplicada)? Lo confirma el backend.
     Si no, ocultamos la fila de filtros de pago (no debe haber dos hileras de filtros). */
  var ordersPaymentsEnabled = true;
  var DataSource = {
    dashboard: function () { return DEMO ? Promise.resolve(MOCK) : apiGet("/admin/dashboard.php"); },
    orders: function (status, payment, q) {
      if (DEMO) return Promise.resolve(MOCK.orders.filter(function (o) {
        return (!status || o.status === status) && (!payment || (o.payment_status || "pendiente") === payment);
      }));
      var p = [];
      if (status) p.push("status=" + encodeURIComponent(status));
      if (payment) p.push("payment=" + encodeURIComponent(payment));
      if (q) p.push("q=" + encodeURIComponent(q));
      return apiGet("/admin/orders.php" + (p.length ? "?" + p.join("&") : "")).then(function (j) {
        if (typeof j.can_see_money !== "undefined") ordersCanSeeMoney = !!j.can_see_money;
        if (typeof j.payments_enabled !== "undefined") ordersPaymentsEnabled = !!j.payments_enabled;
        return j.orders || [];
      });
    },
    updateStatus: function (id, status) {
      if (DEMO) { var o = MOCK.orders.find(function (x) { return String(x.id) === String(id); }); if (o) o.status = status; return Promise.resolve({ ok: true }); }
      return apiPost("/admin/order-status.php", { id: id, status: status });
    },
    setPrice: function (id, total) {
      if (DEMO) { var o = MOCK.orders.find(function (x) { return String(x.id) === String(id); }); if (o) { o.total = total; o.needs_quote = 0; } return Promise.resolve({ ok: true, emailed: true }); }
      return apiPost("/admin/order-price.php", { id: id, total: total });
    },
    setOrderPaid: function (id, status) {
      if (DEMO) { var o = MOCK.orders.find(function (x) { return String(x.id) === String(id); }); if (o) o.payment_status = status; return Promise.resolve({ ok: true, payment_status: status }); }
      return apiPost("/admin/order-payment.php", { id: id, status: status || "pagado" });
    },
    /* ── Pedidos de la TIENDA (e-commerce) ── */
    shopOrders: function (status, payment, q) {
      var p = [];
      if (status) p.push("status=" + encodeURIComponent(status));
      if (payment) p.push("payment=" + encodeURIComponent(payment));
      if (q) p.push("q=" + encodeURIComponent(q));
      return apiGet("/admin/shop-orders.php" + (p.length ? "?" + p.join("&") : "")).then(function (j) {
        if (typeof j.can_see_money !== "undefined") shopCanSeeMoney = !!j.can_see_money;
        return j.orders || [];
      });
    },
    setShopStatus: function (id, status) { return apiPost("/admin/shop-order-status.php", { id: id, status: status }); },
    setShopPaid: function (id, status) { return apiPost("/admin/shop-order-payment.php", { id: id, status: status || "pagado" }); },
    /* Detalle de una compra CON sus productos. Reusa /shop/get.php, que ya resuelve
       permisos (staff con shop.view ve cualquiera) y le oculta los importes al
       empleado — no hay que repetir esas reglas aquí. */
    shopOrderDetail: function (id) { return apiGet("/shop/get.php?id=" + encodeURIComponent(id)); },
    /* ── Catálogo de productos (SOLO LECTURA) ──
       Devuelve el JSON completo, no solo `products`: la vista también necesita el
       resumen del catálogo (stats) y las categorías reales para el filtro. */
    catalog: function (f) {
      f = f || {};
      if (DEMO) return Promise.resolve({ ok: true, products: [], stats: {}, categories: [] });
      var p = [];
      if (f.q)        p.push("q=" + encodeURIComponent(f.q));
      if (f.images)   p.push("images=" + encodeURIComponent(f.images));
      return apiGet("/admin/catalog.php" + (p.length ? "?" + p.join("&") : ""));
    },
    productDetail:    function (id) { return apiGet("/admin/product-detail.php?id=" + encodeURIComponent(id)); },
    imageRescue:      function (limit) { return apiPost("/admin/image-rescue.php", { limit: limit || 10 }); },
    imageRescueReport:function (status) {
      return apiGet("/admin/image-rescue-report.php" + (status ? "?status=" + encodeURIComponent(status) : ""));
    },
    /* Solo `primary` y `remove`: PONER una foto es trabajo de admin-fotos.js +
       image-set.php, que además la descargan a nuestro servidor. */
    productImage:     function (payload) { return apiPost("/admin/product-image.php", payload); },
    orderDetail: function (id) {
      if (DEMO) { var o = (MOCK.orders || []).find(function (x) { return String(x.id || x.code) === String(id); }); return Promise.resolve(o ? { ok: true, order: o } : { ok: false }); }
      return apiGet("/orders/get.php?id=" + encodeURIComponent(id));
    },
    users:    function () { return DEMO ? Promise.resolve(MOCK.users)    : apiGet("/admin/users.php").then(function (j) { return j.users || []; }); },
    reviews:  function () { return DEMO ? Promise.resolve(MOCK.reviews)  : apiGet("/admin/reviews.php").then(function (j) { return j.reviews || []; }); },
    moderateReview: function (id, action) { return DEMO ? Promise.resolve({ ok: true }) : apiPost("/admin/review-moderate.php", { id: id, action: action }); },
    toggleUser: function (id, active) { return DEMO ? Promise.resolve({ ok: true }) : apiPost("/admin/user-toggle.php", { id: id, active: active }); },
    setUserRole: function (id, role) { return DEMO ? Promise.resolve({ ok: true }) : apiPost("/admin/user-role.php", { id: id, role: role }); },
    appointments: function (status, date) {
      if (DEMO) return Promise.resolve(MOCK.appointments.filter(function (a) {
        return (!status || a.status === status) && (!date || a.date === date);
      }));
      var q = [];
      if (status) q.push("status=" + encodeURIComponent(status));
      if (date) q.push("date=" + encodeURIComponent(date));
      return apiGet("/admin/appointments.php" + (q.length ? "?" + q.join("&") : "")).then(function (j) { return j.appointments || []; });
    },
    updateApptStatus: function (id, status) {
      if (DEMO) { var a = MOCK.appointments.find(function (x) { return String(x.id || x.code) === String(id); }); if (a) a.status = status; return Promise.resolve({ ok: true }); }
      return apiPost("/admin/appointment-status.php", { id: id, status: status });
    },
    setApptPrice: function (id, amount) {
      if (DEMO) { var a = MOCK.appointments.find(function (x) { return String(x.id || x.code) === String(id); }); if (a) { a.amount_total = amount; a.needs_quote = 0; } return Promise.resolve({ ok: true, emailed: true }); }
      return apiPost("/admin/appointment-price.php", { id: id, amount: amount });
    },
    setApptPaid: function (id, status) {
      if (DEMO) { var a = MOCK.appointments.find(function (x) { return String(x.id || x.code) === String(id); }); if (a) a.payment_status = status; return Promise.resolve({ ok: true, payment_status: status }); }
      return apiPost("/admin/appointment-payment.php", { id: id, status: status || "pagado" });
    },
    report: function (period, date) {
      if (DEMO) {
        var oByStatus = {}; (MOCK.orders || []).forEach(function (o) { (oByStatus[o.status] = oByStatus[o.status] || { count: 0, sales: 0 }); oByStatus[o.status].count++; oByStatus[o.status].sales += (+o.total || 0); });
        var aByStatus = {}; (MOCK.appointments || []).forEach(function (a) { aByStatus[a.status] = (aByStatus[a.status] || 0) + 1; });
        var aByTramite = {}; (MOCK.appointments || []).forEach(function (a) { aByTramite[a.tramite] = (aByTramite[a.tramite] || 0) + 1; });
        return Promise.resolve({
          ok: true, period: period || "day", date: date || "", range: { label: date || "demo" }, generated: "",
          orders: { count: (MOCK.orders || []).length, sales: (MOCK.orders || []).filter(function (o) { return o.status !== "cancelado"; }).reduce(function (s, o) { return s + (+o.total || 0); }, 0), byStatus: oByStatus },
          appointments: { count: (MOCK.appointments || []).length, byStatus: aByStatus, byTramite: aByTramite }
        });
      }
      var q = [];
      if (period) q.push("period=" + encodeURIComponent(period));
      if (date) q.push("date=" + encodeURIComponent(date));
      return apiGet("/admin/reports.php" + (q.length ? "?" + q.join("&") : ""));
    },
    userDetail: function (id) {
      if (DEMO) {
        var u = (MOCK.users || []).find(function (x) { return String(x.id || x.email) === String(id); }) || MOCK.users[0] || {};
        return Promise.resolve({
          ok: true, user: { name: u.name, email: u.email, phone: u.phone, joined: u.joined, active: u.active },
          summary: { orders: u.orders || 0, sales: 0, appointments: 0 },
          orders: (MOCK.orders || []).slice(0, 3), services: [{ name: "carta", count: 4 }, { name: "foto_10x15", count: 2 }],
          appointments: (MOCK.appointments || []).slice(0, 2), movements: [{ action: "login", entity: null, at: "2026-06-20 09:12" }, { action: "order.created", entity: "orders", at: "2026-06-19 17:40" }]
        });
      }
      return apiGet("/admin/user-detail.php?id=" + encodeURIComponent(id));
    }
  };
  var PERIOD_LABEL = { day: "Día", week: "Semana", month: "Mes" };
  /* Etiquetas legibles de tamaños/servicios de impresión (para el historial). */
  var SIZE_LABEL = { carta: "Carta", oficio: "Oficio", tabloide: "Tabloide", a4: "A4", foto_10x15: "Foto 10×15", foto_13x18: "Foto 13×18", gran_formato: "Gran formato", gran_formato_foto: "Gran formato foto", gran_formato_bond: "Gran formato bond" };
  /* Etiquetas legibles de acciones de la bitácora (movimientos del usuario). */
  var ACTION_LABEL = {
    login: "Inició sesión", logout: "Cerró sesión", "order.created": "Creó un pedido",
    "order.status_changed": "Cambio de estado de pedido", "appointment.created": "Agendó una cita",
    "review.created": "Publicó una reseña", "user.updated": "Actualizó su perfil",
    "user.deactivated": "Cuenta desactivada", "user.activated": "Cuenta reactivada", "password.reset": "Restableció contraseña"
  };

  /* ============================================================
     GUARD DE ACCESO (rol empleado/administrador)
     ============================================================ */
  function accessRoles() { var u = cachedUser(); return (u && u.roles) || []; }
  function hasAdminAccess() {
    var r = accessRoles();
    return r.indexOf("administrador") >= 0 || r.indexOf("empleado") >= 0 || r.indexOf("directivo") >= 0;
  }
  /* El directivo tiene acceso total (igual que un administrador). */
  function isDirectivo() { return accessRoles().indexOf("directivo") >= 0; }
  /* Empleado "puro": tiene rol empleado pero NO administrador ni directivo.
     Estos no ven Usuarios, Reportes, ni datos financieros (ventas/usuarios). */
  function isEmpleadoOnly() {
    var r = accessRoles();
    return r.indexOf("empleado") >= 0 && r.indexOf("administrador") < 0 && r.indexOf("directivo") < 0;
  }
  /* Vistas restringidas para empleado puro (se ocultan en el sidebar y se bloquean).
     Lo ÚNICO vetado es Reportes. Usuarios es visible pero en modo solo lectura: ve la
     lista y el historial, sin desactivar cuentas ni cambiar roles (ver renderUsers).
     Precios SÍ es visible y editable para el empleado. */
  var EMPLEADO_BLOCKED_VIEWS = ["reportes"];
  function enforceAccess() {
    if (DEMO) return true;             // demo: se permite ver el panel
    if (!token()) { window.location.href = "cuenta.html"; return false; }
    if (!hasAdminAccess()) { window.location.href = "perfil.html"; return false; }
    return true;
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function renderUserChip() {
    var u = cachedUser();
    var name = (u && u.full_name) || "Administrador";
    var roles = (u && u.roles) || [];
    var role = roles.indexOf("directivo") >= 0 ? "directivo"
             : (roles.indexOf("administrador") >= 0 ? "administrador"
             : (roles.indexOf("empleado") >= 0 ? "empleado" : (roles[0] || "usuario")));
    $("#admin-user-name").textContent = name;
    $("#admin-user-role").textContent = role;
    $("#admin-user-avatar").textContent = name.trim().charAt(0).toUpperCase();
  }

  function renderStats(s) {
    var cards = [
      { key: "orders", label: "Pedidos totales", value: s.orders, delta: s.dOrders, color: "var(--brand-blue)", bg: "var(--brand-blue-light)", icon: '<path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"/>' },
      { key: "sales", label: "Ventas del mes", value: mxn(s.sales), delta: s.dSales, color: "#15803D", bg: "#DCFCE7", icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>' },
      { key: "users", label: "Usuarios", value: s.users, delta: s.dUsers, color: "#7C3AED", bg: "#F3E8FF", icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
      { key: "pending", label: "Pendientes", value: s.pending, delta: s.dPending, color: "#B45309", bg: "#FEF3C7", icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' }
    ];
    /* El empleado puro no ve ni Ventas del mes ni Usuarios. */
    if (isEmpleadoOnly()) cards = cards.filter(function (c) { return c.key !== "sales" && c.key !== "users"; });
    $("#stat-grid").innerHTML = cards.map(function (c) {
      var up = c.delta >= 0;
      return '<div class="stat-card">' +
        '<div class="stat-card__top"><span class="stat-card__label">' + c.label + '</span>' +
        '<span class="stat-card__icon" style="background:' + c.bg + ';color:' + c.color + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + c.icon + '</svg></span></div>' +
        '<div class="stat-card__value">' + c.value + '</div>' +
        '<div class="stat-card__delta ' + (up ? "up" : "down") + '">' + (up ? "▲" : "▼") + " " + Math.abs(c.delta) + '% vs. mes anterior</div>' +
        '</div>';
    }).join("");
  }

  function renderSalesChart(data) {
    var W = 520, H = 200, pad = 28, n = data.length;
    var max = Math.max.apply(null, data.map(function (d) { return d.v; })) * 1.15;
    var bw = (W - pad * 2) / n * 0.55;
    var gap = (W - pad * 2) / n;
    var bars = data.map(function (d, i) {
      var h = (d.v / max) * (H - pad * 2);
      var x = pad + i * gap + (gap - bw) / 2;
      var y = H - pad - h;
      return '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"><title>' + d.d + ": " + mxn(d.v) + '</title></rect>' +
        '<text class="axis" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + d.d + '</text>';
    }).join("");
    $("#chart-sales").innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ventas de los últimos 7 días">' +
      '<defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#066CFF"/><stop offset="1" stop-color="#00C6FF"/></linearGradient></defs>' +
      bars + '</svg>';
  }

  function renderServiceBars(list) {
    if (!list || !list.length) { $("#chart-services").innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:18px 20px">Sin datos suficientes aún.</p>'; return; }
    var max = Math.max.apply(null, list.map(function (s) { return s.count; })) || 1;
    $("#chart-services").innerHTML = list.map(function (s) {
      var pct = Math.round((s.count / max) * 100);
      return '<div class="barlist__row"><div class="barlist__top"><b>' + esc(s.name) + '</b><span>' + s.count + '</span></div>' +
        '<div class="barlist__track"><div class="barlist__fill" style="width:' + pct + '%"></div></div></div>';
    }).join("");
  }

  function ordersRows(list, withSelect) {
    var money = ordersCanSeeMoney;
    var head = '<thead><tr><th>Folio</th><th>Cliente</th><th>Archivos</th><th>Total</th><th>Estado</th><th>Pago</th>' +
      (money ? '<th>Referencia</th>' : '') + '<th>Fecha</th><th></th></tr></thead>';
    var body = list.map(function (o) {
      var statusCell = withSelect
        ? '<select class="status-select" data-id="' + (o.id || o.code) + '">' + Object.keys(STATUS).map(function (k) {
            return '<option value="' + k + '"' + (k === o.status ? " selected" : "") + '>' + STATUS[k] + '</option>';
          }).join("") + '</select>'
        : badge(o.status);
      var refCell = money
        ? '<td class="mono" style="font-size:.78rem;color:var(--text-muted)">' + (o.payment_reference ? esc(o.payment_reference) : "—") + '</td>'
        : '';
      var oConfirm = o.client_confirmed_at
        ? '<br><span style="color:#047857;font-size:.78rem;font-weight:600" title="Confirmó por correo el ' + esc(String(o.client_confirmed_at)) + '">✓ Confirmó</span>'
        : '<br><span style="color:#b45309;font-size:.78rem" title="Aún no confirma desde su correo">⏳ Sin confirmar</span>';
      return '<tr><td class="mono">' + esc(o.code) + '</td><td>' + clientCell(o.user_id, o.client) + oConfirm + '</td><td>' + o.items + '</td>' +
        '<td class="mono">' + mxn(o.total) + '</td><td>' + statusCell + '</td>' +
        '<td>' + payBadge(o.payment_status) + '</td>' + refCell + '<td>' + esc(o.date) + '</td>' +
        '<td><button class="admin-btn-sm" data-view-order="' + esc(o.id || o.code) + '">Previsualizar</button>' + clientWaBtn(o) + '</td></tr>';
    }).join("");
    return head + '<tbody>' + body + '</tbody>';
  }

  function bindStatusSelects(scope) {
    $$(".status-select", scope).forEach(function (sel) {
      var prev = sel.value;   // valor previo, para revertir si el backend rechaza
      sel.addEventListener("change", function () {
        var nv = sel.value;
        DataSource.updateStatus(sel.dataset.id, nv).then(function (res) {
          if (!res || res.ok === false) {
            sel.value = prev;   // el backend NO cambió el estado: revertir y avisar
            window.alert((res && res.error) || "No se pudo cambiar el estado del pedido.");
            return;
          }
          prev = nv;
          loadDashboardCounts();
        }).catch(function () { sel.value = prev; window.alert("Sin conexión. No se cambió el estado."); });
      });
    });
  }

  /* ── Detalle de pedido (botón "Ver") ── */
  function cfgLabel(cfg) {
    if (!cfg) return "";
    if (typeof cfg === "string") { try { cfg = JSON.parse(cfg); } catch (e) { return ""; } }
    var L = { size: "Tamaño", color: "Color", sides: "Caras", finish: "Acabado", paper: "Papel", copies: "Copias" };
    var parts = [];
    Object.keys(L).forEach(function (k) { if (cfg[k] != null && cfg[k] !== "") parts.push(L[k] + ": " + cfg[k]); });
    return parts.join(" · ");
  }

  function escClose(e) { if (e.key === "Escape") closeOrderModal(); }
  function closeOrderModal() {
    var m = document.getElementById("order-modal");
    if (m) {
      (m._fileUrls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      m.remove();
    }
    document.body.style.overflow = "";
    document.removeEventListener("keydown", escClose);
  }

  /* ============================================================
     MODAL DE DETALLE DE CITA — previsualización del expediente.
     Usa los datos que ya devuelve /admin/appointments.php (trámite,
     personas, respuestas, contacto, notas). No requiere backend nuevo.
     ============================================================ */
  function apptEscClose(e) { if (e.key === "Escape") closeApptModal(); }
  function closeApptModal() {
    var m = document.getElementById("appt-modal");
    if (m) {
      (m._fileUrls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      m.remove();
    }
    document.body.style.overflow = "";
    document.removeEventListener("keydown", apptEscClose);
  }
  function apptRow(label, valueHtml) {
    if (!valueHtml) return "";
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0"><span style="color:var(--text-muted,#6b7280)">' + esc(label) + '</span><span style="text-align:right;font-weight:600">' + valueHtml + '</span></div>';
  }
  /* Panel "Fijar anticipo" (cotización) del modal de cita. Solo aparece en trámites
     que se cotizan (needs_quote: apostille/médica). Al guardar, el backend avisa al
     cliente por correo con un botón de pago. Espejo de quotePanel de pedidos. */
  function apptQuotePanel(a) {
    if ((a.payment_status || "pendiente") === "pagado") return "";
    var needsQuote = (+a.needs_quote === 1) || (String(a.needs_quote) === "1");
    if (!needsQuote) return "";   // SOLO trámites sin precio fijo; el resto ya tiene anticipo
    var total = +a.amount_total || 0;
    var pending = !a.quoted_at;
    var banner = pending
      ? '<div style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:10px 12px;font-size:.85rem;margin:0 0 10px">Esta cita está <b>por cotizar</b>. Ponle el pago y el cliente recibirá un correo para pagarlo en línea.</div>'
      : "";
    return '<h4 style="margin:0 0 6px;font-size:.95rem">Fijar pago (cotización)</h4>' +
      '<div style="background:#f8fafc;border-radius:8px;padding:12px 14px;margin:0 0 16px">' +
        banner +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<span style="color:var(--text-muted,#6b7280);font-size:.85rem">Pago (MXN)</span>' +
          '<input type="number" id="appt-price-input" min="1" step="0.01" value="' + (total > 0 ? total : "") + '" placeholder="0.00" style="width:130px;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:.9rem">' +
          '<button type="button" class="btn btn--primary btn--sm" id="appt-price-save">Guardar y avisar al cliente</button>' +
        '</div>' +
        '<div id="appt-price-msg" style="font-size:.82rem;margin-top:8px"></div>' +
      '</div>';
  }

  /* Confirmar manualmente el pago de una cita (efectivo/transferencia o aprobado en
     MP). Solo si hay un monto y aún no está pagada. Le llega un correo al cliente. */
  function apptPayConfirm(a) {
    var pay = a.payment_status || "pendiente";
    var amount = (a.amount_total != null && a.amount_total !== "" && +a.amount_total > 0) ? +a.amount_total : 0;
    if (pay === "pagado" || amount <= 0) return "";
    return '<div style="background:#f8fafc;border-radius:8px;padding:12px 14px;margin:0 0 16px;display:flex;flex-direction:column;gap:6px">' +
        '<button type="button" class="btn btn--primary btn--sm" id="appt-paid-btn">Marcar como pagado</button>' +
        '<span style="font-size:.78rem;color:var(--text-muted,#6b7280)">Úsalo si el cliente pagó en efectivo/transferencia o ya aparece aprobado en Mercado Pago. Se le envía un correo de confirmación.</span>' +
        '<div id="appt-paid-msg" style="font-size:.82rem"></div>' +
      '</div>';
  }

  function openApptModal(a) {
    closeApptModal();
    var svc = TRAMITE_LABEL[a.tramite] || a.tramite;
    if (a.tramite === "pasaporte" && a.passport_subtype) svc += " (" + (SUBTYPE_LABEL[a.passport_subtype] || a.passport_subtype) + ")";
    var waD = waDigits(a.contact_phone);
    var phoneHtml = a.contact_phone
      ? (waD ? '<a href="https://wa.me/' + waD + '" target="_blank" rel="noopener">' + esc(a.contact_phone) + '</a>' : esc(a.contact_phone))
      : "";
    var prefLbl = { whatsapp: "WhatsApp", llamada: "Llamada", correo: "Correo" };

    var files = (a.files && a.files.length) ? a.files : [];
    /* Tarjeta de un documento: preview (img/PDF) + descarga. Usa el índice GLOBAL
       del archivo en a.files para el id del wrap, así loadApptFileInto lo localiza. */
    function fileCardHtml(f, gi) {
      var isImg = /^image\//.test(f.mime_type || "");
      var icon = isImg
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-3.1-3.1a2 2 0 00-2.8 0L6 21"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>';
      return '<div class="doc-item">' +
        '<div class="doc-item__head">' +
          '<span class="doc-item__icon">' + icon + '</span>' +
          '<span class="doc-item__name"><b>' + esc(f.doc_label || f.doc_key || "Documento") + '</b>' +
            '<span>' + esc(f.original_name || "") + '</span></span>' +
          '<span class="doc-item__actions">' +
            '<button type="button" class="btn btn--light btn--sm" data-apptfile-dl="' + gi + '" disabled>Descargar</button>' +
          '</span>' +
        '</div>' +
        '<div class="doc-item__preview" id="apptfilewrap-' + gi + '"><p>Cargando vista previa…</p></div>' +
      '</div>';
    }
    /* Agrupar documentos por persona (guest_index). Los que no traen persona
       (citas anteriores a la mejora) van a "Documentos generales de la cita". */
    var filesByGuest = {}, generalFiles = [];
    files.forEach(function (f, idx) {
      var gi = (f.guest_index === 0 || f.guest_index) ? parseInt(f.guest_index, 10) : NaN;
      if (isNaN(gi)) generalFiles.push({ f: f, idx: idx });
      else (filesByGuest[gi] = filesByGuest[gi] || []).push({ f: f, idx: idx });
    });

    var guests = parseGuests(a.guests_json);
    /* Si llegan documentos por persona pero la cita no trae guests_json, se crean
       tarjetas mínimas para que ningún documento quede oculto. */
    var guestList = guests.slice();
    var maxGi = -1; Object.keys(filesByGuest).forEach(function (k) { maxGi = Math.max(maxGi, parseInt(k, 10)); });
    while (guestList.length <= maxGi) guestList.push({});

    var guestsHtml = "";
    if (guestList.length) {
      /* Las RESPUESTAS del cuestionario ya NO se muestran aquí: van en el
         expediente (PDF). En el panel solo dejamos a cada persona y sus
         documentos (que el trabajador puede ver y descargar). */
      guestsHtml = '<h4 style="margin:16px 0 4px;font-size:.95rem">Personas y documentos</h4>' +
        '<p style="margin:0 0 10px;font-size:.8rem;color:var(--text-muted,#6b7280)">Las respuestas del cuestionario están en el <b>expediente (PDF)</b> — botón de abajo.</p>' +
        guestList.map(function (g, i) {
          var meta = [];
          if (g.dob) meta.push("Nac. " + esc(g.dob));
          if (g.doctype) meta.push(esc(DOCTYPE_LABEL[g.doctype] || g.doctype));
          var gFiles = filesByGuest[i] || [];
          var docsHtml = '<div class="guest-docs">' +
            '<div class="guest-docs__title">📎 Documentos subidos (' + gFiles.length + ')</div>' +
            (gFiles.length ? gFiles.map(function (x) { return fileCardHtml(x.f, x.idx); }).join("")
              : '<div class="doc-empty">No subió documentos (puede traerlos en físico).</div>') +
            '</div>';
          return '<div class="guest-card">' +
            '<div class="guest-card__head">' + (i + 1) + '. ' + esc(g.name || "—") +
              (meta.length ? '<span class="guest-card__meta">· ' + meta.join(" · ") + '</span>' : '') + '</div>' +
            docsHtml + '</div>';
        }).join("");
    }

    /* Servicios adicionales (venta cruzada) — tipo ticket. parseGuests sirve como parser genérico de arreglo JSON. */
    var services = parseGuests(a.services_json);
    var servicesHtml = services.length
      ? '<h4 style="margin:16px 0 6px;font-size:.95rem">Servicios adicionales</h4>' +
        '<div style="font-size:.9rem;background:#f8fafc;border-radius:8px;padding:6px 14px;margin:0 0 16px">' +
          services.map(function (s) {
            return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span style="color:#1d9e75;font-weight:700">✓</span><span>' + esc(s.label || s.key || "") + '</span></div>';
          }).join("") + '</div>'
      : "";

    /* Documentos sin persona asignada (citas anteriores a la mejora por-persona);
       si no hay personas ni archivos, se muestra el aviso de "sin documentos". */
    var generalFilesHtml = "";
    if (generalFiles.length) {
      generalFilesHtml = '<h4 style="margin:16px 0 6px;font-size:.95rem">Documentos generales de la cita</h4>' +
        generalFiles.map(function (x) { return fileCardHtml(x.f, x.idx); }).join("");
    } else if (!guestList.length && !files.length) {
      generalFilesHtml = '<h4 style="margin:16px 0 6px;font-size:.95rem">Documentos del cliente</h4>' +
        '<p style="margin:0 0 16px;font-size:.88rem;color:var(--text-muted,#6b7280)">El cliente no adjuntó documentos.</p>';
    }

    var ov = document.createElement("div");
    ov.id = "appt-modal";
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)";
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:680px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div class="shopmodal__head">' +
          '<div><div class="mono" style="font-weight:700;font-size:1.05rem">' + esc(a.code) + '</div>' +
          '<div style="font-size:.8rem;color:var(--text-muted,#6b7280)">Cita · ' + esc(a.date || "") + ' ' + esc(a.time || "") + '</div></div>' +
          badge(a.status, APPT_STATUS) +
        '</div>' +
        '<div style="padding:18px 20px">' +
          confirmBanner(a.client_confirmed_at) +
          '<h4 style="margin:0 0 4px;font-size:.95rem">Trámite a realizar</h4>' +
          '<div style="font-size:1.1rem;font-weight:700;color:var(--brand-blue,#066CFF);margin:0 0 10px">' + esc(svc) + '</div>' +
          '<div style="font-size:.9rem;background:#f8fafc;border-radius:8px;padding:8px 14px;margin:0 0 16px">' +
            apptRow("Personas", String(a.party_size || 1)) +
            apptRow("Fecha", esc(a.date || "—")) +
            apptRow("Hora", esc(a.time || "—")) +
            (window.OKCitaPriceText ? apptRow("Precio estimado", esc(window.OKCitaPriceText(a.tramite, a.passport_subtype, a.party_size))) : "") +
            (function () {
              /* Estado del ANTICIPO: el trabajador ve si el cliente pagó (y cuánto/ cuándo). */
              var ps = a.payment_status || "pendiente";
              var payable = (a.amount_total != null && a.amount_total !== "" && +a.amount_total > 0);
              if (!payable && ps === "pendiente") return "";
              var v = ps === "pagado"
                  ? '<span style="color:#047857;font-weight:700">✓ Pagado</span>' + (a.payment_amount != null && a.payment_amount !== "" ? ' <span style="color:var(--text-muted,#6b7280);font-weight:400">' + esc(mxn(a.payment_amount)) + (a.payment_date ? ' · ' + esc(String(a.payment_date)) : '') + '</span>' : '')
                : ps === "procesando"  ? '<span style="color:#b45309;font-weight:700">⏳ En proceso</span>'
                : ps === "reembolsado" ? '<span style="color:#6b7280;font-weight:700">↩ Reembolsado</span>'
                : ps === "error"       ? '<span style="color:#b91c1c;font-weight:700">✕ Error en el pago</span>'
                :                        '<span style="color:#b45309;font-weight:700">⏳ Pendiente</span>';
              return apptRow("Pago", v);
            })() +
          '</div>' +
          apptQuotePanel(a) +
          apptPayConfirm(a) +
          servicesHtml +
          '<h4 style="margin:0 0 6px;font-size:.95rem">Contacto</h4>' +
          '<div style="font-size:.9rem;background:#f8fafc;border-radius:8px;padding:8px 14px;margin:0 0 16px">' +
            apptRow("Nombre", esc(a.contact_name || "—") + (a.account_name ? "" : ' <span style="font-weight:400;color:var(--text-muted,#6b7280)">(invitado)</span>')) +
            apptRow("Teléfono", phoneHtml || "—") +
            (a.contact_email ? apptRow("Correo", '<a href="mailto:' + esc(a.contact_email) + '">' + esc(a.contact_email) + '</a>') : "") +
            (a.contact_pref ? apptRow("Prefiere contacto por", esc(prefLbl[a.contact_pref] || a.contact_pref)) : "") +
          '</div>' +
          (a.notes ? '<h4 style="margin:0 0 6px;font-size:.95rem">Notas del cliente</h4><p style="margin:0 0 16px;font-size:.9rem;white-space:pre-wrap;background:#f8fafc;border-radius:8px;padding:10px 12px">' + esc(a.notes) + '</p>' : "") +
          (a.staff_notes ? '<h4 style="margin:0 0 6px;font-size:.95rem">Notas internas</h4><p style="margin:0 0 16px;font-size:.9rem;white-space:pre-wrap;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px">' + esc(a.staff_notes) + '</p>' : "") +
          guestsHtml +
          generalFilesHtml +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid #eef0f4;flex-wrap:wrap">' +
          (waD ? '<a class="btn btn--sm" style="background:#25D366;color:#fff;border-color:#25D366" href="https://wa.me/' + waD + '" target="_blank" rel="noopener">Escribir por WhatsApp</a>' : '<span></span>') +
          '<span style="display:flex;gap:8px">' +
            (window.OKCitaExpedienteDownload ? '<button type="button" class="btn btn--light btn--sm" id="appt-modal-pdf">Descargar expediente (PDF)</button>' : '') +
            '<button type="button" class="btn btn--primary btn--sm" id="appt-modal-close">Cerrar</button>' +
          '</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    ov.addEventListener("click", function (e) { if (e.target === ov) closeApptModal(); });
    $("#appt-modal-close", ov).addEventListener("click", closeApptModal);

    /* Guardar el anticipo de la cotización y avisar al cliente por correo. */
    var apptSave = $("#appt-price-save", ov);
    if (apptSave) apptSave.addEventListener("click", function () {
      var inp = $("#appt-price-input", ov), msg = $("#appt-price-msg", ov);
      var val = Math.round((parseFloat(inp && inp.value) || 0) * 100) / 100;
      if (!(val > 0)) { msg.style.color = "#b91c1c"; msg.textContent = "Ingresa un pago válido mayor a $0."; if (inp) inp.focus(); return; }
      var orig = apptSave.textContent;
      apptSave.disabled = true; apptSave.textContent = "Guardando…";
      msg.style.color = "var(--text-muted,#6b7280)"; msg.textContent = "";
      DataSource.setApptPrice(a.id || a.code, val).then(function (res) {
        apptSave.disabled = false; apptSave.textContent = orig;
        if (res && res.ok) {
          a.amount_total = val; a.needs_quote = 0; a.quoted_at = "1";
          msg.style.color = "#166534";
          msg.textContent = res.emailed
            ? "Pago guardado. Se envió el correo al cliente con el botón de pago."
            : "Pago guardado. (No se pudo enviar el correo — verifica el correo del cliente.)";
        } else {
          msg.style.color = "#b91c1c";
          msg.textContent = (res && res.error) || "No se pudo guardar el pago.";
        }
      }).catch(function () {
        apptSave.disabled = false; apptSave.textContent = orig;
        msg.style.color = "#b91c1c"; msg.textContent = "Sin conexión con el servidor.";
      });
    });
    /* Confirmar el pago de la cita manualmente (efectivo/transferencia o aprobado en MP). */
    var apptPaidBtn = $("#appt-paid-btn", ov);
    if (apptPaidBtn) apptPaidBtn.addEventListener("click", function () {
      var msg = $("#appt-paid-msg", ov);
      if (!window.confirm("¿Confirmar que esta cita ya está PAGADA? Se le enviará un correo de confirmación al cliente.")) return;
      var orig = apptPaidBtn.textContent;
      apptPaidBtn.disabled = true; apptPaidBtn.textContent = "Guardando…";
      if (msg) { msg.style.color = "var(--text-muted,#6b7280)"; msg.textContent = ""; }
      DataSource.setApptPaid(a.id || a.code, "pagado").then(function (res) {
        if (res && res.ok) {
          a.payment_status = "pagado";
          if (msg) { msg.style.color = "#166534"; msg.textContent = "Pago confirmado. Se avisó al cliente por correo."; }
          apptPaidBtn.style.display = "none";
        } else {
          apptPaidBtn.disabled = false; apptPaidBtn.textContent = orig;
          if (msg) { msg.style.color = "#b91c1c"; msg.textContent = (res && res.error) || "No se pudo confirmar el pago."; }
        }
      }).catch(function () {
        apptPaidBtn.disabled = false; apptPaidBtn.textContent = orig;
        if (msg) { msg.style.color = "#b91c1c"; msg.textContent = "Sin conexión con el servidor."; }
      });
    });

    var pdfb = $("#appt-modal-pdf", ov);
    if (pdfb) pdfb.addEventListener("click", function () {
      window.OKCitaExpedienteDownload({ code: a.code, tramite: a.tramite, passport_subtype: a.passport_subtype, party_size: a.party_size, date: a.date, time: a.time, status: a.status, name: a.contact_name, phone: a.contact_phone, guests: parseGuests(a.guests_json), services: parseGuests(a.services_json), files: a.files });
    });
    files.forEach(function (f, idx) { loadApptFileInto(ov, idx, f.id, f.original_name, f.mime_type); });
    document.addEventListener("keydown", apptEscClose);
  }

  /* Carga un DOCUMENTO de la cita (con token) y habilita previsualizar/descargar.
     Imágenes → <img>; PDF → <iframe>. Sirve desde /appointments/file.php. */
  function loadApptFileInto(modal, idx, fileId, name, mime) {
    var wrap = modal.querySelector("#apptfilewrap-" + idx);
    var dl = modal.querySelector('[data-apptfile-dl="' + idx + '"]');
    if (!wrap) return;
    if (!fileId) { wrap.innerHTML = '<p>Archivo no disponible.</p>'; return; }
    fetch(API_BASE + "/appointments/file.php?id=" + encodeURIComponent(fileId), { headers: { Authorization: "Bearer " + token() } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        (modal._fileUrls = modal._fileUrls || []).push(url);
        var isImg = /^image\//.test(mime || "");
        wrap.innerHTML = isImg
          ? '<img src="' + url + '" alt="' + esc(name || "Documento") + '">'
          : '<iframe src="' + url + '" title="' + esc(name || "Documento") + '"></iframe>';
        if (dl) { dl.disabled = false; dl.onclick = function () { var x = document.createElement("a"); x.href = url; x.download = name || ("documento-" + idx); document.body.appendChild(x); x.click(); x.remove(); }; }
      })
      .catch(function () {
        wrap.innerHTML = '<p style="color:#b91c1c">No se pudo cargar el archivo.</p>';
      });
  }

  /* Carga el ARCHIVO del cliente (con token) en su visor y habilita descargar/imprimir. */
  function loadFileInto(modal, idx, fid, name) {
    var wrap = modal.querySelector("#filewrap-" + idx);
    var dl = modal.querySelector('[data-file-dl="' + idx + '"]');
    var pr = modal.querySelector('[data-file-print="' + idx + '"]');
    if (!wrap) return;
    if (!fid) { wrap.innerHTML = '<p style="color:var(--text-muted,#6b7280);font-size:.85rem;text-align:center;padding:20px 0;margin:0">Archivo no disponible.</p>'; return; }
    fetch(API_BASE + "/orders/file.php?id=" + encodeURIComponent(fid), { headers: { Authorization: "Bearer " + token() } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        (modal._fileUrls = modal._fileUrls || []).push(url);
        var frameId = "file-frame-" + idx;
        wrap.innerHTML = '<iframe id="' + frameId + '" src="' + url + '" style="width:100%;height:380px;border:1px solid #eef0f4;border-radius:10px;background:#fff" title="' + esc(name || "Archivo") + '"></iframe>';
        if (dl) { dl.disabled = false; dl.onclick = function () { var a = document.createElement("a"); a.href = url; a.download = name || ("archivo-" + idx); document.body.appendChild(a); a.click(); a.remove(); }; }
        if (pr) { pr.disabled = false; pr.onclick = function () { var f = document.getElementById(frameId); try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(url, "_blank"); } }; }
      })
      .catch(function () {
        wrap.innerHTML = '<p style="color:var(--text-muted,#6b7280);font-size:.85rem;text-align:center;padding:20px 0;margin:0">No se pudo cargar el archivo.</p>';
      });
  }

  /* Panel "Pago" del detalle del pedido (en el modal admin).
     Los montos/referencia solo llegan del backend para administrador/directivo. */
  function paymentPanel(o) {
    var pay = o.payment_status || "pendiente";
    var rows = [];
    rows.push('<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:var(--text-muted,#6b7280)">Estado del pago</span>' + payBadge(pay) + '</div>');
    if (o.payment_amount != null && o.payment_amount !== "") rows.push('<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:var(--text-muted,#6b7280)">Monto pagado</span><b class="mono">' + mxn(o.payment_amount) + '</b></div>');
    if (o.payment_provider) rows.push('<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:var(--text-muted,#6b7280)">Método</span><span>' + esc(o.payment_provider) + '</span></div>');
    if (o.payment_reference) rows.push('<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:var(--text-muted,#6b7280)">Referencia</span><span class="mono" style="font-size:.8rem">' + esc(o.payment_reference) + '</span></div>');
    if (o.payment_date) rows.push('<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:var(--text-muted,#6b7280)">Fecha de pago</span><span>' + esc(String(o.payment_date).slice(0, 16).replace("T", " ")) + '</span></div>');
    if (o.payment_transaction_id) rows.push('<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:var(--text-muted,#6b7280)">ID transacción</span><span class="mono" style="font-size:.78rem;word-break:break-all">' + esc(o.payment_transaction_id) + '</span></div>');
    /* Confirmación manual: el trabajador marca el pago como recibido (efectivo/
       transferencia, o cuando ya aparece aprobado en Mercado Pago y el webhook no
       llegó). Al cliente le llega el correo de confirmación. */
    var canConfirm = ordersPaymentsEnabled && pay !== "pagado" && (+o.total || 0) > 0;
    var confirmHtml = canConfirm
      ? '<div style="border-top:1px solid #e5e7eb;margin-top:4px;padding-top:10px;display:flex;flex-direction:column;gap:6px">' +
          '<button type="button" class="btn btn--primary btn--sm" id="order-paid-btn">Marcar como pagado</button>' +
          '<span style="font-size:.78rem;color:var(--text-muted,#6b7280)">Úsalo si el cliente pagó en efectivo/transferencia o ya aparece aprobado en Mercado Pago. Se le envía un correo de confirmación.</span>' +
          '<div id="order-paid-msg" style="font-size:.82rem"></div>' +
        '</div>'
      : "";
    return '<h4 style="margin:0 0 6px;font-size:.95rem">Pago</h4>' +
      '<div style="display:flex;flex-direction:column;gap:6px;font-size:.9rem;background:#f8fafc;border-radius:8px;padding:12px 14px;margin:0 0 16px">' + rows.join("") + confirmHtml + '</div>';
  }

  /* Panel "Fijar precio" (cotización) del detalle del pedido en el modal admin.
     Permite a la trabajadora poner el precio final de un pedido por cotizar; al
     guardar, el backend avisa al cliente por correo con un botón de pago. */
  function quotePanel(o) {
    if ((o.payment_status || "pendiente") === "pagado") return "";  // ya pagado: no se recotiza
    var needsQuote = (+o.needs_quote === 1) || (String(o.needs_quote) === "1");
    if (!needsQuote) return "";   // SOLO se cotizan los casos especiales (gran formato); el resto ya tiene precio
    var total = +o.total || 0;
    var pending = !o.quoted_at;   // por cotizar y aún sin precio fijado
    var banner = pending
      ? '<div style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:10px 12px;font-size:.85rem;margin:0 0 10px">Este pedido está <b>por cotizar</b>. Ponle el precio final y el cliente recibirá un correo para pagarlo en línea.</div>'
      : "";
    return '<h4 style="margin:0 0 6px;font-size:.95rem">Fijar precio (cotización)</h4>' +
      '<div style="background:#f8fafc;border-radius:8px;padding:12px 14px;margin:0 0 16px">' +
        banner +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<span style="color:var(--text-muted,#6b7280);font-size:.85rem">Precio final (IVA incl.)</span>' +
          '<input type="number" id="order-price-input" min="1" step="0.01" value="' + (total > 0 ? total : "") + '" placeholder="0.00" style="width:130px;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:.9rem">' +
          '<button type="button" class="btn btn--primary btn--sm" id="order-price-save">Guardar y avisar al cliente</button>' +
        '</div>' +
        '<div id="order-price-msg" style="font-size:.82rem;margin-top:8px"></div>' +
      '</div>';
  }

  function openOrderModal(o) {
    closeOrderModal();
    var items = o.items || [];
    var c = o.client || {};

    var filesHtml = items.map(function (it, idx) {
      var cfg = cfgLabel(it.config_json || it.config);
      var bits = [cfg, "x" + (it.qty || 1), (it.pages ? it.pages + " pág." : "")].filter(Boolean).join(" · ");
      return '<div style="border:1px solid #eef0f4;border-radius:12px;padding:14px;margin-bottom:14px">' +
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap">' +
            '<div style="min-width:0"><b style="font-size:.95rem;word-break:break-word">' + esc(it.original_name || "Archivo") + '</b>' +
            (bits ? '<div style="color:var(--text-muted,#6b7280);font-size:.82rem;margin-top:3px">' + esc(bits) + '</div>' : '') + '</div>' +
            '<div style="display:flex;gap:8px;flex-shrink:0">' +
              '<button type="button" class="btn btn--light btn--sm" data-file-dl="' + idx + '" disabled>Descargar</button>' +
              '<button type="button" class="btn btn--primary btn--sm" data-file-print="' + idx + '" disabled>Imprimir</button>' +
            '</div>' +
          '</div>' +
          '<div id="filewrap-' + idx + '"><p style="color:var(--text-muted,#6b7280);font-size:.85rem;text-align:center;padding:24px 0;margin:0">Cargando archivo…</p></div>' +
        '</div>';
    }).join("") || '<p style="color:var(--text-muted,#6b7280)">Este pedido no tiene archivos.</p>';

    var ov = document.createElement("div");
    ov.id = "order-modal";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)";
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:780px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div class="shopmodal__head">' +
          '<div><div style="font-weight:700;font-size:1.05rem">' + esc(o.code) + '</div>' +
          '<div style="font-size:.8rem;color:var(--text-muted,#6b7280)">' + esc(String(o.created_at || o.date || "").slice(0, 10)) + '</div></div>' +
          badge(o.status) +
        '</div>' +
        '<div style="padding:18px 20px">' +
          confirmBanner(o.client_confirmed_at) +
          '<h4 style="margin:0 0 6px;font-size:.95rem">Cliente</h4>' +
          '<p style="margin:0 0 16px;font-size:.9rem;line-height:1.5">' + esc(c.name || o.client_name || "—") +
            (c.email ? '<br><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
            (c.phone ? '<br><a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '') +
          '</p>' +
          (o.comments ? '<h4 style="margin:0 0 6px;font-size:.95rem">Indicaciones del cliente</h4><p style="margin:0 0 16px;font-size:.9rem;white-space:pre-wrap;background:#f8fafc;border-radius:8px;padding:10px 12px">' + esc(o.comments) + '</p>' : '') +
          '<h4 style="margin:0 0 6px;font-size:.95rem">Importe</h4>' +
          '<div style="display:flex;flex-direction:column;gap:6px;font-size:.9rem;background:#f8fafc;border-radius:8px;padding:12px 14px;margin:0 0 16px">' +
            '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted,#6b7280)">Subtotal</span><b class="mono">' + mxn(+o.subtotal || 0) + '</b></div>' +
            '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted,#6b7280)">IVA (8%)</span><b class="mono">' + mxn(+o.tax || 0) + '</b></div>' +
            '<div style="display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;padding-top:6px"><span>Total</span><b class="mono">' + mxn(+o.total || 0) + '</b></div>' +
          '</div>' +
          quotePanel(o) +
          paymentPanel(o) +
          '<h4 style="margin:0 0 10px;font-size:.95rem">Ticket del cliente</h4>' +
          '<div style="border:1px solid #eef0f4;border-radius:12px;padding:14px;margin-bottom:16px">' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px">' +
              '<button type="button" class="btn btn--light btn--sm" data-ticket-dl disabled>Descargar</button>' +
              '<button type="button" class="btn btn--primary btn--sm" data-ticket-print disabled>Imprimir</button>' +
            '</div>' +
            '<div id="ticketwrap"><p style="color:var(--text-muted,#6b7280);font-size:.85rem;text-align:center;padding:18px 0;margin:0">Cargando ticket…</p></div>' +
          '</div>' +
          '<h4 style="margin:0 0 10px;font-size:.95rem">Documento(s) a imprimir del cliente</h4>' +
          filesHtml +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;padding:14px 20px;border-top:1px solid #eef0f4">' +
          '<button type="button" class="btn btn--primary btn--sm" id="order-modal-close">Cerrar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    ov.addEventListener("click", function (e) { if (e.target === ov) closeOrderModal(); });
    $("#order-modal-close", ov).addEventListener("click", closeOrderModal);
    document.addEventListener("keydown", escClose);

    /* Guardar el precio de la cotización y avisar al cliente por correo. */
    var saveBtn = $("#order-price-save", ov);
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var inp = $("#order-price-input", ov);
      var msg = $("#order-price-msg", ov);
      var val = Math.round((parseFloat(inp && inp.value) || 0) * 100) / 100;
      if (!(val > 0)) { msg.style.color = "#b91c1c"; msg.textContent = "Ingresa un precio válido mayor a $0."; if (inp) inp.focus(); return; }
      var orig = saveBtn.textContent;
      saveBtn.disabled = true; saveBtn.textContent = "Guardando…";
      msg.style.color = "var(--text-muted,#6b7280)"; msg.textContent = "";
      DataSource.setPrice(o.id || o.code, val).then(function (res) {
        saveBtn.disabled = false; saveBtn.textContent = orig;
        if (res && res.ok) {
          o.total = val; o.needs_quote = 0;
          msg.style.color = "#166534";
          msg.textContent = res.emailed
            ? "Precio guardado. Se envió el correo al cliente con el botón de pago."
            : "Precio guardado. (No se pudo enviar el correo — verifica el correo del cliente.)";
          renderOrdersTable();
        } else {
          msg.style.color = "#b91c1c";
          msg.textContent = (res && res.error) || "No se pudo guardar el precio.";
        }
      }).catch(function () {
        saveBtn.disabled = false; saveBtn.textContent = orig;
        msg.style.color = "#b91c1c"; msg.textContent = "Sin conexión con el servidor.";
      });
    });

    /* Confirmar el pago manualmente (efectivo/transferencia o aprobado en MP). */
    var paidBtn = $("#order-paid-btn", ov);
    if (paidBtn) paidBtn.addEventListener("click", function () {
      var msg = $("#order-paid-msg", ov);
      if (!window.confirm("¿Confirmar que este pedido ya está PAGADO? Se le enviará un correo de confirmación al cliente.")) return;
      var orig = paidBtn.textContent;
      paidBtn.disabled = true; paidBtn.textContent = "Guardando…";
      if (msg) { msg.style.color = "var(--text-muted,#6b7280)"; msg.textContent = ""; }
      DataSource.setOrderPaid(o.id || o.code, "pagado").then(function (res) {
        if (res && res.ok) {
          o.payment_status = "pagado";
          if (msg) { msg.style.color = "#166534"; msg.textContent = "Pago confirmado. Se avisó al cliente por correo."; }
          paidBtn.style.display = "none";
          renderOrdersTable();
        } else {
          paidBtn.disabled = false; paidBtn.textContent = orig;
          if (msg) { msg.style.color = "#b91c1c"; msg.textContent = (res && res.error) || "No se pudo confirmar el pago."; }
        }
      }).catch(function () {
        paidBtn.disabled = false; paidBtn.textContent = orig;
        if (msg) { msg.style.color = "#b91c1c"; msg.textContent = "Sin conexión con el servidor."; }
      });
    });

    items.forEach(function (it, idx) { loadFileInto(ov, idx, it.uploaded_file_id, it.original_name); });
    loadTicketInto(ov, o.id || o.code);
  }

  /* Carga el TICKET (comprobante) del pedido en el modal y habilita descargar/imprimir. */
  function loadTicketInto(modal, orderId) {
    var wrap = modal.querySelector("#ticketwrap");
    var dl = modal.querySelector("[data-ticket-dl]");
    var pr = modal.querySelector("[data-ticket-print]");
    if (!wrap) return;
    fetch(API_BASE + "/orders/ticket.php?id=" + encodeURIComponent(orderId), { headers: { Authorization: "Bearer " + token() } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        (modal._fileUrls = modal._fileUrls || []).push(url);
        wrap.innerHTML = '<iframe id="ticket-frame" src="' + url + '" style="width:100%;height:340px;border:1px solid #eef0f4;border-radius:10px;background:#fff" title="Ticket del cliente"></iframe>';
        if (dl) { dl.disabled = false; dl.onclick = function () { var a = document.createElement("a"); a.href = url; a.download = "ticket-" + orderId + ".pdf"; document.body.appendChild(a); a.click(); a.remove(); }; }
        if (pr) { pr.disabled = false; pr.onclick = function () { var f = document.getElementById("ticket-frame"); try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(url, "_blank"); } }; }
      })
      .catch(function () {
        wrap.innerHTML = '<p style="color:var(--text-muted,#6b7280);font-size:.85rem;text-align:center;padding:18px 0;margin:0">El ticket de este pedido aún no está disponible.</p>';
      });
  }

  function viewOrder(id) {
    DataSource.orderDetail(id).then(function (res) {
      if (!res || !res.ok || !res.order) { window.alert("No se pudo cargar el detalle del pedido."); return; }
      openOrderModal(res.order);
    }).catch(function () { window.alert("Sin conexión al cargar el pedido."); });
  }

  function bindOrderView(scope) {
    $$("[data-view-order]", scope).forEach(function (b) {
      b.addEventListener("click", function () { viewOrder(b.dataset.viewOrder); });
    });
  }
  /* Abre el historial del cliente al hacer clic en su nombre (en Pedidos y Citas). */
  function bindClientLinks(scope) {
    $$(".client-link[data-uview]", scope).forEach(function (b) {
      b.addEventListener("click", function () { viewUser(b.dataset.uview); });
    });
  }

  function renderRecentOrders() {
    DataSource.orders("").then(function (list) {
      var host = $("#recent-orders");
      host.innerHTML = ordersRows(list.slice(0, 5), false);
      bindOrderView(host);
      bindClientLinks(host);
    });
  }

  /* Citas próximas (Dashboard): las más cercanas en fecha/hora, para que el
     empleado sepa qué sigue. Cada fila lleva a esa cita en su tabla. */
  function renderUpcoming(list) {
    var host = $("#upcoming-appts");
    if (!host) return;
    list = list || [];
    var head = '<thead><tr><th>Cuándo</th><th>Servicio</th><th>Cliente</th><th>Estado</th></tr></thead>';
    if (!list.length) {
      host.innerHTML = head + '<tbody><tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No hay citas próximas.</td></tr></tbody>';
      return;
    }
    var today = todayStr();
    var body = list.map(function (a) {
      var when = (a.date === today ? '<b style="color:var(--brand-blue)">Hoy</b>' : esc(a.date)) + ' · <b class="mono">' + esc(a.time) + '</b>';
      return '<tr class="upcoming-row" data-gocita="' + esc(a.code) + '" style="cursor:pointer">' +
        '<td>' + when + '</td>' +
        '<td>' + esc(TRAMITE_LABEL[a.tramite] || a.tramite) + '</td>' +
        '<td><b>' + esc(a.contact_name) + '</b></td>' +
        '<td>' + badge(a.status, APPT_STATUS) + '</td></tr>';
    }).join("");
    host.innerHTML = head + '<tbody>' + body + '</tbody>';
    $$("[data-gocita]", host).forEach(function (b) {
      b.addEventListener("click", function () { goToAppt(b.dataset.gocita); });
    });
  }
  /* Estado actual de la vista Pedidos: chip de estado, chip de pago y búsqueda. */
  var orderStatus = "", orderPayment = "", orderSearch = "";
  function renderOrdersTable() {
    var q = (orderSearch || "").trim();
    DataSource.orders(orderStatus || "", orderPayment || "", q).then(function (list) {
      var t = $("#orders-table");
      /* Una sola hilera de filtros si el pago en línea no está activo. */
      var payRow = $("#order-pay-filters");
      if (payRow) { var bar = payRow.closest(".admin-toolbar"); if (bar) bar.style.display = ordersPaymentsEnabled ? "" : "none"; }
      if (!list.length) {
        var money = ordersCanSeeMoney;
        var cols = 7 + (money ? 1 : 0);
        var msg = q ? 'No se encontraron pedidos para “' + esc(q) + '”.' : "No hay pedidos para este filtro.";
        t.innerHTML = '<thead><tr><th>Folio</th><th>Cliente</th><th>Archivos</th><th>Total</th><th>Estado</th><th>Pago</th>' +
          (money ? '<th>Referencia</th>' : '') + '<th>Fecha</th><th></th></tr></thead>' +
          '<tbody><tr><td colspan="' + cols + '" style="text-align:center;color:var(--text-muted);padding:24px">' + msg + '</td></tr></tbody>';
        return;
      }
      t.innerHTML = ordersRows(list, true);
      bindStatusSelects(t);
      bindOrderView(t);
      bindClientLinks(t);
    });
  }
  /* ── Pedidos de la TIENDA (e-commerce) ── */
  var SHOP_STATUS = { recibido: "Recibido", en_preparacion: "En preparación", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
  var shopCanSeeMoney = true, shopStatus = "", shopPayment = "", shopSearch = "";

  /* ── Detalle de una compra: QUÉ pidió el cliente ──
     La tabla solo mostraba CUÁNTOS productos ("1"), no cuáles: para surtir un pedido
     había que ir a la base. Aquí se listan con su cantidad e importe.
     Los renglones son el SNAPSHOT guardado al comprar (shop_order_items), no el
     catálogo de hoy: si mañana cambia el precio o el nombre, este pedido sigue
     mostrando lo que el cliente realmente compró.
     Reusa el overlay y closeOrderModal() del modal de pedidos de impresión. */
  function openShopModal(o) {
    closeOrderModal();
    var items = o.items || [];
    var money = shopCanSeeMoney;
    var c = o.client || {};
    var envio = (o.ship_mode === "envio");

    var filas = items.map(function (it) {
      var qty = +it.qty || 1;
      /* Miniatura: la foto principal del catálogo (get.php la anexa por renglón).
         Si el producto ya no tiene foto, cajita gris — el modal nunca se rompe. */
      /* Colores por TOKEN, no fijos: antes iban #eef0f4/#f8fafc en línea y por eso el
         detalle se quedaba blanco en modo oscuro (un style inline le gana a cualquier
         regla CSS). */
      var thumb = it.image
        ? '<img src="' + esc(it.image) + '" alt="" loading="lazy" class="shopit__img">'
        : '<span class="shopit__img shopit__img--none"></span>';
      /* El nombre lleva a la FICHA del producto (pestaña nueva, para no perder el
         detalle del pedido). Así quien surte puede ver EXACTAMENTE cuál es cuando el
         nombre del proveedor no se lo dice. */
      var pid = +it.product_id || 0;
      var nombre = esc(it.product_name || "Producto");
      var titulo = pid
        ? '<a class="shopit__link" href="/producto/' + pid + '" target="_blank" rel="noopener" title="Ver la ficha de este producto">' + nombre + ' <span aria-hidden="true">↗</span></a>'
        : '<b>' + nombre + '</b>';
      return '<tr class="shopit">' +
          '<td>' +
            '<div class="shopit__cell">' + thumb +
            '<div class="shopit__txt">' + titulo +
            (it.product_sku ? '<div class="shopit__sku">' + esc(it.product_sku) + '</div>' : '') +
            '</div></div>' +
          '</td>' +
          '<td class="shopit__qty"><b>' + qty + '</b></td>' +
          (money ? '<td class="mono shopit__num">' + mxn(+it.unit_price || 0) + '</td>' +
                   '<td class="mono shopit__num"><b>' + mxn(+it.line_total || 0) + '</b></td>' : '') +
        '</tr>';
    }).join("") || '<tr><td colspan="' + (money ? 4 : 2) + '" style="padding:18px;text-align:center;color:var(--text-muted,#6b7280)">Este pedido no tiene renglones.</td></tr>';

    /* El IVA se guarda por pedido (8% frontera / 16% nacional según destino), así que
       la etiqueta se arma con la tasa real de ESTE pedido, no con una fija. */
    var ivaPct = o.iva_rate ? Math.round(+o.iva_rate * 100) : null;

    var ov = document.createElement("div");
    ov.id = "order-modal";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)";
    ov.innerHTML =
      '<div class="shopmodal">' +
        '<div class="shopmodal__head">' +
          '<div><div style="font-weight:700;font-size:1.05rem">' + esc(o.code || "") + '</div>' +
          '<div style="font-size:.8rem;color:var(--text-muted,#6b7280)">' + esc(String(o.created_at || o.date || "").slice(0, 10)) + '</div></div>' +
          '<button type="button" class="btn btn--light btn--sm" data-shop-close>Cerrar</button>' +
        '</div>' +
        '<div style="padding:18px 20px">' +
          '<h4 style="margin:0 0 6px;font-size:.95rem">Cliente</h4>' +
          '<p style="margin:0 0 16px;font-size:.9rem;line-height:1.5">' + esc(c.name || o.client_name || "—") +
            (c.email ? '<br><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
            (o.contact_phone ? '<br><a href="tel:' + esc(o.contact_phone) + '">' + esc(o.contact_phone) + '</a>' : '') +
          '</p>' +

          '<h4 style="margin:0 0 6px;font-size:.95rem">Productos</h4>' +
          '<div class="shopmodal__box">' +
            '<table style="width:100%;border-collapse:collapse;font-size:.9rem">' +
              '<thead><tr class="shopmodal__thead">' +
                '<th style="padding:9px 10px;text-align:left;font-size:.76rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.04em">Producto</th>' +
                '<th style="padding:9px 10px;text-align:center;font-size:.76rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.04em">Cant.</th>' +
                (money ? '<th style="padding:9px 10px;text-align:right;font-size:.76rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.04em">P. unit.</th>' +
                         '<th style="padding:9px 10px;text-align:right;font-size:.76rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.04em">Importe</th>' : '') +
              '</tr></thead><tbody>' + filas + '</tbody>' +
            '</table>' +
          '</div>' +

          '<h4 style="margin:0 0 6px;font-size:.95rem">Entrega</h4>' +
          '<p style="margin:0 0 16px;font-size:.9rem;line-height:1.5">' +
            (envio ? 'Envío a domicilio' : 'Recoge en tienda (OK.station, Otay)') +
            (envio && o.ship_address ? '<br><span style="color:var(--text-muted,#6b7280)">' + esc(o.ship_address) + '</span>' : '') +
          '</p>' +

          /* Pago: se puede cobrar SIN cerrar el detalle. Misma acción y mismo
             endpoint que el botón de la tabla (permiso shop.update_status), para
             que no haya dos formas distintas de marcar pagado. */
          '<h4 style="margin:0 0 6px;font-size:.95rem">Pago</h4>' +
          '<div id="shop-pay-box" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 16px">' +
            payBadge(o.payment_status) +
            (o.payment_status !== "pagado"
              ? '<button type="button" class="btn btn--primary btn--sm" data-shop-pay="' + esc(String(o.id || o.code)) + '">Marcar pagado</button>'
              : (o.payment_date ? '<span style="color:var(--text-muted,#6b7280);font-size:.82rem">' + esc(String(o.payment_date).slice(0, 10)) + '</span>' : '')) +
          '</div>' +

          (o.comments ? '<h4 style="margin:0 0 6px;font-size:.95rem">Comentarios del cliente</h4><p style="margin:0 0 16px;font-size:.9rem;white-space:pre-wrap;background:#f8fafc;border-radius:8px;padding:10px 12px">' + esc(o.comments) + '</p>' : '') +

          (money ?
          '<h4 style="margin:0 0 6px;font-size:.95rem">Importe</h4>' +
          '<div style="display:flex;flex-direction:column;gap:6px;font-size:.9rem;background:#f8fafc;border-radius:8px;padding:12px 14px">' +
            '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted,#6b7280)">Subtotal</span><b class="mono">' + mxn(+o.subtotal || 0) + '</b></div>' +
            '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted,#6b7280)">IVA' + (ivaPct !== null ? ' (' + ivaPct + '%)' : '') + '</span><b class="mono">' + mxn(+o.tax || 0) + '</b></div>' +
            (envio ? '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted,#6b7280)">Envío</span><b class="mono">' + mxn(+o.ship_cost || 0) + '</b></div>' : '') +
            '<div style="display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;padding-top:6px"><span>Total</span><b class="mono">' + mxn(+o.total || 0) + '</b></div>' +
          '</div>' : '') +
        '</div>' +
      '</div>';

    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.closest("[data-shop-close]")) closeOrderModal();
    });

    /* Marcar pagado desde el detalle. Mismo aviso y mismo DataSource que la tabla.
       Al terminar NO se cierra el modal: se actualiza la insignia en su lugar (quien
       cobra sigue viendo el pedido) y se repinta la tabla de atrás. */
    var payBtn = ov.querySelector("[data-shop-pay]");
    if (payBtn) {
      payBtn.addEventListener("click", function () {
        if (!window.confirm("¿Marcar esta compra como PAGADA? Se enviará el correo de confirmación al cliente.")) return;
        payBtn.disabled = true;
        payBtn.textContent = "Guardando…";
        DataSource.setShopPaid(payBtn.dataset.shopPay, "pagado").then(function (res) {
          if (res && res.payment_status === "pagado") {
            var box = ov.querySelector("#shop-pay-box");
            if (box) box.innerHTML = payBadge("pagado");
            renderShopTable();
          } else {
            payBtn.disabled = false;
            payBtn.textContent = "Marcar pagado";
            window.alert((res && res.error) || "No se pudo marcar como pagado.");
          }
        }).catch(function () {
          payBtn.disabled = false;
          payBtn.textContent = "Marcar pagado";
          window.alert("Sin conexión al marcar el pago.");
        });
      });
    }

    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", escClose);
  }

  /* ── PDF del recibo de una compra (panel) ──────────────────────────────────
     Orden de preferencia a propósito:
       1. El recibo YA GUARDADO en el servidor — es EXACTAMENTE el mismo PDF que
          se le envió por correo al cliente, así que lo que ve el panel y lo que
          tiene el cliente coinciden (importante en una aclaración).
       2. Si todavía no existe (el cliente aún no ha pasado por "Mis compras"),
          se genera aquí con los datos de la compra, igual que hace Citas.
     No sube el PDF generado: subirlo dispararía el correo al cliente, y el panel
     no debería mandarle un recibo solo porque un administrador lo consultó. */
  function shopPdf(id, btn) {
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    var done = function () { btn.disabled = false; btn.textContent = orig; };

    fetch(API_BASE + "/shop/ticket.php?id=" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + token() }
    })
      .then(function (r) { if (!r.ok) throw new Error("sin-recibo"); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "recibo-" + id + ".pdf";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        done();
      })
      .catch(function () {
        /* Aún no hay recibo guardado: se arma con el detalle de la compra. */
        if (!window.OKShopTicketDownload) {
          done();
          window.alert("El recibo aún no está disponible (el cliente no lo ha generado) y no se pudo cargar el generador de PDF.");
          return;
        }
        DataSource.shopOrderDetail(id).then(function (res) {
          done();
          if (!res || !res.ok || !res.order) { window.alert("No se pudo cargar la compra para generar el recibo."); return; }
          var o = res.order;
          if (!o.name) o.name = (o.client && (o.client.full_name || o.client.name)) || "";
          try { window.OKShopTicketDownload(o); }
          catch (e) { window.alert("No se pudo generar el recibo en este navegador."); }
        }).catch(function () { done(); window.alert("Sin conexión al cargar la compra."); });
      });
  }

  function viewShopOrder(id) {
    DataSource.shopOrderDetail(id).then(function (res) {
      if (!res || !res.ok || !res.order) { window.alert((res && res.error) || "No se pudo cargar el detalle de la compra."); return; }
      openShopModal(res.order);
    }).catch(function () { window.alert("Sin conexión al cargar la compra."); });
  }
  function renderShopTable() {
    var q = (shopSearch || "").trim();
    DataSource.shopOrders(shopStatus || "", shopPayment || "", q).then(function (list) {
      var t = $("#shop-table"); if (!t) return;
      var money = shopCanSeeMoney;
      if (!list.length) {
        var msg = q ? 'No se encontraron compras para “' + esc(q) + '”.' : "No hay compras para este filtro.";
        t.innerHTML = '<thead><tr><th>Folio</th><th>Cliente</th><th>Productos</th>' + (money ? '<th>Total</th>' : '') +
          '<th>Estado</th><th>Pago</th><th>Entrega</th><th>Fecha</th></tr></thead>' +
          '<tbody><tr><td colspan="' + (money ? 8 : 7) + '" style="text-align:center;color:var(--text-muted);padding:24px">' + msg + '</td></tr></tbody>';
        return;
      }
      var head = '<thead><tr><th>Folio</th><th>Cliente</th><th>Productos</th>' + (money ? '<th>Total</th>' : '') +
        '<th>Estado</th><th>Pago</th><th>Entrega</th><th>Fecha</th><th>Acciones</th></tr></thead>';
      var body = list.map(function (o) {
        var statusSel = '<select class="shop-status-select" data-id="' + (o.id || o.code) + '">' + Object.keys(SHOP_STATUS).map(function (k) {
          return '<option value="' + k + '"' + (k === o.status ? " selected" : "") + '>' + SHOP_STATUS[k] + '</option>';
        }).join("") + '</select>';
        var payCell = payBadge(o.payment_status) +
          ((o.payment_status !== "pagado")
            ? ' <button class="admin-btn-sm shop-paid" data-id="' + (o.id || o.code) + '">Marcar pagado</button>' : '');
        var entrega = (o.ship_mode === "envio") ? "Envío a domicilio" : "Recoge en tienda";
        /* Folio y nº de productos abren el detalle (QUÉ pidió). Es un <button> y no un
           <a href>: no navega a ningún lado, abre un modal — y así se enfoca con Tab
           y responde a Enter sin trabajo extra. */
        var verId = (o.id || o.code);
        var folioCell = '<button type="button" class="folio-link mono" data-shop-view="' + esc(String(verId)) + '" title="Ver qué pidió">' + esc(o.code) + '</button>';
        var itemsCell = '<button type="button" class="folio-link" data-shop-view="' + esc(String(verId)) + '" title="Ver qué pidió">' + esc(o.items) + '</button>';
        /* Acciones: MISMA pareja que en Citas (Ver + PDF), para que el panel se
           opere igual en los tres apartados. */
        var acciones = '<button type="button" class="admin-btn-sm shop-view" data-id="' + esc(String(verId)) + '">Ver</button>' +
          ' <button type="button" class="admin-btn-sm shop-pdf" data-id="' + esc(String(verId)) + '">PDF</button>';
        return '<tr><td>' + folioCell + '</td><td>' + clientCell(o.user_id, o.client) + '</td>' +
          '<td>' + itemsCell + '</td>' + (money ? '<td class="mono">' + mxn(o.total) + '</td>' : '') +
          '<td>' + statusSel + '</td><td>' + payCell + '</td><td>' + esc(entrega) + '</td><td>' + esc(o.date) + '</td>' +
          '<td class="nowrap">' + acciones + '</td></tr>';
      }).join("");
      t.innerHTML = head + '<tbody>' + body + '</tbody>';
      bindClientLinks(t);
      $$("[data-shop-view]", t).forEach(function (b) {
        b.addEventListener("click", function () { viewShopOrder(b.dataset.shopView); });
      });
      $$(".shop-view", t).forEach(function (b) {
        b.addEventListener("click", function () { viewShopOrder(b.dataset.id); });
      });
      $$(".shop-pdf", t).forEach(function (b) {
        b.addEventListener("click", function () { shopPdf(b.dataset.id, b); });
      });
      $$(".shop-status-select", t).forEach(function (sel) {
        var prev = sel.value;
        sel.addEventListener("change", function () {
          var nv = sel.value;
          DataSource.setShopStatus(sel.dataset.id, nv).then(function (res) {
            if (!res || res.ok === false) { sel.value = prev; window.alert((res && res.error) || "No se pudo cambiar el estado."); return; }
            prev = nv;
          });
        });
      });
      $$(".shop-paid", t).forEach(function (b) {
        b.addEventListener("click", function () {
          if (!window.confirm("¿Marcar esta compra como PAGADA? Se enviará el correo de confirmación al cliente.")) return;
          b.disabled = true;
          DataSource.setShopPaid(b.dataset.id, "pagado").then(function (res) {
            if (res && res.payment_status === "pagado") { renderShopTable(); }
            else { b.disabled = false; window.alert((res && res.error) || "No se pudo marcar como pagado."); }
          });
        });
      });
    });
  }

  var userSearch = "";
  /* Rol "principal" a partir de la lista de roles (string CSV o arreglo). */
  function primaryRole(roles) {
    var arr = Array.isArray(roles) ? roles : String(roles || "").split(",");
    arr = arr.map(function (s) { return String(s).trim(); });
    if (arr.indexOf("directivo") >= 0) return "directivo";
    if (arr.indexOf("administrador") >= 0) return "administrador";
    if (arr.indexOf("empleado") >= 0) return "empleado";
    return "cliente";
  }
  var ROLE_OPTS = [["cliente", "Cliente"], ["empleado", "Empleado"], ["administrador", "Administrador"], ["directivo", "Directivo"]];
  function roleSelectHtml(current, disabled) {
    return '<select class="role-select"' + (disabled ? " disabled title=\"No puedes cambiar tu propio rol\"" : "") + '>' +
      ROLE_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === current ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") +
      '</select>';
  }
  function renderUsers() {
    var head = '<thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Pedidos</th><th>Rol</th><th>Estado</th><th>Alta</th><th></th></tr></thead>';
    var meId = String((cachedUser() || {}).id || "");
    DataSource.users().then(function (list) {
      var q = (userSearch || "").trim().toLowerCase();
      if (q) list = list.filter(function (u) {
        return (String(u.name || "") + " " + String(u.email || "") + " " + String(u.phone || "")).toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) {
        $("#users-table").innerHTML = head + '<tbody><tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">' + (q ? 'No se encontraron usuarios para “' + esc(userSearch.trim()) + '”.' : "No hay usuarios.") + '</td></tr></tbody>';
        return;
      }
      /* El empleado puro solo VE (lista + historial): sin cambiar roles ni desactivar
         cuentas. Admin/directivo mantienen el select de rol y el botón Desactivar. */
      var canManageUsers = !isEmpleadoOnly();
      var ROLE_LABEL = { cliente: "Cliente", empleado: "Empleado", administrador: "Administrador", directivo: "Directivo" };
      var body = list.map(function (u) {
        var active = +u.active ? 1 : 0;
        var isSelf = String(u.id) === meId;
        var role = primaryRole(u.roles);
        var roleCell = canManageUsers
          ? '<td data-urole="' + esc(u.id) + '">' + roleSelectHtml(role, isSelf) + '</td>'
          : '<td>' + esc(ROLE_LABEL[role] || role) + '</td>';
        var actions = '<button class="admin-btn-sm" data-uview="' + esc(u.id) + '">Historial</button>' +
          (canManageUsers ? ' <button class="admin-btn-sm" data-utoggle="' + esc(u.id) + '" data-active="' + (active ? 0 : 1) + '">' + (active ? "Desactivar" : "Reactivar") + '</button>' : '');
        return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.email) + '</td><td>' + esc(u.phone) + '</td><td>' + (u.orders || 0) + '</td>' +
          roleCell +
          '<td><span class="badge badge--' + (active ? "listo" : "cancelado") + '">' + (active ? "Activo" : "Inactivo") + '</span></td>' +
          '<td>' + esc(u.joined) + '</td><td>' + actions + '</td></tr>';
      }).join("");
      var t = $("#users-table"); t.innerHTML = head + '<tbody>' + body + '</tbody>';
      $$("[data-utoggle]", t).forEach(function (b) {
        b.addEventListener("click", function () { DataSource.toggleUser(b.dataset.utoggle, +b.dataset.active).then(renderUsers); });
      });
      $$("[data-uview]", t).forEach(function (b) {
        b.addEventListener("click", function () { viewUser(b.dataset.uview); });
      });
      /* Cambiar rol: el backend mantiene 'cliente' y aplica salvaguardas. */
      $$("[data-urole] .role-select", t).forEach(function (sel) {
        sel.addEventListener("change", function () {
          var id = sel.parentNode.getAttribute("data-urole");
          sel.disabled = true;
          DataSource.setUserRole(id, sel.value).then(function (j) {
            if (!j || !j.ok) window.alert((j && (j.error || j.message)) || "No se pudo cambiar el rol.");
            renderUsers();
          }).catch(function () { window.alert("Sin conexión al cambiar el rol."); renderUsers(); });
        });
      });
    });
  }

  /* ── Historial del usuario (botón "Historial") ── */
  function escUserClose(e) { if (e.key === "Escape") closeUserModal(); }
  function closeUserModal() {
    var m = document.getElementById("user-modal");
    if (m) m.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", escUserClose);
  }
  function userHistoryHtml(d) {
    var u = d.user || {}, s = d.summary || {};
    var sum = '<div class="stat-grid" style="margin:0 0 18px">' +
      reportStat("Pedidos", s.orders || 0) + reportStat("Gastado", mxn(s.sales || 0)) + reportStat("Citas", s.appointments || 0) + '</div>';
    var orders = (d.orders || []);
    var oTable = orders.length
      ? '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Folio</th><th>Estado</th><th>Total</th><th>Archivos</th><th>Fecha</th></tr></thead><tbody>' +
        orders.map(function (o) { return '<tr><td class="mono"><button type="button" class="folio-link" data-goorder="' + esc(o.code) + '">' + esc(o.code) + '</button></td><td>' + badge(o.status) + '</td><td class="mono">' + mxn(o.total || 0) + '</td><td>' + (o.items || 0) + '</td><td>' + esc(o.date) + '</td></tr>'; }).join("") + '</tbody></table></div>'
      : '<p style="color:var(--text-muted);font-size:.88rem;margin:0">Sin pedidos.</p>';
    var appts = (d.appointments || []);
    var aTable = appts.length
      ? '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Folio</th><th>Servicio</th><th>Fecha</th><th>Hora</th><th>Estado</th></tr></thead><tbody>' +
        appts.map(function (a) { return '<tr><td class="mono"><button type="button" class="folio-link" data-gocita="' + esc(a.code) + '">' + esc(a.code) + '</button></td><td>' + apptServiceCell(a) + '</td><td>' + esc(a.date) + '</td><td class="mono">' + esc(a.time) + '</td><td>' + badge(a.status, APPT_STATUS) + '</td></tr>'; }).join("") + '</tbody></table></div>'
      : '<p style="color:var(--text-muted);font-size:.88rem;margin:0">Sin citas.</p>';
    var svcs = (d.services || []);
    var svcList = svcs.length
      ? '<div class="service-chips">' + svcs.map(function (x) { return '<span class="badge badge--listo">' + esc(SIZE_LABEL[x.name] || x.name) + ' · ' + x.count + '</span>'; }).join(" ") + '</div>'
      : '<p style="color:var(--text-muted);font-size:.88rem;margin:0">Sin servicios de impresión registrados.</p>';
    return sum +
      '<h4 style="margin:0 0 8px;font-size:.95rem">Pedidos</h4>' + oTable +
      '<h4 style="margin:18px 0 8px;font-size:.95rem">Citas</h4>' + aTable +
      '<h4 style="margin:18px 0 8px;font-size:.95rem">Servicios de impresión tomados</h4>' + svcList;
  }
  function openUserModal(d) {
    closeUserModal();
    var u = d.user || {};
    var ov = document.createElement("div");
    ov.id = "user-modal";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)";
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:820px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #eef0f4">' +
          '<div><div style="font-weight:700;font-size:1.05rem">' + esc(u.name || "Usuario") + '</div>' +
          '<div style="font-size:.82rem;color:var(--text-muted,#6b7280)">' + esc(u.email || "") + (u.phone ? " · " + esc(u.phone) : "") + (u.joined ? " · alta " + esc(u.joined) : "") + '</div></div>' +
          '<button type="button" class="btn btn--light btn--sm" id="user-modal-close">Cerrar</button>' +
        '</div>' +
        '<div style="padding:18px 20px">' + userHistoryHtml(d) + '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    ov.addEventListener("click", function (e) { if (e.target === ov) closeUserModal(); });
    $("#user-modal-close", ov).addEventListener("click", closeUserModal);
    $$("[data-goorder]", ov).forEach(function (b) { b.addEventListener("click", function () { goToOrder(b.dataset.goorder); }); });
    $$("[data-gocita]", ov).forEach(function (b) { b.addEventListener("click", function () { goToAppt(b.dataset.gocita); }); });
    document.addEventListener("keydown", escUserClose);
  }
  function viewUser(id) {
    DataSource.userDetail(id).then(function (res) {
      if (!res || !res.ok) { window.alert("No se pudo cargar el historial del usuario."); return; }
      openUserModal(res);
    }).catch(function () { window.alert("Sin conexión al cargar el historial."); });
  }
  /* Desde el historial: ir directo al pedido/cita en su tabla (con su selector de
     estado y botón de detalle), buscándolo por folio. */
  function goToOrder(code) {
    closeUserModal();
    showView("pedidos");
    orderSearch = code;
    var el = $("#order-search"); if (el) el.value = code;
    renderOrdersTable();
  }
  function goToAppt(code) {
    closeUserModal();
    showView("citas");
    apptSearch = code;
    var el = $("#appt-search"); if (el) el.value = code;
    renderAppointments("", "");
  }
  /* La vista "Servicios" se retiró (jul 2026): la tabla `services` nunca tuvo
     datos ni consumidores; los precios se administran en la vista "Precios". */
  var reviewSearch = "";
  function renderReviews() {
    var STR = { pendiente: "Pendiente", aprobada: "Aprobada", oculta: "Oculta" };
    var head = '<thead><tr><th>Cliente</th><th>Calificación</th><th>Comentario</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>';
    DataSource.reviews().then(function (list) {
      var q = (reviewSearch || "").trim().toLowerCase();
      if (q) list = list.filter(function (r) {
        return (String(r.name || "") + " " + String(r.comment || "")).toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) {
        $("#reviews-table").innerHTML = head + '<tbody><tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">' + (q ? 'No se encontraron reseñas para “' + esc(reviewSearch.trim()) + '”.' : "No hay reseñas.") + '</td></tr></tbody>';
        return;
      }
      var body = list.map(function (r) {
        var stars = "★★★★★".slice(0, r.rating) + "☆☆☆☆☆".slice(0, 5 - r.rating);
        var act = r.status === "aprobada" ? "hide" : "approve";
        var actLabel = r.status === "aprobada" ? "Ocultar" : "Aprobar";
        return '<tr><td><b>' + esc(r.name) + '</b></td><td><span class="admin-stars">' + stars + '</span></td>' +
          '<td>' + esc(r.comment) + '</td><td>' + badge(r.status, STR) + '</td><td>' + esc(r.date) + '</td>' +
          '<td><button class="admin-btn-sm" data-rmod="' + esc(r.id) + '" data-act="' + act + '">' + actLabel + '</button> ' +
          '<button class="admin-btn-sm" data-rmod="' + esc(r.id) + '" data-act="delete">Eliminar</button></td></tr>';
      }).join("");
      var t = $("#reviews-table"); t.innerHTML = head + '<tbody>' + body + '</tbody>';
      $$("[data-rmod]", t).forEach(function (b) {
        b.addEventListener("click", function () {
          if (b.dataset.act === "delete" && !window.confirm("¿Eliminar esta reseña?")) return;
          DataSource.moderateReview(b.dataset.rmod, b.dataset.act).then(function () { renderReviews(); loadDashboardCounts(); });
        });
      });
    });
  }

  function apptStatusSelect(a) {
    return '<select class="appt-status-select" data-id="' + esc(a.id || a.code) + '">' +
      Object.keys(APPT_STATUS).map(function (k) {
        return '<option value="' + k + '"' + (k === a.status ? " selected" : "") + '>' + APPT_STATUS[k] + '</option>';
      }).join("") + '</select>';
  }
  var apptSearch = "";
  function renderAppointments(status, date) {
    var head = '<thead><tr><th>Folio</th><th>Servicio</th><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Estado</th></tr></thead>';
    DataSource.appointments(status || "", date || "").then(function (list) {
      var t = $("#appts-table");
      if (!t) return;
      var q = (apptSearch || "").trim().toLowerCase();
      if (q) list = list.filter(function (a) {
        return (String(a.contact_name || "") + " " + String(a.account_name || "") + " " + String(a.code || "")).toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) {
        var msg = q ? 'No se encontraron citas para “' + esc(apptSearch.trim()) + '”.' : "No hay citas para este filtro.";
        t.innerHTML = head + '<tbody><tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">' + msg + '</td></tr></tbody>'; return;
      }
      var canPdf = !!window.OKCitaTicketDownload;
      var body = list.map(function (a, i) {
        var waD = waDigits(a.contact_phone);
        var phoneHtml = a.contact_phone
          ? (waD ? '<a href="https://wa.me/' + waD + '" target="_blank" rel="noopener" title="Escribir por WhatsApp" style="color:#1d9e75;font-weight:600">' + esc(a.contact_phone) + '</a>' : esc(a.contact_phone))
          : "";
        /* Ya no se exige confirmar por correo: solo mostramos el ✓ de las citas
           viejas que lo hicieron; nada cuando no (antes decía "Sin confirmar"). */
        var confirmInline = a.client_confirmed_at
          ? '<br><span style="color:#047857;font-size:.78rem;font-weight:600" title="Confirmó por correo el ' + esc(String(a.client_confirmed_at)) + '">✓ Confirmó</span>'
          : '';
        var contacto = phoneHtml + (a.contact_email ? '<br><span style="color:var(--text-muted);font-size:.82rem">' + esc(a.contact_email) + '</span>' : "") + confirmInline;
        return '<tr>' +
          '<td class="mono">' + esc(a.code) + '</td>' +
          '<td>' + apptServiceCell(a) + '</td>' +
          '<td>' + esc(a.date) + '</td>' +
          '<td class="mono">' + esc(a.time) + '</td>' +
          '<td>' + clientCell(a.user_id, a.contact_name) + (a.account_name ? '' : ' <span style="color:var(--text-muted);font-size:.78rem">(invitado)</span>') + '</td>' +
          '<td>' + contacto + '</td>' +
          '<td>' + apptStatusSelect(a) + ' <button type="button" class="appt-view" data-i="' + i + '">Ver</button>' + (canPdf ? ' <button type="button" class="appt-pdf" data-i="' + i + '">PDF</button>' : '') + '</td>' +
        '</tr>';
      }).join("");
      t.innerHTML = head + '<tbody>' + body + '</tbody>';
      $$(".appt-status-select", t).forEach(function (sel) {
        var prev = sel.value;   // valor previo, para revertir si el backend rechaza
        sel.addEventListener("change", function () {
          var nv = sel.value;
          DataSource.updateApptStatus(sel.dataset.id, nv).then(function (res) {
            if (!res || res.ok === false) {
              sel.value = prev;   // no se cambió (p. ej. requiere el pago del anticipo): revertir y avisar
              window.alert((res && res.error) || "No se pudo cambiar el estado de la cita.");
              return;
            }
            prev = nv;
            loadDashboardCounts();
          }).catch(function () { sel.value = prev; window.alert("Sin conexión. No se cambió el estado."); });
        });
      });
      $$(".appt-pdf", t).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var a = list[+btn.dataset.i];
          if (a) window.OKCitaTicketDownload({ code: a.code, tramite: a.tramite, passport_subtype: a.passport_subtype, party_size: a.party_size, date: a.date, time: a.time, status: a.status, name: a.contact_name, phone: a.contact_phone, guests: parseGuests(a.guests_json), services: parseGuests(a.services_json) });
        });
      });
      $$(".appt-view", t).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var a = list[+btn.dataset.i];
          if (a) openApptModal(a);
        });
      });
      bindClientLinks(t);
    });
  }

  /* ============================================================
     REPORTES (corte de caja: ventas + pedidos + citas)
     ============================================================ */
  var reportPeriod = "day", reportDate = "", lastReport = null;
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1); if (m.length < 2) m = "0" + m;
    var dd = String(d.getDate()); if (dd.length < 2) dd = "0" + dd;
    return d.getFullYear() + "-" + m + "-" + dd;
  }
  function reportStat(label, value) {
    return '<div class="stat-card"><div class="stat-card__top"><span class="stat-card__label">' + label + '</span></div><div class="stat-card__value">' + value + '</div></div>';
  }
  function reportPreviewHtml(rep) {
    var o = rep.orders || { count: 0, sales: 0, byStatus: {} };
    var a = rep.appointments || { count: 0, byStatus: {}, byTramite: {} };
    var sum = '<div class="stat-grid" style="margin:0 0 18px">' +
      reportStat("Ventas entregadas", mxn(o.sales || 0)) +
      reportStat("Pedidos", o.count || 0) +
      reportStat("Citas", a.count || 0) + '</div>';
    var orows = Object.keys(STATUS).map(function (k) {
      var v = (o.byStatus && o.byStatus[k]) || { count: 0, sales: 0 };
      return '<tr><td>' + STATUS[k] + '</td><td>' + (v.count || 0) + '</td><td class="mono">' + mxn(v.sales || 0) + '</td></tr>';
    }).join("");
    var otable = '<h4 style="margin:0 0 8px;font-size:.95rem">Pedidos por estado</h4><div class="table-wrap"><table class="admin-table"><thead><tr><th>Estado</th><th>Pedidos</th><th>Monto</th></tr></thead><tbody>' + orows + '</tbody></table></div>';
    var asKeys = Object.keys(a.byStatus || {});
    var aStatus = asKeys.length ? '<h4 style="margin:18px 0 8px;font-size:.95rem">Citas por estado</h4><div class="table-wrap"><table class="admin-table"><thead><tr><th>Estado</th><th>Citas</th></tr></thead><tbody>' + asKeys.map(function (k) { return '<tr><td>' + (APPT_STATUS[k] || k) + '</td><td>' + a.byStatus[k] + '</td></tr>'; }).join("") + '</tbody></table></div>' : '';
    var atKeys = Object.keys(a.byTramite || {});
    var aTramite = atKeys.length ? '<h4 style="margin:18px 0 8px;font-size:.95rem">Citas por servicio</h4><div class="table-wrap"><table class="admin-table"><thead><tr><th>Servicio</th><th>Citas</th></tr></thead><tbody>' + atKeys.map(function (k) { return '<tr><td>' + (TRAMITE_LABEL[k] || k) + '</td><td>' + a.byTramite[k] + '</td></tr>'; }).join("") + '</tbody></table></div>' : '';
    return '<div style="padding:4px 20px 20px">' + sum + otable + aStatus + aTramite + '</div>';
  }
  function renderReport() {
    var host = $("#report-preview");
    if (host) host.innerHTML = '<p style="color:var(--text-muted);padding:18px 20px;margin:0">Cargando corte…</p>';
    DataSource.report(reportPeriod, reportDate).then(function (rep) {
      if (!rep || !rep.ok) { if (host) host.innerHTML = '<p style="color:var(--text-muted);padding:18px 20px;margin:0">No se pudo cargar el reporte.</p>'; lastReport = null; return; }
      lastReport = rep;
      var rangeEl = $("#report-range");
      if (rangeEl) rangeEl.textContent = (PERIOD_LABEL[rep.period] || "") + " · " + ((rep.range && rep.range.label) || rep.date || "");
      if (host) host.innerHTML = reportPreviewHtml(rep);
    }).catch(function () { if (host) host.innerHTML = '<p style="color:var(--text-muted);padding:18px 20px;margin:0">Sin conexión al cargar el reporte.</p>'; lastReport = null; });
  }
  function downloadReportPdf() {
    var rep = lastReport;
    if (!rep) { window.alert("Genera primero el corte seleccionando un periodo."); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) { window.alert("No se pudo generar el PDF (falta la librería)."); return; }
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var M = 16, y = 18;
    function line(txt, x) { doc.text(String(txt), x == null ? M : x, y); }
    function nl(h) { y += (h || 6); if (y > 275) { doc.addPage(); y = 18; } }
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    line("Ok.station — Corte de " + (PERIOD_LABEL[rep.period] || rep.period)); nl(7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    line("Periodo: " + ((rep.range && rep.range.label) || rep.date || "")); nl(5);
    line("Generado: " + (rep.generated || todayStr())); nl(10);
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); line("Resumen"); nl(7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    line("Ventas entregadas: " + mxn(rep.orders.sales || 0)); nl();
    line("Pedidos: " + (rep.orders.count || 0)); nl();
    line("Citas: " + (rep.appointments.count || 0)); nl(11);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); line("Pedidos por estado"); nl(7);
    doc.setFontSize(10);
    line("Estado", M); line("Pedidos", 110); line("Monto", 150); nl(2); doc.line(M, y, 194, y); nl(5);
    doc.setFont("helvetica", "normal");
    Object.keys(STATUS).forEach(function (k) {
      var v = (rep.orders.byStatus && rep.orders.byStatus[k]) || { count: 0, sales: 0 };
      line(STATUS[k], M); line(String(v.count || 0), 110); line(mxn(v.sales || 0), 150); nl();
    });
    var aByStatus = rep.appointments.byStatus || {};
    if (Object.keys(aByStatus).length) {
      nl(6); doc.setFont("helvetica", "bold"); doc.setFontSize(12); line("Citas por estado"); nl(7);
      doc.setFontSize(10); line("Estado", M); line("Citas", 110); nl(2); doc.line(M, y, 194, y); nl(5);
      doc.setFont("helvetica", "normal");
      Object.keys(aByStatus).forEach(function (k) { line(APPT_STATUS[k] || k, M); line(String(aByStatus[k]), 110); nl(); });
    }
    var aByTramite = rep.appointments.byTramite || {};
    if (Object.keys(aByTramite).length) {
      nl(6); doc.setFont("helvetica", "bold"); doc.setFontSize(12); line("Citas por servicio"); nl(7);
      doc.setFontSize(10); line("Servicio", M); line("Citas", 110); nl(2); doc.line(M, y, 194, y); nl(5);
      doc.setFont("helvetica", "normal");
      Object.keys(aByTramite).forEach(function (k) { line(TRAMITE_LABEL[k] || k, M); line(String(aByTramite[k]), 110); nl(); });
    }
    var tag = (rep.range && rep.range.start) || rep.date || todayStr();
    doc.save("corte-" + rep.period + "-" + tag + ".pdf");
  }

  function loadDashboardCounts() {
    DataSource.dashboard().then(function (d) {
      var citasEl = $("#nav-citas-count");
      if (d && d.nav) {
        $("#nav-pedidos-count").textContent = d.nav.pedidos;
        $("#nav-resenas-count").textContent = d.nav.resenas;
        if (citasEl) citasEl.textContent = d.nav.citas != null ? d.nav.citas : 0;
      } else {
        $("#nav-pedidos-count").textContent = (MOCK.orders || []).length;
        $("#nav-resenas-count").textContent = (MOCK.reviews || []).filter(function (r) { return r.status === "pendiente"; }).length;
        if (citasEl) citasEl.textContent = (MOCK.appointments || []).filter(function (a) { return a.status === "pendiente"; }).length;
      }
    });
  }

  /* ============================================================
     CATÁLOGO — productos de la tienda y estado de sus imágenes
     ============================================================ */
  var catalogSearch = "", catalogImages = "";

  /* Semáforo de fotos. Se muestran DOS datos porque NO son lo mismo:
       images        → fotos registradas
       images_stored → fotos ya descargadas a nuestro servidor
     La tienda resuelve la foto con COALESCE(stored_path, url) (ver ShopProduct.php),
     así que un producto con 0 descargadas se ve bien HOY pero se sirve desde Icecat:
     si Icecat bloquea el enlace directo o se cae, ese producto queda sin foto. */
  function catalogImagesCell(p) {
    var n = p.images, local = p.images_stored;
    var tone = n === 0 ? "cancelado" : (n < 3 ? "pendiente" : "listo");
    var note = n === 0 ? "sin fotos"
             : (local === 0 ? "ninguna local" : (local < n ? local + " locales" : "todas locales"));
    /* El botón abre el selector de fotos (assets/admin-fotos.js, archivo aparte).
       Solo se engancha por atributos: si ese archivo no cargara, esta celda sigue
       mostrando el conteo igual que antes. */
    return '<td><span class="badge badge--' + tone + '">' + n + '/5</span>' +
      '<div class="catalog-note' + (n > 0 && local === 0 ? " is-warn" : "") + '">' + note + '</div>' +
      '<button type="button" class="catalog-foto" data-foto="' + p.id +
        '" data-foto-nombre="' + esc(p.name) + '" data-foto-marca="' + esc(p.brand || "") + '">' +
        (n === 0 ? "Poner foto" : "Cambiar") + '</button></td>';
  }

  /* Se expone para que admin-fotos.js pueda refrescar la tabla tras guardar una
     foto, sin recargar la página entera (van a ser ~264 productos de corrido). */
  window.okAdminRecargarCatalogo = function () {
    renderCatalog();
    var panel = $("#catalog-rescue-report-panel");
    if (panel && !panel.hidden) loadCatalogRescueReport(false);
  };

  /* La cola de los que se ven SIN foto, para encadenarlos en el selector. */
  var catalogSinFoto = [];
  window.okAdminSinFoto = function () { return catalogSinFoto.slice(); };

  var catalogRescueBusy = false;
  var catalogRescueStatus = "";
  var catalogRescueSearch = "";
  var catalogRescueRows = [];

  /* Para buscar da igual "fólder" que "folder": el catálogo de Exel escribe los
     acentos como quiere, y quien teclea también. */
  function rescueNorm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function rescueEstado(estado) {
    return {
      ok: ["Encontrada", "catalog-rescue-badge is-ok"],
      sin_datos: ["Sin coincidencia", "catalog-rescue-badge is-empty"],
      revision: ["Por revisar", "catalog-rescue-badge is-review"],
      error: ["Error temporal", "catalog-rescue-badge is-error"]
    }[estado] || ["Sin estado", "catalog-rescue-badge"];
  }

  function renderCatalogRescueReport() {
    var t = $("#catalog-rescue-report-table");
    if (!t) return;
    var head = '<thead><tr><th>Producto</th><th>Resultado</th><th>Coincidencia</th><th>Fecha</th></tr></thead>';
    var q = rescueNorm(catalogRescueSearch.trim());
    var rows = catalogRescueRows.filter(function (r) {
      if (catalogRescueStatus && r.status !== catalogRescueStatus) return false;
      if (!q) return true;
      /* Mismos campos que el buscador del catálogo: nombre, marca, SKU, referencia
         y la clave de coincidencia que se muestra en la columna del reporte. */
      return rescueNorm([r.name, r.brand, r.sku, r.supplier_ref, r.match_key].join(" ")).indexOf(q) !== -1;
    });
    if (!rows.length) {
      t.innerHTML = head + '<tbody><tr><td colspan="4" class="catalog-empty">' +
        (q ? 'Ningún producto coincide con «' + esc(catalogRescueSearch.trim()) + '» en este resultado.'
           : 'No hay productos en este resultado.') + '</td></tr></tbody>';
      return;
    }
    t.innerHTML = head + "<tbody>" + rows.map(function (r) {
      var estado = rescueEstado(r.status);
      var thumb = r.thumb
        ? '<img class="catalog-thumb" src="' + esc(r.thumb) + '" alt="" loading="lazy">'
        : '<span class="catalog-thumb catalog-thumb--empty" aria-hidden="true"></span>';
      var clave = r.match_key || r.sku || r.supplier_ref || "—";
      var fotoAttrs = ' data-foto="' + r.id + '" data-foto-nombre="' + esc(r.name) +
        '" data-foto-marca="' + esc(r.brand || "") + '"';
      return '<tr class="catalog-rescue-row"' + fotoAttrs + ' title="Elegir fotografía para este producto">' +
        '<td><div class="catalog-prod">' + thumb + '<div><b>' + esc(r.name) + '</b>' +
        '<div class="catalog-note">' + esc(r.brand || "Sin marca") + '</div></div></div></td>' +
        '<td><span class="' + estado[1] + '">' + estado[0] + '</span>' +
        '<div class="catalog-note">' + esc(r.detail || "") + '</div>' +
        '<button type="button" class="catalog-foto catalog-rescue-choose"' + fotoAttrs + '>Elegir fotografía</button></td>' +
        '<td><b>' + esc(clave) + '</b>' +
        (r.confidence !== null && r.confidence !== "" ? '<div class="catalog-note">Confianza: ' + Number(r.confidence) + '%</div>' : '') +
        '</td><td>' + esc(r.tried_at || "—") + '</td></tr>';
    }).join("") + "</tbody>";
  }

  function loadCatalogRescueReport(openPanel) {
    var panel = $("#catalog-rescue-report-panel");
    var t = $("#catalog-rescue-report-table");
    if (openPanel && panel) panel.hidden = false;
    if (t) t.innerHTML = '<tbody><tr><td class="catalog-empty">Cargando resultados…</td></tr></tbody>';
    return DataSource.imageRescueReport("").then(function (j) {
      catalogRescueRows = (j && j.results) || [];
      var c = (j && j.counts) || {};
      var stats = $("#catalog-rescue-report-stats");
      if (stats) stats.innerHTML =
        reportStat("Encontradas", c.ok || 0) +
        reportStat("Sin coincidencia", c.sin_datos || 0) +
        reportStat("Por revisar", c.revision || 0) +
        reportStat("Con error", c.error || 0);
      renderCatalogRescueReport();
      if (j && j.notice && !catalogRescueRows.length && t) {
        t.innerHTML = '<tbody><tr><td class="catalog-empty">' + esc(j.notice) + '</td></tr></tbody>';
      }
    }).catch(function () {
      if (t) t.innerHTML = '<tbody><tr><td class="catalog-empty">No se pudo cargar el historial.</td></tr></tbody>';
    });
  }

  function runCatalogRescue() {
    if (catalogRescueBusy) return;
    var btn = $("#catalog-rescue"), msg = $("#catalog-rescue-status");
    var total = { procesados: 0, rescatados: 0, revision: 0, errores: 0 };
    catalogRescueBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = "Completando…"; }

    function terminar(texto, error) {
      catalogRescueBusy = false;
      if (btn) { btn.disabled = false; btn.textContent = "Buscar coincidencias exactas"; }
      if (msg) { msg.textContent = texto; msg.style.color = error ? "#B91C1C" : ""; }
      renderCatalog();
      loadCatalogRescueReport(false);
    }

    function siguiente() {
      if (msg) msg.textContent = "Analizando lote… " + total.procesados + " productos revisados.";
      DataSource.imageRescue(10).then(function (j) {
        if (!j || !j.ok || !j.resultado) {
          terminar((j && (j.error || j.message)) || "No se pudo ejecutar el rescate.", true);
          return;
        }
        var r = j.resultado;
        ["procesados", "rescatados", "revision", "errores"].forEach(function (k) {
          total[k] += Number(r[k]) || 0;
        });
        if ((Number(r.procesados) || 0) > 0 && (Number(r.pendientes) || 0) > 0) {
          siguiente();
          return;
        }
        terminar(
          total.rescatados + " coincidencias oficiales guardadas automáticamente; " +
          total.revision + " variantes NEXTEP requieren confirmación. " +
          (Number(r.sin_imagen_total) || 0) + " productos siguen sin foto en todo el catálogo.",
          false
        );
      }).catch(function () {
        terminar("Se perdió la conexión durante el rescate. Puedes continuarlo sin perder avances.", true);
      });
    }
    siguiente();
  }

  function renderCatalog() {
    var head = '<thead><tr><th>Producto</th><th>Marca</th><th>Categoría</th><th>Imágenes</th>' +
      '<th>Stock</th><th>Precio</th><th>Estado</th></tr></thead>';
    var t = $("#catalog-table");
    if (!t) return;
    t.innerHTML = head + '<tbody><tr><td colspan="7" class="catalog-empty">Cargando catálogo…</td></tr></tbody>';

    DataSource.catalog({ q: catalogSearch.trim(), images: catalogImages })
      .then(function (j) {
        var list = (j && j.products) || [];

        /* Cola de trabajo para el selector de fotos (admin-fotos.js): los que se
           ven ahora mismo SIN ninguna foto, en el mismo orden de la tabla. Sirve
           para encadenar uno tras otro sin volver a la lista — son ~264 productos
           y hacerlos de a uno, cerrando y buscando el siguiente cada vez, es lo
           que convierte un rato de trabajo en una tarde entera. */
        catalogSinFoto = list.filter(function (p) { return p.images === 0; })
          .map(function (p) { return { id: p.id, nombre: p.name, marca: p.brand || "" }; });
        var s = (j && j.stats) || {};

        /* El resumen es del catálogo COMPLETO, no del filtro: si cambiara al buscar,
           dejaría de servir como termómetro general. */
        var stats = $("#catalog-stats");
        if (stats) stats.innerHTML =
          reportStat("Productos", s.total || 0) +
          reportStat("Sin fotos", s.sin_imagenes || 0) +
          reportStat("Pocas (1-2)", s.pocas || 0) +
          reportStat("Completas (3+)", s.ok || 0) +
          reportStat("Sin descargar", s.sin_descargar || 0);

        /* Aviso en el menú lateral: productos que todavía necesitan fotos. */
        var navBadge = $("#nav-catalogo-count");
        if (navBadge) {
          var pend = (s.sin_imagenes || 0) + (s.pocas || 0);
          navBadge.textContent = pend;
          navBadge.hidden = !pend;
        }

        if (!list.length) {
          t.innerHTML = head + '<tbody><tr><td colspan="7" class="catalog-empty">No hay productos que coincidan con el filtro.</td></tr></tbody>';
          return;
        }

        var body = list.map(function (p) {
          var thumb = p.thumb
            ? '<img class="catalog-thumb" src="' + esc(p.thumb) + '" alt="" loading="lazy">'
            : '<span class="catalog-thumb catalog-thumb--empty" aria-hidden="true"></span>';
          var ref = p.sku || p.supplier_ref || "";
          /* El renglón entero abre la ficha. Con tabindex/role para que también se
             pueda llegar con el teclado, no solo con el ratón. */
          return '<tr class="is-clickable" data-pid="' + p.id + '" tabindex="0" role="button" ' +
            'aria-label="Ver ficha de ' + esc(p.name) + '">' +
            '<td><div class="catalog-prod">' + thumb + '<div><b>' + esc(p.name) + '</b>' +
              (ref ? '<div class="catalog-note">' + esc(ref) + '</div>' : '') + '</div></div></td>' +
            '<td>' + esc(p.brand || "—") + '</td>' +
            '<td>' + esc(p.category || "—") +
              (p.subcategory ? '<div class="catalog-note">' + esc(p.subcategory) + '</div>' : '') + '</td>' +
            catalogImagesCell(p) +
            '<td>' + p.stock + '</td>' +
            '<td>' + mxn(Number(p.price) || 0) + '</td>' +
            '<td><span class="badge badge--' + (p.is_active ? "listo" : "oculta") + '">' +
              (p.is_active ? "Publicado" : "Oculto") + '</span></td>' +
            '</tr>';
        }).join("");

        /* Se avisa cuando la lista viene topada: sin esto, el panel se vería
           "completo" mostrando solo una parte del catálogo. */
        var capped = (j.count && j.limit && j.count >= j.limit)
          ? '<tr><td colspan="7" class="catalog-empty">Mostrando los primeros ' + j.limit +
            ' productos. Acota con la búsqueda o los filtros para ver el resto.</td></tr>'
          : '';

        t.innerHTML = head + '<tbody>' + body + capped + '</tbody>';

        $$("tr[data-pid]", t).forEach(function (tr) {
          tr.addEventListener("click", function (e) {
            /* El renglón entero abre la ficha, PERO trae dentro el botón de foto
               (admin-fotos.js). Sin esta guarda, pedir la foto abriría además la
               ficha encima y se elegiría a ciegas. Cualquier control propio dentro
               del renglón queda cubierto por el mismo cierre. */
            if (e.target.closest("button, a, input, select")) return;
            openProductModal(+tr.dataset.pid);
          });
          tr.addEventListener("keydown", function (e) {
            if (e.target !== tr) return;
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProductModal(+tr.dataset.pid); }
          });
        });
      })
      .catch(function () {
        t.innerHTML = head + '<tbody><tr><td colspan="7" class="catalog-empty">No se pudo cargar el catálogo.</td></tr></tbody>';
      });
  }

  /* ── Ficha del producto (clic en un renglón del catálogo) ──
     Muestra TODO lo que se sabe del producto y deja gestionar sus imágenes.
     Regla que atraviesa toda esta pantalla: ninguna fuente publica sola; el
     administrador elige cada foto. Ver image-candidates.php. */
  var prodModalId = null;

  function escProdClose(e) { if (e.key === "Escape") closeProductModal(); }
  function closeProductModal() {
    var m = document.getElementById("prod-modal");
    if (m) m.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", escProdClose);
    prodModalId = null;
  }

  function prodField(label, value) {
    return '<div class="prod-field"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  /* Galería: cada imagen con su procedencia y si ya está copiada en nuestro servidor. */
  function prodImagesHtml(d) {
    var imgs = d.images || [], max = d.max_images || 5;
    var cards = imgs.map(function (im) {
      return '<figure class="prod-img' + (im.is_primary ? " is-primary" : "") + '">' +
        '<img src="' + esc(im.src) + '" alt="" loading="lazy">' +
        (im.is_primary ? '<span class="prod-img__flag">Principal</span>' : '') +
        '<figcaption>' + esc(im.source) +
          '<span class="' + (im.local ? "" : "is-warn") + '">' + (im.local ? "local" : "remota") + '</span>' +
        '</figcaption>' +
        '<div class="prod-img__acts">' +
          (im.is_primary ? '' : '<button class="admin-btn-sm" data-imgprimary="' + im.id + '">Principal</button>') +
          '<button class="admin-btn-sm" data-imgremove="' + im.id + '">Quitar</button>' +
        '</div>' +
      '</figure>';
    }).join("");
    var vacio = '<p class="prod-hint">Este producto no tiene imágenes. En la tienda se muestra el logotipo de Ok.station en su lugar.</p>';
    return '<div class="prod-gallery">' + (imgs.length ? cards : vacio) + '</div>' +
      '<p class="prod-hint">' + imgs.length + ' de ' + max + ' imágenes.' +
      (imgs.length ? ' Las marcadas como <b>remota</b> se sirven desde el proveedor: si esa fuente se cae, el producto se queda sin foto.' : '') +
      '</p>';
  }

  function prodSpecsHtml(specs) {
    if (!specs || !specs.length) {
      return '<p class="prod-hint">Sin ficha técnica. Icecat no aportó características para este producto.</p>';
    }
    return specs.map(function (g) {
      return '<h4 class="prod-subtitle">' + esc(g.group) + '</h4>' +
        '<table class="prod-specs"><tbody>' + g.items.map(function (it) {
          return '<tr><th>' + esc(it.name) + '</th><td>' + esc(it.value) + '</td></tr>';
        }).join("") + '</tbody></table>';
    }).join("");
  }

  function prodEnrichHtml(rows) {
    if (!rows || !rows.length) return '<p class="prod-hint">Todavía no se consulta ninguna fuente para este producto.</p>';
    var ESTADO = { ok: "Aportó datos", sin_datos: "No lo tiene", error: "Falló", revision: "Espera revisión", rechazado: "Descartado" };
    return '<table class="prod-specs"><tbody>' + rows.map(function (r) {
      return '<tr><th>' + esc(r.source) + '</th><td>' + esc(ESTADO[r.status] || r.status) +
        (r.fields ? ' · ' + esc(r.fields) : '') +
        (r.confidence !== null && typeof r.confidence !== "undefined" ? ' · ' + esc(r.confidence) + '% de certeza' : '') +
        (r.detail ? '<div class="catalog-note">' + esc(r.detail) + '</div>' : '') +
        '</td></tr>';
    }).join("") + '</tbody></table>';
  }

  function productModalHtml(d) {
    var p = d.product || {};
    var ref = p.sku || p.supplier_ref || "";
    return '<div class="prod-modal__panel">' +
      '<div class="prod-modal__head">' +
        '<div><div class="prod-modal__title">' + esc(p.name || "Producto") + '</div>' +
        '<div class="prod-modal__sub">' + esc(p.brand || "sin marca") + (ref ? " · " + esc(ref) : "") +
          ' · ' + esc(p.category || "sin categoría") + '</div></div>' +
        '<button type="button" class="btn btn--light btn--sm" id="prod-modal-close">Cerrar</button>' +
      '</div>' +
      '<div class="prod-modal__body">' +
        '<h4 class="prod-subtitle">Imágenes</h4>' + prodImagesHtml(d) +
        /* PONER una foto lo resuelve admin-fotos.js: busca candidatas, permite
           subir un archivo o pegar con Ctrl+V, y la descarga a nuestro servidor.
           Aquí solo se dispara con su mismo enganche [data-foto] — un solo camino
           para poner fotos en todo el panel. */
        '<div class="prod-addurl">' +
          '<button type="button" class="btn btn--primary btn--sm" data-foto="' + p.id +
            '" data-foto-nombre="' + esc(p.name || "") + '" data-foto-marca="' + esc(p.brand || "") + '">' +
            ((d.images || []).length ? "Cambiar foto" : "Poner foto") + '</button>' +
        '</div>' +
        '<h4 class="prod-subtitle">Datos del catálogo</h4>' +
        '<div class="prod-fields">' +
          prodField("Precio público", mxn(Number(p.price) || 0) + " <small>+ IVA</small>") +
          prodField("Costo proveedor", mxn(Number(p.cost) || 0)) +
          prodField("Existencia", p.stock + " <small>almacén " + esc(p.warehouse_id || "—") + "</small>") +
          prodField("Estado", p.is_active ? "Publicado" : "Oculto") +
          prodField("Subcategoría", esc(p.subcategory || "—")) +
          prodField("Proveedor", esc(p.supplier || "—") + " <small>" + esc(p.supplier_ref || "") + "</small>") +
          prodField("Código de barras", esc(p.barcode || "—")) +
          prodField("Clave SAT", esc(p.sat_code || "—")) +
          prodField("Última sincronización", esc(p.last_synced_at || "—")) +
          prodField("Enriquecido", esc(p.enriched_at || "nunca")) +
        '</div>' +
        '<h4 class="prod-subtitle">Fuentes consultadas</h4>' + prodEnrichHtml(d.enrichment) +
        '<h4 class="prod-subtitle">Ficha técnica</h4>' + prodSpecsHtml(d.specs) +
      '</div>' +
    '</div>';
  }

  function openProductModal(id) {
    DataSource.productDetail(id).then(function (d) {
      if (!d || !d.ok) { window.alert((d && (d.error || d.message)) || "No se pudo abrir el producto."); return; }
      closeProductModal();
      prodModalId = id;
      var ov = document.createElement("div");
      ov.id = "prod-modal";
      ov.className = "prod-modal";
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");
      ov.innerHTML = productModalHtml(d);
      document.body.appendChild(ov);
      document.body.style.overflow = "hidden";

      ov.addEventListener("click", function (e) { if (e.target === ov) closeProductModal(); });
      $("#prod-modal-close", ov).addEventListener("click", closeProductModal);
      document.addEventListener("keydown", escProdClose);

      $$("[data-imgprimary]", ov).forEach(function (b) {
        b.addEventListener("click", function () {
          b.disabled = true;
          DataSource.productImage({ action: "primary", product_id: id, image_id: +b.dataset.imgprimary })
            .then(function () { openProductModal(id); renderCatalog(); });
        });
      });
      $$("[data-imgremove]", ov).forEach(function (b) {
        b.addEventListener("click", function () {
          if (!window.confirm("¿Quitar esta imagen del producto?")) return;
          b.disabled = true;
          DataSource.productImage({ action: "remove", product_id: id, image_id: +b.dataset.imgremove })
            .then(function () { openProductModal(id); renderCatalog(); });
        });
      });
      /* El selector de fotos de admin-fotos.js se monta sobre <body>. Si la ficha
         siguiera abierta encima, el usuario elegiría a ciegas: se cierra al pasar
         el control. Al volver, la tabla se refresca sola con el conteo nuevo. */
      $$("[data-foto]", ov).forEach(function (b) {
        b.addEventListener("click", function () { closeProductModal(); });
      });
    }).catch(function () { window.alert("Sin conexión al abrir el producto."); });
  }

  /* ============================================================
     NAVEGACIÓN ENTRE VISTAS
     ============================================================ */
  var TITLES = { dashboard: "Dashboard", pedidos: "Pedidos", tienda: "Tienda", catalogo: "Catálogo", citas: "Citas", usuarios: "Usuarios", resenas: "Reseñas", reportes: "Reportes", precios: "Precios" };
  var rendered = {};
  function showView(view) {
    /* Blindaje: el empleado puro no entra a Usuarios ni Reportes aunque fuerce la URL/nav. */
    if (isEmpleadoOnly() && EMPLEADO_BLOCKED_VIEWS.indexOf(view) >= 0) view = "dashboard";
    $$("[data-view]").forEach(function (el) {
      if (el.tagName === "SECTION") el.hidden = el.dataset.view !== view;
    });
    $$(".admin-nav__item[data-view]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.view === view); });
    $("#admin-title").textContent = TITLES[view] || "Panel";
    if (!rendered[view]) {
      if (view === "pedidos") renderOrdersTable();
      if (view === "tienda") renderShopTable();
      if (view === "catalogo") renderCatalog();
      if (view === "citas") renderAppointments("");
      if (view === "usuarios") renderUsers();
      if (view === "resenas") renderReviews();
      if (view === "reportes") renderReport();
      if (view === "precios") renderPricing();
      rendered[view] = true;
    }
    document.body.parentNode; // noop
    closeNav();
  }

  /* Modal de confirmación por contraseña. callback(pw, close, setMsg, setBusy). */
  function askPassword(onConfirm) {
    if (document.getElementById("pwd-modal")) return;
    var ov = document.createElement("div");
    ov.id = "pwd-modal"; ov.className = "pwd-modal";
    ov.innerHTML =
      '<div class="pwd-modal__overlay" data-close></div>' +
      '<div class="pwd-modal__panel" role="dialog" aria-modal="true" aria-label="Confirmar con contraseña">' +
        '<h3>Confirma tu contraseña</h3>' +
        '<p>Por seguridad, ingresa tu contraseña para guardar los cambios de precios.</p>' +
        '<input type="password" id="pwd-input" autocomplete="current-password" placeholder="Tu contraseña">' +
        '<div class="pwd-modal__msg" id="pwd-msg"></div>' +
        '<div class="pwd-modal__actions"><button type="button" class="btn btn--light btn--sm" data-close>Cancelar</button>' +
        '<button type="button" class="btn btn--primary btn--sm" id="pwd-ok">Confirmar</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    var input = ov.querySelector("#pwd-input"), okBtn = ov.querySelector("#pwd-ok"), msgEl = ov.querySelector("#pwd-msg");
    setTimeout(function () { input.focus(); }, 30);
    function close() { ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); }
    function setMsg(t, c) { msgEl.textContent = t || ""; msgEl.style.color = c || "#b91c1c"; }
    function setBusy(b) { okBtn.disabled = b; input.disabled = b; }
    function go() { var pw = input.value; if (!pw) { setMsg("Ingresa tu contraseña."); return; } onConfirm(pw, close, setMsg, setBusy); }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "Enter") go(); }
    ov.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) close(); });
    okBtn.addEventListener("click", go);
    document.addEventListener("keydown", onKey);
  }

  /* ── PRECIOS (solo administrador/directivo): editar precios de impresión + IVA ── */
  function renderPricing() {
    var host = $("#pricing-form");
    if (!host) return;
    host.innerHTML = '<p style="color:var(--text-muted)">Cargando precios…</p>';
    apiGet("/admin/print-prices.php").then(function (j) {
      if (!j || !j.ok) { host.innerHTML = '<p style="color:#b91c1c">No tienes permiso para editar precios.</p>'; return; }
      var p = j.prices || {};
      var taxPct = Math.round((+j.tax_rate || 0.08) * 10000) / 100;
      function f(k, label) { return '<label class="pricing-f"><span>' + label + '</span><input type="number" step="0.01" min="0" data-pk="' + k + '" value="' + (p[k] != null ? p[k] : "") + '"></label>'; }
      function grp(title, inner) { return '<div class="pricing-group"><h4>' + title + '</h4><div class="pricing-grid">' + inner + '</div></div>'; }
      host.innerHTML =
        grp("Carta — Blanco y negro ($/hoja)", f("carta_bn_1", "1 a 10") + f("carta_bn_2", "11 a 60") + f("carta_bn_3", "61 o más")) +
        grp("Carta — Color ($/hoja)", f("carta_color_1", "1 a 10") + f("carta_color_2", "11 a 60") + f("carta_color_3", "61 o más")) +
        grp("Oficio — Blanco y negro ($/hoja)", f("oficio_bn_1", "1 a 10") + f("oficio_bn_2", "11 a 50") + f("oficio_bn_3", "51 o más")) +
        grp("Oficio — Color ($/hoja)", f("oficio_color_1", "1 a 10") + f("oficio_color_2", "11 a 50") + f("oficio_color_3", "51 o más")) +
        grp("Doble carta ($/hoja)", f("tabloide_bn", "Blanco y negro") + f("tabloide_color", "Color")) +
        grp("Fotografía ($/foto)", f("foto_10x15", "Foto 10×15 (6×4\")") + f("foto_13x18", "Foto 13×18 (5×7\")")) +
        grp("Gran formato 24×36\" ($/impresión)", f("gran_formato_foto", "Foto Gloss") + f("gran_formato_bond", "Hoja bond")) +
        grp("Acabados", f("enmicado_carta", "Enmicado carta ($/hoja)") + f("enmicado_tabloide", "Enmicado doble carta ($/hoja)") + f("engargolado", "Engargolado ($)")) +
        grp("Impuesto", '<label class="pricing-f"><span>IVA (%)</span><input type="number" step="0.01" min="0" id="pricing-tax" value="' + taxPct + '"></label>') +
        '<div class="pricing-actions"><button class="btn btn--primary" id="pricing-save">Guardar precios</button><span id="pricing-msg" class="pricing-msg"></span></div>';
      $("#pricing-save").addEventListener("click", function () {
        var prices = {};
        $$("[data-pk]", host).forEach(function (inp) { var v = parseFloat(inp.value); if (!isNaN(v)) prices[inp.dataset.pk] = v; });
        var payload = { prices: prices };
        var taxVal = parseFloat($("#pricing-tax").value);
        if (!isNaN(taxVal)) payload.tax_rate = taxVal;   // el backend normaliza 8 → 0.08
        /* Confirmación por contraseña antes de guardar (cambio sensible). */
        askPassword(function (pw, close, setMsg, setBusy) {
          payload.password = pw;
          setBusy(true); setMsg("Guardando…", "var(--text-muted)");
          apiPost("/admin/print-prices.php", payload).then(function (r) {
            if (r && r.ok) {
              close();
              var msg = $("#pricing-msg"); msg.textContent = "✓ Precios guardados"; msg.style.color = "#15803d";
            } else { setBusy(false); setMsg((r && r.error) || "No se pudo guardar.", "#b91c1c"); }
          }).catch(function () { setBusy(false); setMsg("Sin conexión.", "#b91c1c"); });
        });
      });
    }).catch(function () { host.innerHTML = '<p style="color:#b91c1c">Sin conexión al cargar precios.</p>'; });
  }

  function openNav() { document.body.classList.add("is-nav-open"); $("#admin-overlay").hidden = false; }
  function closeNav() { document.body.classList.remove("is-nav-open"); $("#admin-overlay").hidden = true; }

  /* Aplica restricciones de interfaz por rol. El empleado puro:
     - no ve los accesos del sidebar a Usuarios ni Reportes,
     - no ve la tarjeta "Ventas (últimos 7 días)" del dashboard.
     (El backend además bloquea esos endpoints/datos: defensa en profundidad.) */
  function applyRoleUI() {
    if (!isEmpleadoOnly()) return;
    EMPLEADO_BLOCKED_VIEWS.forEach(function (v) {
      var b = $(".admin-nav__item[data-view='" + v + "']");
      if (b) { b.hidden = true; b.style.display = "none"; }
    });
    var chart = $("#chart-sales");
    if (chart) {
      var card = chart.closest(".admin-card");
      if (card) card.style.display = "none";
    }
  }

  /* ── Init ── */
  function init() {
    if (!enforceAccess()) return;
    renderUserChip();
    applyRoleUI();

    DataSource.dashboard().then(function (d) {
      renderStats(d.stats);
      /* El empleado puro no ve la gráfica de ventas (tarjeta ya oculta por applyRoleUI). */
      if (!isEmpleadoOnly()) renderSalesChart(d.sales7);
      renderServiceBars(d.topServices);
      renderUpcoming(d.upcoming);
    });
    renderRecentOrders();
    loadDashboardCounts();

    $$(".admin-nav__item[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { showView(b.dataset.view); });
    });
    $$("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { showView(b.dataset.goto); }); });

    $$("#order-filters .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $$("#order-filters .chip").forEach(function (x) { x.classList.remove("is-selected"); });
        c.classList.add("is-selected");
        orderStatus = c.dataset.status;
        renderOrdersTable();
      });
    });
    $$("#order-pay-filters .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $$("#order-pay-filters .chip").forEach(function (x) { x.classList.remove("is-selected"); });
        c.classList.add("is-selected");
        orderPayment = c.dataset.payment || "";
        renderOrdersTable();
      });
    });
    var orderSearchEl = $("#order-search");
    if (orderSearchEl) orderSearchEl.addEventListener("input", function () {
      orderSearch = orderSearchEl.value;
      renderOrdersTable();
    });

    /* Filtros de la TIENDA */
    $$("#shop-filters .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $$("#shop-filters .chip").forEach(function (x) { x.classList.remove("is-selected"); });
        c.classList.add("is-selected");
        shopStatus = c.dataset.status || "";
        renderShopTable();
      });
    });
    $$("#shop-pay-filters .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $$("#shop-pay-filters .chip").forEach(function (x) { x.classList.remove("is-selected"); });
        c.classList.add("is-selected");
        shopPayment = c.dataset.payment || "";
        renderShopTable();
      });
    });
    var shopSearchEl = $("#shop-search");
    if (shopSearchEl) shopSearchEl.addEventListener("input", function () {
      shopSearch = shopSearchEl.value;
      renderShopTable();
    });

    /* Filtros del CATÁLOGO */
    $$("#catalog-filters .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $$("#catalog-filters .chip").forEach(function (x) { x.classList.remove("is-selected"); });
        c.classList.add("is-selected");
        catalogImages = c.dataset.images || "";
        renderCatalog();
      });
    });
    var catalogSearchEl = $("#catalog-search");
    if (catalogSearchEl) {
      /* El catálogo filtra en el SERVIDOR (puede crecer a miles de productos, no se
         puede traer completo al navegador). Por eso se espera a que el usuario deje
         de teclear: sin esta pausa, escribir "cuaderno" dispararía 8 consultas. */
      var catalogTimer = null;
      catalogSearchEl.addEventListener("input", function () {
        catalogSearch = catalogSearchEl.value;
        clearTimeout(catalogTimer);
        catalogTimer = setTimeout(renderCatalog, 250);
      });
    }
    var catalogRescueEl = $("#catalog-rescue");
    if (catalogRescueEl) catalogRescueEl.addEventListener("click", runCatalogRescue);
    var catalogRescueReportEl = $("#catalog-rescue-report");
    if (catalogRescueReportEl) catalogRescueReportEl.addEventListener("click", function () {
      loadCatalogRescueReport(true);
    });
    var catalogRescueCloseEl = $("#catalog-rescue-report-close");
    if (catalogRescueCloseEl) catalogRescueCloseEl.addEventListener("click", function () {
      var panel = $("#catalog-rescue-report-panel"); if (panel) panel.hidden = true;
    });
    $$("#catalog-rescue-report-filters [data-rescue-status]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $$("#catalog-rescue-report-filters [data-rescue-status]").forEach(function (x) {
          x.classList.remove("is-selected");
        });
        chip.classList.add("is-selected");
        catalogRescueStatus = chip.dataset.rescueStatus || "";
        renderCatalogRescueReport();
      });
    });
    var catalogRescueSearchEl = $("#catalog-rescue-search");
    if (catalogRescueSearchEl) {
      /* A diferencia del buscador del catálogo, aquí NO se consulta al servidor:
         las filas ya están en memoria (el reporte carga hasta 500), así que se
         filtra en cada tecla, sin pausa. */
      catalogRescueSearchEl.addEventListener("input", function () {
        catalogRescueSearch = catalogRescueSearchEl.value;
        renderCatalogRescueReport();
      });
    }

    var apptStatus = "", apptDate = "";
    $$("#appt-filters .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $$("#appt-filters .chip").forEach(function (x) { x.classList.remove("is-selected"); });
        c.classList.add("is-selected");
        apptStatus = c.dataset.status;
        renderAppointments(apptStatus, apptDate);
      });
    });
    var apptSearchEl = $("#appt-search");
    if (apptSearchEl) apptSearchEl.addEventListener("input", function () {
      apptSearch = apptSearchEl.value;
      renderAppointments(apptStatus, apptDate);
    });
    var userSearchEl = $("#user-search");
    if (userSearchEl) userSearchEl.addEventListener("input", function () {
      userSearch = userSearchEl.value;
      renderUsers();
    });
    var reviewSearchEl = $("#review-search");
    if (reviewSearchEl) reviewSearchEl.addEventListener("input", function () {
      reviewSearch = reviewSearchEl.value;
      renderReviews();
    });

    /* ── Reportes: periodo (día/semana/mes) + fecha + descarga PDF ── */
    var reportDateEl = $("#report-date");
    if (reportDateEl && !reportDateEl.value) { reportDateEl.value = todayStr(); reportDate = reportDateEl.value; }
    $$("#report-period .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $$("#report-period .chip").forEach(function (x) { x.classList.remove("is-selected"); });
        c.classList.add("is-selected");
        reportPeriod = c.dataset.period;
        renderReport();
      });
    });
    if (reportDateEl) reportDateEl.addEventListener("change", function () {
      reportDate = reportDateEl.value;
      renderReport();
    });
    var reportPdfBtn = $("#report-pdf");
    if (reportPdfBtn) reportPdfBtn.addEventListener("click", downloadReportPdf);

    $("#admin-burger").addEventListener("click", openNav);
    $("#admin-overlay").addEventListener("click", closeNav);
    $("#admin-logout").addEventListener("click", function () {
      try { localStorage.removeItem("okstation.token"); localStorage.removeItem("okstation.user"); } catch (e) {}
      window.location.href = "cuenta.html";
    });

    if (!DEMO) $("#admin-demo").style.display = "none";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

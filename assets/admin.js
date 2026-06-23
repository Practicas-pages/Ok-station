/* ============================================================
   OK.station — Panel administrativo (front)
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
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }

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
  /* Celda de servicio: servicio (cualquiera de los 9) + subtipo de pasaporte + nº de personas. */
  function apptServiceCell(a) {
    var html = '<b>' + esc(TRAMITE_LABEL[a.tramite] || a.tramite) + '</b>';
    if (a.tramite === "pasaporte" && a.passport_subtype) {
      html += ' <span class="appt-tag">' + esc(SUBTYPE_LABEL[a.passport_subtype] || a.passport_subtype) + '</span>';
    }
    var n = parseInt(a.party_size, 10) || 1;
    if (n > 1) html += '<br><span class="appt-extra">' + n + ' personas</span>';
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
      { code: "OKS-2026-000128", client: "María González", items: 3, total: 240, status: "recibido", date: "2026-06-10" },
      { code: "OKS-2026-000127", client: "Jorge Ramírez", items: 1, total: 85, status: "en_revision", date: "2026-06-10" },
      { code: "OKS-2026-000126", client: "Ana López", items: 5, total: 620, status: "en_produccion", date: "2026-06-09" },
      { code: "OKS-2026-000125", client: "Luis Pérez", items: 2, total: 150, status: "listo", date: "2026-06-09" },
      { code: "OKS-2026-000124", client: "Carla Méndez", items: 4, total: 410, status: "entregado", date: "2026-06-08" },
      { code: "OKS-2026-000123", client: "Diego Salas", items: 1, total: 60, status: "cancelado", date: "2026-06-08" },
      { code: "OKS-2026-000122", client: "Paola Ruiz", items: 6, total: 880, status: "recibido", date: "2026-06-08" }
    ],
    users: [
      { name: "María González", email: "maria@ejemplo.com", phone: "664 100 0001", orders: 7, active: true, joined: "2026-01-12" },
      { name: "Jorge Ramírez", email: "jorge@ejemplo.com", phone: "664 100 0002", orders: 3, active: true, joined: "2026-02-03" },
      { name: "Ana López", email: "ana@ejemplo.com", phone: "664 100 0003", orders: 12, active: true, joined: "2025-11-20" },
      { name: "Diego Salas", email: "diego@ejemplo.com", phone: "664 100 0004", orders: 1, active: false, joined: "2026-05-30" }
    ],
    services: [
      { name: "Copias fotostáticas", category: "Impresión y copias", price: 1.5, unit: "copia", active: true },
      { name: "Impresión de fotografías", category: "Fotografía", price: 8, unit: "foto 10×15", active: true },
      { name: "Fotos para trámites", category: "Fotografía", price: 60, unit: "set", active: true },
      { name: "Engargolado", category: "Acabados", price: 35, unit: "pieza", active: true },
      { name: "Enmicado", category: "Acabados", price: 15, unit: "hoja", active: true }
    ],
    reviews: [
      { name: "María G.", rating: 5, comment: "Rápido y excelente atención.", status: "aprobada", date: "2026-06-09" },
      { name: "Jorge R.", rating: 5, comment: "Mi tesis quedó impecable.", status: "pendiente", date: "2026-06-10" },
      { name: "Anónimo", rating: 2, comment: "Tardó más de lo esperado.", status: "oculta", date: "2026-06-07" }
    ],
    appointments: [
      { code: "CITA-2026-000031", tramite: "pasaporte", passport_subtype: "mexicano", party_size: 2, date: "2026-06-20", time: "09:00", status: "pendiente", contact_name: "María González", contact_phone: "664 100 0001", contact_email: "maria@ejemplo.com", contact_pref: "whatsapp", notes: "Renovación", account_name: "María González" },
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
        return j.orders || [];
      });
    },
    updateStatus: function (id, status) {
      if (DEMO) { var o = MOCK.orders.find(function (x) { return String(x.id) === String(id); }); if (o) o.status = status; return Promise.resolve({ ok: true }); }
      return apiPost("/admin/order-status.php", { id: id, status: status });
    },
    orderDetail: function (id) {
      if (DEMO) { var o = (MOCK.orders || []).find(function (x) { return String(x.id || x.code) === String(id); }); return Promise.resolve(o ? { ok: true, order: o } : { ok: false }); }
      return apiGet("/orders/get.php?id=" + encodeURIComponent(id));
    },
    users:    function () { return DEMO ? Promise.resolve(MOCK.users)    : apiGet("/admin/users.php").then(function (j) { return j.users || []; }); },
    services: function () { return DEMO ? Promise.resolve(MOCK.services) : apiGet("/admin/services.php").then(function (j) { return j.services || []; }); },
    reviews:  function () { return DEMO ? Promise.resolve(MOCK.reviews)  : apiGet("/admin/reviews.php").then(function (j) { return j.reviews || []; }); },
    moderateReview: function (id, action) { return DEMO ? Promise.resolve({ ok: true }) : apiPost("/admin/review-moderate.php", { id: id, action: action }); },
    toggleUser: function (id, active) { return DEMO ? Promise.resolve({ ok: true }) : apiPost("/admin/user-toggle.php", { id: id, active: active }); },
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
  var SIZE_LABEL = { carta: "Carta", oficio: "Oficio", tabloide: "Tabloide", a4: "A4", foto_10x15: "Foto 10×15", foto_13x18: "Foto 13×18", gran_formato: "Gran formato" };
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
      { label: "Pedidos totales", value: s.orders, delta: s.dOrders, color: "var(--brand-blue)", bg: "var(--brand-blue-light)", icon: '<path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"/>' },
      { label: "Ventas del mes", value: mxn(s.sales), delta: s.dSales, color: "#15803D", bg: "#DCFCE7", icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>' },
      { label: "Usuarios", value: s.users, delta: s.dUsers, color: "#7C3AED", bg: "#F3E8FF", icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
      { label: "Pendientes", value: s.pending, delta: s.dPending, color: "#B45309", bg: "#FEF3C7", icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' }
    ];
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
      return '<tr><td class="mono">' + esc(o.code) + '</td><td><b>' + esc(o.client) + '</b></td><td>' + o.items + '</td>' +
        '<td class="mono">' + mxn(o.total) + '</td><td>' + statusCell + '</td>' +
        '<td>' + payBadge(o.payment_status) + '</td>' + refCell + '<td>' + esc(o.date) + '</td>' +
        '<td><button class="admin-btn-sm" data-view-order="' + esc(o.id || o.code) + '">Previsualizar</button></td></tr>';
    }).join("");
    return head + '<tbody>' + body + '</tbody>';
  }

  function bindStatusSelects(scope) {
    $$(".status-select", scope).forEach(function (sel) {
      sel.addEventListener("change", function () {
        DataSource.updateStatus(sel.dataset.id, sel.value).then(function () {
          loadDashboardCounts();
        });
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
    return '<h4 style="margin:0 0 6px;font-size:.95rem">Pago</h4>' +
      '<div style="display:flex;flex-direction:column;gap:6px;font-size:.9rem;background:#f8fafc;border-radius:8px;padding:12px 14px;margin:0 0 16px">' + rows.join("") + '</div>';
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
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #eef0f4">' +
          '<div><div style="font-weight:700;font-size:1.05rem">' + esc(o.code) + '</div>' +
          '<div style="font-size:.8rem;color:var(--text-muted,#6b7280)">' + esc(String(o.created_at || o.date || "").slice(0, 10)) + '</div></div>' +
          badge(o.status) +
        '</div>' +
        '<div style="padding:18px 20px">' +
          '<h4 style="margin:0 0 6px;font-size:.95rem">Cliente</h4>' +
          '<p style="margin:0 0 16px;font-size:.9rem;line-height:1.5">' + esc(c.name || o.client_name || "—") +
            (c.email ? '<br><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
            (c.phone ? '<br><a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '') +
          '</p>' +
          (o.comments ? '<h4 style="margin:0 0 6px;font-size:.95rem">Indicaciones del cliente</h4><p style="margin:0 0 16px;font-size:.9rem;white-space:pre-wrap;background:#f8fafc;border-radius:8px;padding:10px 12px">' + esc(o.comments) + '</p>' : '') +
          paymentPanel(o) +
          '<h4 style="margin:0 0 10px;font-size:.95rem">Archivos a imprimir</h4>' +
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
    items.forEach(function (it, idx) { loadFileInto(ov, idx, it.uploaded_file_id, it.original_name); });
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

  function renderRecentOrders() {
    DataSource.orders("").then(function (list) {
      var host = $("#recent-orders");
      host.innerHTML = ordersRows(list.slice(0, 5), false);
      bindOrderView(host);
    });
  }
  /* Estado actual de la vista Pedidos: chip de estado, chip de pago y búsqueda. */
  var orderStatus = "", orderPayment = "", orderSearch = "";
  function renderOrdersTable() {
    var q = (orderSearch || "").trim();
    DataSource.orders(orderStatus || "", orderPayment || "", q).then(function (list) {
      var t = $("#orders-table");
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
    });
  }
  var userSearch = "";
  function renderUsers() {
    var head = '<thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Pedidos</th><th>Estado</th><th>Alta</th><th></th></tr></thead>';
    DataSource.users().then(function (list) {
      var q = (userSearch || "").trim().toLowerCase();
      if (q) list = list.filter(function (u) {
        return (String(u.name || "") + " " + String(u.email || "") + " " + String(u.phone || "")).toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) {
        $("#users-table").innerHTML = head + '<tbody><tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">' + (q ? 'No se encontraron usuarios para “' + esc(userSearch.trim()) + '”.' : "No hay usuarios.") + '</td></tr></tbody>';
        return;
      }
      var body = list.map(function (u) {
        var active = +u.active ? 1 : 0;
        return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.email) + '</td><td>' + esc(u.phone) + '</td><td>' + (u.orders || 0) + '</td>' +
          '<td><span class="badge badge--' + (active ? "listo" : "cancelado") + '">' + (active ? "Activo" : "Inactivo") + '</span></td>' +
          '<td>' + esc(u.joined) + '</td><td><button class="admin-btn-sm" data-uview="' + esc(u.id) + '">Historial</button> ' +
          '<button class="admin-btn-sm" data-utoggle="' + esc(u.id) + '" data-active="' + (active ? 0 : 1) + '">' + (active ? "Desactivar" : "Reactivar") + '</button></td></tr>';
      }).join("");
      var t = $("#users-table"); t.innerHTML = head + '<tbody>' + body + '</tbody>';
      $$("[data-utoggle]", t).forEach(function (b) {
        b.addEventListener("click", function () { DataSource.toggleUser(b.dataset.utoggle, +b.dataset.active).then(renderUsers); });
      });
      $$("[data-uview]", t).forEach(function (b) {
        b.addEventListener("click", function () { viewUser(b.dataset.uview); });
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
        orders.map(function (o) { return '<tr><td class="mono">' + esc(o.code) + '</td><td>' + badge(o.status) + '</td><td class="mono">' + mxn(o.total || 0) + '</td><td>' + (o.items || 0) + '</td><td>' + esc(o.date) + '</td></tr>'; }).join("") + '</tbody></table></div>'
      : '<p style="color:var(--text-muted);font-size:.88rem;margin:0">Sin pedidos.</p>';
    var appts = (d.appointments || []);
    var aTable = appts.length
      ? '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Folio</th><th>Servicio</th><th>Fecha</th><th>Hora</th><th>Estado</th></tr></thead><tbody>' +
        appts.map(function (a) { return '<tr><td class="mono">' + esc(a.code) + '</td><td>' + apptServiceCell(a) + '</td><td>' + esc(a.date) + '</td><td class="mono">' + esc(a.time) + '</td><td>' + badge(a.status, APPT_STATUS) + '</td></tr>'; }).join("") + '</tbody></table></div>'
      : '<p style="color:var(--text-muted);font-size:.88rem;margin:0">Sin citas.</p>';
    var svcs = (d.services || []);
    var svcList = svcs.length
      ? '<div class="service-chips">' + svcs.map(function (x) { return '<span class="badge badge--listo">' + esc(SIZE_LABEL[x.name] || x.name) + ' · ' + x.count + '</span>'; }).join(" ") + '</div>'
      : '<p style="color:var(--text-muted);font-size:.88rem;margin:0">Sin servicios de impresión registrados.</p>';
    var movs = (d.movements || []);
    var movList = movs.length
      ? '<ul class="user-movements">' + movs.map(function (m) { return '<li><span class="user-movements__when mono">' + esc(m.at) + '</span> ' + esc(ACTION_LABEL[m.action] || m.action) + (m.entity ? ' <span style="color:var(--text-muted)">(' + esc(m.entity) + (m.entity_id ? " #" + esc(m.entity_id) : "") + ')</span>' : '') + '</li>'; }).join("") + '</ul>'
      : '<p style="color:var(--text-muted);font-size:.88rem;margin:0">Sin movimientos registrados.</p>';
    return sum +
      '<h4 style="margin:0 0 8px;font-size:.95rem">Pedidos</h4>' + oTable +
      '<h4 style="margin:18px 0 8px;font-size:.95rem">Citas</h4>' + aTable +
      '<h4 style="margin:18px 0 8px;font-size:.95rem">Servicios de impresión tomados</h4>' + svcList +
      '<h4 style="margin:18px 0 8px;font-size:.95rem">Movimientos</h4>' + movList;
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
    document.addEventListener("keydown", escUserClose);
  }
  function viewUser(id) {
    DataSource.userDetail(id).then(function (res) {
      if (!res || !res.ok) { window.alert("No se pudo cargar el historial del usuario."); return; }
      openUserModal(res);
    }).catch(function () { window.alert("Sin conexión al cargar el historial."); });
  }
  function renderServices() {
    var head = '<thead><tr><th>Servicio</th><th>Categoría</th><th>Precio</th><th>Unidad</th><th>Estado</th><th></th></tr></thead>';
    DataSource.services().then(function (list) {
      var body = list.map(function (s) {
        var active = +s.active ? 1 : 0;
        return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.category) + '</td><td class="mono">' + mxn(parseFloat(s.price) || 0) + '</td><td>' + esc(s.unit) + '</td>' +
          '<td><span class="badge badge--' + (active ? "listo" : "oculta") + '">' + (active ? "Activo" : "Inactivo") + '</span></td>' +
          '<td><button class="admin-btn-sm" disabled title="Edición de servicios: próxima fase">Editar</button></td></tr>';
      }).join("");
      $("#services-table").innerHTML = head + '<tbody>' + body + '</tbody>';
    });
  }
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
        var contacto = esc(a.contact_phone || "") + (a.contact_email ? '<br><span style="color:var(--text-muted);font-size:.82rem">' + esc(a.contact_email) + '</span>' : "");
        return '<tr>' +
          '<td class="mono">' + esc(a.code) + '</td>' +
          '<td>' + apptServiceCell(a) + '</td>' +
          '<td>' + esc(a.date) + '</td>' +
          '<td class="mono">' + esc(a.time) + '</td>' +
          '<td><b>' + esc(a.contact_name) + '</b>' + (a.account_name ? '' : ' <span style="color:var(--text-muted);font-size:.78rem">(invitado)</span>') + '</td>' +
          '<td>' + contacto + '</td>' +
          '<td>' + apptStatusSelect(a) + (canPdf ? ' <button type="button" class="appt-pdf" data-i="' + i + '">PDF</button>' : '') + '</td>' +
        '</tr>';
      }).join("");
      t.innerHTML = head + '<tbody>' + body + '</tbody>';
      $$(".appt-status-select", t).forEach(function (sel) {
        sel.addEventListener("change", function () {
          DataSource.updateApptStatus(sel.dataset.id, sel.value).then(function () { loadDashboardCounts(); });
        });
      });
      $$(".appt-pdf", t).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var a = list[+btn.dataset.i];
          if (a) window.OKCitaTicketDownload({ code: a.code, tramite: a.tramite, passport_subtype: a.passport_subtype, party_size: a.party_size, date: a.date, time: a.time, status: a.status, name: a.contact_name, phone: a.contact_phone });
        });
      });
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
      reportStat("Ventas del periodo", mxn(o.sales || 0)) +
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
    line("OK.station — Corte de " + (PERIOD_LABEL[rep.period] || rep.period)); nl(7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
    line("Periodo: " + ((rep.range && rep.range.label) || rep.date || "")); nl(5);
    line("Generado: " + (rep.generated || todayStr())); nl(10);
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); line("Resumen"); nl(7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    line("Ventas del periodo: " + mxn(rep.orders.sales || 0)); nl();
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
     NAVEGACIÓN ENTRE VISTAS
     ============================================================ */
  var TITLES = { dashboard: "Dashboard", pedidos: "Pedidos", citas: "Citas", usuarios: "Usuarios", servicios: "Servicios", resenas: "Reseñas", reportes: "Reportes" };
  var rendered = {};
  function showView(view) {
    $$("[data-view]").forEach(function (el) {
      if (el.tagName === "SECTION") el.hidden = el.dataset.view !== view;
    });
    $$(".admin-nav__item[data-view]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.view === view); });
    $("#admin-title").textContent = TITLES[view] || "Panel";
    if (!rendered[view]) {
      if (view === "pedidos") renderOrdersTable();
      if (view === "citas") renderAppointments("");
      if (view === "usuarios") renderUsers();
      if (view === "servicios") renderServices();
      if (view === "resenas") renderReviews();
      if (view === "reportes") renderReport();
      rendered[view] = true;
    }
    document.body.parentNode; // noop
    closeNav();
  }

  function openNav() { document.body.classList.add("is-nav-open"); $("#admin-overlay").hidden = false; }
  function closeNav() { document.body.classList.remove("is-nav-open"); $("#admin-overlay").hidden = true; }

  /* ── Init ── */
  function init() {
    if (!enforceAccess()) return;
    renderUserChip();

    DataSource.dashboard().then(function (d) {
      renderStats(d.stats);
      renderSalesChart(d.sales7);
      renderServiceBars(d.topServices);
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

    var apptStatus = "", apptDate = "";
    $$("#appt-filters .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $$("#appt-filters .chip").forEach(function (x) { x.classList.remove("is-selected"); });
        c.classList.add("is-selected");
        apptStatus = c.dataset.status;
        renderAppointments(apptStatus, apptDate);
      });
    });
    var apptDateEl = $("#appt-date-filter");
    if (apptDateEl) apptDateEl.addEventListener("change", function () {
      apptDate = apptDateEl.value;
      renderAppointments(apptStatus, apptDate);
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

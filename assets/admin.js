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

  var DataSource = {
    dashboard: function () { return DEMO ? Promise.resolve(MOCK) : apiGet("/admin/dashboard.php"); },
    orders: function (status) {
      if (DEMO) return Promise.resolve(MOCK.orders.filter(function (o) { return !status || o.status === status; }));
      return apiGet("/admin/orders.php" + (status ? "?status=" + status : "")).then(function (j) { return j.orders || []; });
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
    }
  };

  /* ============================================================
     GUARD DE ACCESO (rol empleado/administrador)
     ============================================================ */
  function accessRoles() { var u = cachedUser(); return (u && u.roles) || []; }
  function hasAdminAccess() {
    var r = accessRoles();
    return r.indexOf("administrador") >= 0 || r.indexOf("empleado") >= 0;
  }
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
    var role = roles.indexOf("administrador") >= 0 ? "administrador"
             : (roles.indexOf("empleado") >= 0 ? "empleado" : (roles[0] || "usuario"));
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
    var head = '<thead><tr><th>Folio</th><th>Cliente</th><th>Archivos</th><th>Total</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>';
    var body = list.map(function (o) {
      var statusCell = withSelect
        ? '<select class="status-select" data-id="' + (o.id || o.code) + '">' + Object.keys(STATUS).map(function (k) {
            return '<option value="' + k + '"' + (k === o.status ? " selected" : "") + '>' + STATUS[k] + '</option>';
          }).join("") + '</select>'
        : badge(o.status);
      return '<tr><td class="mono">' + esc(o.code) + '</td><td><b>' + esc(o.client) + '</b></td><td>' + o.items + '</td>' +
        '<td class="mono">' + mxn(o.total) + '</td><td>' + statusCell + '</td><td>' + esc(o.date) + '</td>' +
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
  function renderOrdersTable(status) {
    DataSource.orders(status || "").then(function (list) {
      var t = $("#orders-table");
      t.innerHTML = ordersRows(list, true);
      bindStatusSelects(t);
      bindOrderView(t);
    });
  }
  function renderUsers() {
    var head = '<thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Pedidos</th><th>Estado</th><th>Alta</th><th></th></tr></thead>';
    DataSource.users().then(function (list) {
      var body = list.map(function (u) {
        var active = +u.active ? 1 : 0;
        return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.email) + '</td><td>' + esc(u.phone) + '</td><td>' + (u.orders || 0) + '</td>' +
          '<td><span class="badge badge--' + (active ? "listo" : "cancelado") + '">' + (active ? "Activo" : "Inactivo") + '</span></td>' +
          '<td>' + esc(u.joined) + '</td><td><button class="admin-btn-sm" data-utoggle="' + esc(u.id) + '" data-active="' + (active ? 0 : 1) + '">' + (active ? "Desactivar" : "Reactivar") + '</button></td></tr>';
      }).join("");
      var t = $("#users-table"); t.innerHTML = head + '<tbody>' + body + '</tbody>';
      $$("[data-utoggle]", t).forEach(function (b) {
        b.addEventListener("click", function () { DataSource.toggleUser(b.dataset.utoggle, +b.dataset.active).then(renderUsers); });
      });
    });
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
  function renderReviews() {
    var STR = { pendiente: "Pendiente", aprobada: "Aprobada", oculta: "Oculta" };
    var head = '<thead><tr><th>Cliente</th><th>Calificación</th><th>Comentario</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>';
    DataSource.reviews().then(function (list) {
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
  function renderAppointments(status, date) {
    var head = '<thead><tr><th>Folio</th><th>Servicio</th><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Estado</th></tr></thead>';
    DataSource.appointments(status || "", date || "").then(function (list) {
      var t = $("#appts-table");
      if (!t) return;
      if (!list.length) { t.innerHTML = head + '<tbody><tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">No hay citas para este filtro.</td></tr></tbody>'; return; }
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
  var TITLES = { dashboard: "Dashboard", pedidos: "Pedidos", citas: "Citas", usuarios: "Usuarios", servicios: "Servicios", resenas: "Reseñas" };
  var rendered = {};
  function showView(view) {
    $$("[data-view]").forEach(function (el) {
      if (el.tagName === "SECTION") el.hidden = el.dataset.view !== view;
    });
    $$(".admin-nav__item[data-view]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.view === view); });
    $("#admin-title").textContent = TITLES[view] || "Panel";
    if (!rendered[view]) {
      if (view === "pedidos") renderOrdersTable("");
      if (view === "citas") renderAppointments("");
      if (view === "usuarios") renderUsers();
      if (view === "servicios") renderServices();
      if (view === "resenas") renderReviews();
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
        renderOrdersTable(c.dataset.status);
      });
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

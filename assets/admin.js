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
    users:    function () { return DEMO ? Promise.resolve(MOCK.users)    : apiGet("/admin/users.php").then(function (j) { return j.users || []; }); },
    services: function () { return DEMO ? Promise.resolve(MOCK.services) : apiGet("/admin/services.php").then(function (j) { return j.services || []; }); },
    reviews:  function () { return DEMO ? Promise.resolve(MOCK.reviews)  : apiGet("/admin/reviews.php").then(function (j) { return j.reviews || []; }); },
    moderateReview: function (id, action) { return DEMO ? Promise.resolve({ ok: true }) : apiPost("/admin/review-moderate.php", { id: id, action: action }); },
    toggleUser: function (id, active) { return DEMO ? Promise.resolve({ ok: true }) : apiPost("/admin/user-toggle.php", { id: id, active: active }); }
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
        '<td><button class="admin-btn-sm">Ver</button></td></tr>';
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

  function renderRecentOrders() {
    DataSource.orders("").then(function (list) {
      $("#recent-orders").innerHTML = ordersRows(list.slice(0, 5), false);
    });
  }
  function renderOrdersTable(status) {
    DataSource.orders(status || "").then(function (list) {
      var t = $("#orders-table");
      t.innerHTML = ordersRows(list, true);
      bindStatusSelects(t);
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

  function loadDashboardCounts() {
    DataSource.dashboard().then(function (d) {
      if (d && d.nav) {
        $("#nav-pedidos-count").textContent = d.nav.pedidos;
        $("#nav-resenas-count").textContent = d.nav.resenas;
      } else {
        $("#nav-pedidos-count").textContent = (MOCK.orders || []).length;
        $("#nav-resenas-count").textContent = (MOCK.reviews || []).filter(function (r) { return r.status === "pendiente"; }).length;
      }
    });
  }

  /* ============================================================
     NAVEGACIÓN ENTRE VISTAS
     ============================================================ */
  var TITLES = { dashboard: "Dashboard", pedidos: "Pedidos", usuarios: "Usuarios", servicios: "Servicios", resenas: "Reseñas" };
  var rendered = {};
  function showView(view) {
    $$("[data-view]").forEach(function (el) {
      if (el.tagName === "SECTION") el.hidden = el.dataset.view !== view;
    });
    $$(".admin-nav__item[data-view]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.view === view); });
    $("#admin-title").textContent = TITLES[view] || "Panel";
    if (!rendered[view]) {
      if (view === "pedidos") renderOrdersTable("");
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

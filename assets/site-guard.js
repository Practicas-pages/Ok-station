(function () {
  'use strict';

  var GUARD = {
    MAINTENANCE_MODE: false,

    TIENDA_MANTENIMIENTO: false,

    TIENDA_PATHS: ['/tienda', '/tienda-dinamica', '/producto', '/categoria'],

    JWT_KEY: 'okstation_token',
    JWT_KEY_APP: 'okstation.token',
    JWT_KEY_ALT: 'access_token',

    ADMIN_ROLES: ['admin', 'administrador', 'administrator', 'superadmin', 'empleado', 'employee', 'staff', 'directivo'],
    TIENDA_ROLES: ['admin', 'administrador', 'administrator', 'superadmin', 'directivo'],

    MAINTENANCE_URL: '/maintenance.html',

    BYPASS_PATHS: ['/assets/', '/api/', '/recuperar.html', '/restablecer.html'],
  };

  var currentPath = window.location.pathname;

  function esRutaDeTienda(path) {
    for (var t = 0; t < GUARD.TIENDA_PATHS.length; t++) {
      if (path.indexOf(GUARD.TIENDA_PATHS[t]) === 0) { return true; }
    }
    return false;
  }

  function rolesGuardados() {
    try {
      var u = JSON.parse(localStorage.getItem('okstation.user') || 'null');
      return (u && Array.isArray(u.roles)) ? u.roles : [];
    } catch (_) { return []; }
  }
  function puedeEntrarALaTienda() {
    return rolesGuardados().some(function (r) {
      return GUARD.TIENDA_ROLES.indexOf(String(r || '').toLowerCase().trim()) !== -1;
    });
  }

  var SELECTORES_TIENDA = [
    '.nav__tienda', '.nav__rapida',
    '.okpromo', '.okpromo-sec',
    'a[href*="tienda.html"]', 'a[href*="tienda-dinamica"]',
    'a[href^="/tienda"]', 'a[href^="/producto/"]', 'a[href^="/categoria/"]'
  ].join(',');

  function ocultarEntradasATienda() {
    var n = document.querySelectorAll(SELECTORES_TIENDA);
    for (var i = 0; i < n.length; i++) {
      var sec = n[i].closest ? n[i].closest('.okpromo-sec') : null;
      var obj = sec || n[i];
      if (obj && obj.parentNode) { obj.parentNode.removeChild(obj); }
    }
  }

  if (GUARD.TIENDA_MANTENIMIENTO && !puedeEntrarALaTienda()) {
    var arranca = function () {
      ocultarEntradasATienda();
      try {
        new MutationObserver(ocultarEntradasATienda)
          .observe(document.body, { childList: true, subtree: true });
      } catch (_) {}
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', arranca);
    } else {
      arranca();
    }
  }

  var gatear = GUARD.MAINTENANCE_MODE || (GUARD.TIENDA_MANTENIMIENTO && esRutaDeTienda(currentPath));
  if (!gatear) { return; }

  if (GUARD.TIENDA_MANTENIMIENTO && !GUARD.MAINTENANCE_MODE) {
    if (puedeEntrarALaTienda()) { return; }
    try { sessionStorage.setItem('oks_intended', window.location.href); } catch (_) {}
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }

  if (currentPath === '/maintenance.html' || currentPath === '/maintenance') {
    return;
  }

  for (var i = 0; i < GUARD.BYPASS_PATHS.length; i++) {
    if (currentPath.indexOf(GUARD.BYPASS_PATHS[i]) === 0) { return; }
  }

  try {
    sessionStorage.setItem('oks_intended', window.location.href);
  } catch (_) {}

  function getToken() {
    try {
      return localStorage.getItem(GUARD.JWT_KEY)
          || localStorage.getItem(GUARD.JWT_KEY_APP)
          || localStorage.getItem(GUARD.JWT_KEY_ALT)
          || sessionStorage.getItem(GUARD.JWT_KEY)
          || null;
    } catch (_) { return null; }
  }

  function decodePayload(token) {
    try {
      var parts = token.split('.');
      if (parts.length !== 3) { return null; }
      var base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) { base64 += '='; }
      var json = atob(base64);
      return JSON.parse(decodeURIComponent(
        json.split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      ));
    } catch (_) { return null; }
  }

  function extractRole(payload) {
    if (!payload) { return null; }
    return payload.role
        || payload.rol
        || (payload.roles && payload.roles[0])
        || (payload.user && (payload.user.role || payload.user.rol))
        || (payload.data && (payload.data.role || payload.data.rol))
        || null;
  }

  function isExpired(payload) {
    if (!payload || !payload.exp) { return false; }
    return Math.floor(Date.now() / 1000) > payload.exp;
  }

  function hasAccess(role) {
    if (!role) { return false; }
    var r = String(role).toLowerCase();
    return GUARD.ADMIN_ROLES.some(function (allowed) {
      return allowed === r;
    });
  }

  function rolesDelUsuarioGuardado() {
    try {
      var u = JSON.parse(localStorage.getItem('okstation.user') || 'null');
      return (u && Array.isArray(u.roles)) ? u.roles : [];
    } catch (_) { return []; }
  }
  function tieneAccesoPorUsuarioGuardado() {
    return rolesDelUsuarioGuardado().some(hasAccess);
  }

  try {
    if (localStorage.getItem('oks_site_access') === '1') { return; }
  } catch (_) {}

  var token = getToken();

  if (!token) {
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }

  var payload = decodePayload(token);

  if (!payload || isExpired(payload)) {
    try {
      localStorage.removeItem(GUARD.JWT_KEY);
      localStorage.removeItem(GUARD.JWT_KEY_APP);
      localStorage.removeItem(GUARD.JWT_KEY_ALT);
    } catch (_) {}
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }

  var role = extractRole(payload);

  if (!hasAccess(role) && !tieneAccesoPorUsuarioGuardado()) {
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }


})();

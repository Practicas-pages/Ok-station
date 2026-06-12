/**
 * OK.station — Site Guard v2
 * ==============================================================
 * Archivo: /assets/js/site-guard.js
 *
 * Protección del lado cliente para el modo mantenimiento.
 * Se añade como <script> en el <head> de index.html y de
 * cualquier otra página HTML del proyecto.
 *
 * CÓMO FUNCIONA:
 * 1. Lee el flag MAINTENANCE_MODE.
 * 2. Si está en mantenimiento: verifica si hay JWT válido con
 *    rol de acceso (admin/empleado).
 * 3. Si no hay JWT válido → redirige a maintenance.html
 *    (que ya tiene el formulario de login).
 * 4. Si hay JWT válido con rol permitido → deja cargar la página.
 *
 * ES UNA SEGUNDA CAPA DE DEFENSA.
 * La primera (y más importante) es el vhost de Nginx.
 * Este guard evita que alguien que ya conoce una URL interna
 * la cargue directamente sin pasar por maintenance.html.
 *
 * INSERCIÓN EN index.html (en el <head>, antes de styles.css):
 *   <script src="/assets/js/site-guard.js"></script>
 * ==============================================================
 */
(function () {
  'use strict';

  /* ============================================================
     CONFIGURACIÓN — debe coincidir con maintenance.html
     ============================================================ */
  var GUARD = {
    /* true = modo mantenimiento activo | false = sitio público */
    MAINTENANCE_MODE: true,

    /* Clave del JWT en localStorage (igual que en maintenance.html) */
    JWT_KEY: 'okstation_token',
    JWT_KEY_ALT: 'access_token',

    /* Roles con acceso durante mantenimiento */
    ADMIN_ROLES: ['admin', 'administrator', 'superadmin', 'empleado', 'employee', 'staff'],

    /* URL de la pantalla de mantenimiento */
    MAINTENANCE_URL: '/maintenance.html',

    /* Rutas que NUNCA se redirigen (no incluir '/' aquí) */
    BYPASS_PATHS: ['/assets/', '/api/'],
  };

  /* Salir inmediatamente si no estamos en modo mantenimiento */
  if (!GUARD.MAINTENANCE_MODE) { return; }

  /* No aplicar en la propia pantalla de mantenimiento */
  var currentPath = window.location.pathname;
  if (currentPath === '/maintenance.html' || currentPath === '/maintenance') {
    return;
  }

  /* No aplicar en rutas de bypass */
  for (var i = 0; i < GUARD.BYPASS_PATHS.length; i++) {
    if (currentPath.indexOf(GUARD.BYPASS_PATHS[i]) === 0) { return; }
  }

  /* ── Guardar la URL a la que quería ir el usuario ── */
  try {
    sessionStorage.setItem('oks_intended_url', window.location.href);
  } catch (_) {}

  /* ── Leer token ── */
  function getToken() {
    try {
      return localStorage.getItem(GUARD.JWT_KEY)
          || localStorage.getItem(GUARD.JWT_KEY_ALT)
          || sessionStorage.getItem(GUARD.JWT_KEY)
          || null;
    } catch (_) { return null; }
  }

  /* ── Decodificar payload JWT ── */
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

  /* ── Extraer rol ── */
  function extractRole(payload) {
    if (!payload) { return null; }
    return payload.role
        || payload.rol
        || (payload.roles && payload.roles[0])
        || (payload.user && (payload.user.role || payload.user.rol))
        || (payload.data && (payload.data.role || payload.data.rol))
        || null;
  }

  /* ── Verificar expiración ── */
  function isExpired(payload) {
    if (!payload || !payload.exp) { return false; }
    return Math.floor(Date.now() / 1000) > payload.exp;
  }

  /* ── Verificar si el rol tiene acceso ── */
  function hasAccess(role) {
    if (!role) { return false; }
    var r = role.toLowerCase();
    return GUARD.ADMIN_ROLES.some(function (allowed) {
      return allowed === r;
    });
  }

  /* ── EVALUACIÓN PRINCIPAL ── */
  var token = getToken();

  if (!token) {
    /* Sin token: redirigir a mantenimiento */
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }

  var payload = decodePayload(token);

  if (!payload || isExpired(payload)) {
    /* Token inválido o expirado: limpiar y redirigir */
    try {
      localStorage.removeItem(GUARD.JWT_KEY);
      localStorage.removeItem(GUARD.JWT_KEY_ALT);
    } catch (_) {}
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }

  var role = extractRole(payload);

  if (!hasAccess(role)) {
    /* Rol sin acceso (cliente): redirigir a mantenimiento */
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }

  /* Rol con acceso: dejar cargar la página normalmente */
  /* El sitio cargará con normalidad */

})();

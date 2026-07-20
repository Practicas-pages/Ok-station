/**
 * Ok.station — Site Guard v2
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
    MAINTENANCE_MODE: false,

    /* Mantenimiento SOLO DE LA TIENDA (el resto del sitio sigue público:
       citas, impresión, fotos, trámites, cuenta…).
       true  = quien entre a la tienda ve maintenance.html
       false = tienda abierta
       Se intercepta la ENTRADA a las páginas y NO los botones: hay 9 variantes de
       enlace repartidas en 12 archivos (incluidos JS compartidos), y así queda
       cubierto también quien llegue por enlace directo, favorito o Google.
       Admin/empleado/directivo con sesión SIGUEN entrando (ver ADMIN_ROLES). */
    TIENDA_MANTENIMIENTO: true,

    /* Rutas que cuentan como "tienda" para TIENDA_MANTENIMIENTO.
       Cubre la tienda, la compra rápida y las fichas (/producto/49-slug). */
    TIENDA_PATHS: ['/tienda', '/tienda-dinamica', '/producto'],

    /* Claves del JWT en localStorage.
       JWT_KEY  = la que usa maintenance.html (gate de mantenimiento).
       JWT_KEY_APP = la que usa el login principal (auth.js → 'okstation.token').
       Reconocer ambas evita rebotar a un admin que ya inició sesión en la app. */
    JWT_KEY: 'okstation_token',
    JWT_KEY_APP: 'okstation.token',
    JWT_KEY_ALT: 'access_token',

    /* Roles con acceso durante mantenimiento.
       DEBE coincidir con ACCESS_ROLES de maintenance.html — si difieren,
       maintenance puede conceder acceso y el guard rebotar al usuario (bucle). */
    ADMIN_ROLES: ['admin', 'administrador', 'administrator', 'superadmin', 'empleado', 'employee', 'staff', 'directivo'],

    /* URL de la pantalla de mantenimiento */
    MAINTENANCE_URL: '/maintenance.html',

    /* Rutas que NUNCA se redirigen (no incluir '/' aquí).
       recuperar/restablecer quedan accesibles durante el mantenimiento:
       evitan que un admin que olvidó su contraseña quede bloqueado y
       permiten que los enlaces de restablecimiento por correo funcionen. */
    BYPASS_PATHS: ['/assets/', '/api/', '/recuperar.html', '/restablecer.html'],
  };

  var currentPath = window.location.pathname;

  /* ¿La URL actual es de la TIENDA? (tienda, compra rápida o ficha de producto).
     Se compara por prefijo para cubrir /tienda, /tienda.html, /tienda#store y
     /producto/49-slug por igual. */
  function esRutaDeTienda(path) {
    for (var t = 0; t < GUARD.TIENDA_PATHS.length; t++) {
      if (path.indexOf(GUARD.TIENDA_PATHS[t]) === 0) { return true; }
    }
    return false;
  }

  /* Decide si esta carga debe pasar por el gate:
       - MAINTENANCE_MODE     → todo el sitio
       - TIENDA_MANTENIMIENTO → solo las rutas de tienda
     Si ninguno aplica, el guard no hace nada (sitio público como siempre). */
  var gatear = GUARD.MAINTENANCE_MODE || (GUARD.TIENDA_MANTENIMIENTO && esRutaDeTienda(currentPath));
  if (!gatear) { return; }

  /* No aplicar en la propia pantalla de mantenimiento */
  if (currentPath === '/maintenance.html' || currentPath === '/maintenance') {
    return;
  }

  /* No aplicar en rutas de bypass */
  for (var i = 0; i < GUARD.BYPASS_PATHS.length; i++) {
    if (currentPath.indexOf(GUARD.BYPASS_PATHS[i]) === 0) { return; }
  }

  /* ── Guardar la URL a la que quería ir el usuario ── */
  try {
    sessionStorage.setItem('oks_intended', window.location.href);
  } catch (_) {}

  /* ── Leer token ── */
  function getToken() {
    try {
      return localStorage.getItem(GUARD.JWT_KEY)
          || localStorage.getItem(GUARD.JWT_KEY_APP)
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
    var r = String(role).toLowerCase();
    return GUARD.ADMIN_ROLES.some(function (allowed) {
      return allowed === r;
    });
  }

  /* ── Roles desde 'okstation.user' (respaldo del JWT) ──
     El JWT de este backend NO lleva el rol en su payload (solo sub/email/name),
     así que extractRole() devolvía null y el propio admin quedaba fuera. El login
     sí guarda el usuario con sus roles en localStorage —la misma fuente que usa
     session-nav.js—, así que se consulta de ahí.
     Es un gate de "aún no abrimos", no un control de acceso: lo que de verdad
     protege el admin es la autorización del servidor (authz.php). */
  function rolesDelUsuarioGuardado() {
    try {
      var u = JSON.parse(localStorage.getItem('okstation.user') || 'null');
      return (u && Array.isArray(u.roles)) ? u.roles : [];
    } catch (_) { return []; }
  }
  function tieneAccesoPorUsuarioGuardado() {
    return rolesDelUsuarioGuardado().some(hasAccess);
  }

  /* ── Acceso ya validado por maintenance.html ──
     maintenance.html escribe 'oks_site_access' cuando concede acceso
     (admin/empleado), usando el backend como fuente de verdad. Confiamos en
     ese veredicto y no re-evaluamos el token aquí: el formato del token o la
     ortografía del rol pueden diferir y provocar un bucle de redirección. */
  try {
    if (localStorage.getItem('oks_site_access') === '1') { return; }
  } catch (_) {}

  /* ── EVALUACIÓN PRINCIPAL (respaldo: token directo sin pasar por maintenance) ── */
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
      localStorage.removeItem(GUARD.JWT_KEY_APP);
      localStorage.removeItem(GUARD.JWT_KEY_ALT);
    } catch (_) {}
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }

  var role = extractRole(payload);

  /* El rol puede venir en el JWT o —en este backend, que no lo incluye— en el
     usuario guardado por el login. Basta con que UNA de las dos lo autorice. */
  if (!hasAccess(role) && !tieneAccesoPorUsuarioGuardado()) {
    /* Rol sin acceso (cliente): redirigir a mantenimiento */
    window.location.replace(GUARD.MAINTENANCE_URL);
    return;
  }

  /* Rol con acceso: dejar cargar la página normalmente */
  /* El sitio cargará con normalidad */

})();
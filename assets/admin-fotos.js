/* ─────────────────────────────────────────────────────────────────────────────
   OK.station — Ponerle foto a un producto desde el panel
   =============================================================================
   Acompaña a la vista de Catálogo (ZequiDev): esa DETECTA los productos sin foto,
   esto permite ponérsela. Archivo aparte a propósito, para no estorbarse con
   admin.js mientras varios trabajamos; se engancha solo por delegación en
   [data-foto], así que si esto no carga, el catálogo sigue funcionando igual.

   Está pensado para hacer 282 productos de corrido, así que todo se optimizó para
   que cada uno cueste UN clic:
     · Las candidatas se muestran como cuadrícula: clic en una y queda puesta.
     · Si no hay candidatas, se ofrece la búsqueda EN EL SITIO DE LA MARCA
       (abre en otra pestaña; no adivinamos, la persona ve y decide).
     · Y el camino que siempre funciona: pegar (Ctrl+V) o arrastrar la imagen.
       Copiar una imagen del navegador y pegarla aquí es un gesto, no un trámite.

   Por qué el humano elige y no lo hace una máquina: el riesgo de este paso nunca
   fue técnico, era publicar la foto EQUIVOCADA — la variante azul en el producto
   rojo. El cliente pide, recibe otra cosa y devuelve. Dos segundos de un ojo
   humano eliminan ese riesgo por completo.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var API = "/backend/api";
  /* MISMA llave que admin.js ("okstation.token"). Si se escribiera otra, el panel
     mandaría un Bearer vacío y todo respondería 401 sin explicar por qué. */
  function token() { try { return localStorage.getItem("okstation.token") || ""; } catch (e) { return ""; } }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }

  var modal = null, actual = null;   // actual = { id, nombre, marca }

  /* ── Buscadores oficiales por marca ────────────────────────────────────────
     NO se descarga nada de aquí: se ABRE la búsqueda en otra pestaña para que la
     persona vea las fotos en el sitio del fabricante y copie la que corresponde.
     Esa diferencia importa: bajar imágenes de un sitio automáticamente tiene
     implicaciones de derechos y de robots.txt; abrir una búsqueda no.
     Las marcas se agregan conforme se comprueba que su buscador sirve. */
  var BUSCADORES = {
    "3M":        "https://www.3m.com.mx/3M/es_MX/p/?Ntt=",
    "FELLOWES":  "https://www.fellowes.com/mx/es/search?q=",
    "ACCO":      "https://www.accobrands.com.mx/busqueda?q=",
    "PILOT":     "https://www.pilotpen.com.mx/buscar?q=",
    "XEROX":     "https://www.xerox.com/es-mx/search?text=",
    "SANFORD":   "https://www.sharpie.com/search?q=",
    "ZEBRA":     "https://www.zebrapen.com/?s="
  };

  function urlBusqueda(marca, termino) {
    var base = BUSCADORES[String(marca || "").toUpperCase().trim()];
    if (!base) return null;
    return base + encodeURIComponent(termino);
  }

  /* ── Armazón del diálogo ─────────────────────────────────────────────────── */
  function construir() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "fotos-ov";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML =
      '<div class="fotos-box">' +
        '<div class="fotos-head">' +
          '<div><b id="fotos-nombre"></b><span id="fotos-marca" class="fotos-marca"></span></div>' +
          '<button type="button" class="fotos-x" data-fotos-cerrar aria-label="Cerrar">✕</button>' +
        '</div>' +
        '<div class="fotos-body" id="fotos-body"></div>' +
        '<div class="fotos-foot">' +
          '<div class="fotos-drop" id="fotos-drop" tabindex="0">' +
            'Arrastra una imagen aquí, o haz clic y pega con <b>Ctrl+V</b>' +
            '<input type="file" id="fotos-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>' +
          '</div>' +
          '<div class="fotos-msg" id="fotos-msg" role="status"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.closest("[data-fotos-cerrar]")) return cerrar();
      var cand = e.target.closest("[data-cand]");
      if (cand) return usarUrl(cand.getAttribute("data-cand"));
    });
    /* La zona de pegado: abre el explorador al hacer clic y acepta arrastrar. */
    var drop = modal.querySelector("#fotos-drop");
    var file = modal.querySelector("#fotos-file");
    drop.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () { if (file.files[0]) subirArchivo(file.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("on"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("on"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) subirArchivo(f);
    });
    /* Pegar funciona con el diálogo abierto, sin tener que enfocar nada: es el
       gesto natural después de copiar una imagen del sitio del fabricante. */
    document.addEventListener("paste", function (e) {
      if (!modal || !modal.classList.contains("on")) return;
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image/") === 0) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); subirArchivo(f); return; }
        }
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && modal.classList.contains("on")) cerrar();
    });
    return modal;
  }

  function msg(texto, tipo) {
    var el = modal && modal.querySelector("#fotos-msg");
    if (!el) return;
    el.textContent = texto || "";
    el.className = "fotos-msg" + (tipo ? " is-" + tipo : "");
  }

  function cerrar() {
    if (!modal) return;
    modal.classList.remove("on");
    actual = null;
  }

  /* ── Abrir para un producto ──────────────────────────────────────────────── */
  function abrir(id, nombre, marca) {
    construir();
    actual = { id: id, nombre: nombre, marca: marca };
    modal.querySelector("#fotos-nombre").textContent = nombre;
    modal.querySelector("#fotos-marca").textContent = marca ? "· " + marca : "";
    modal.querySelector("#fotos-body").innerHTML = '<div class="fotos-cargando">Buscando fotos…</div>';
    modal.classList.add("on");
    msg("");

    fetch(API + "/admin/image-candidates.php?product_id=" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + token() }
    })
      .then(function (r) { return r.json(); })
      .then(pintarCandidatas)
      .catch(function () {
        modal.querySelector("#fotos-body").innerHTML =
          '<div class="fotos-cargando">No se pudieron buscar candidatas. Puedes pegar o subir la imagen abajo.</div>';
      });
  }

  function pintarCandidatas(j) {
    if (!actual) return;
    var body = modal.querySelector("#fotos-body");
    var cands = (j && j.candidatas) || [];
    var html = "";

    if (cands.length) {
      html += '<div class="fotos-grid">';
      cands.forEach(function (c) {
        /* Las que ya tiene el producto NO se ofrecen para "volver a ponerlas": se
           muestran para que se vea qué hay, marcando si están descargadas. */
        var yaEs = c.origen === "actual";
        var pie = yaEs ? (c.descargada ? "actual" : "actual · sin descargar") : c.fuente;
        /* Las que vienen del sitio de la marca se marcan aparte: NADIE comprobó
           que sean este producto exacto, y quien da el clic debe saberlo. */
        html += '<figure class="fotos-cand' + (yaEs ? " es-actual" : "") +
                  (c.origen === "marca" ? " es-marca" : "") + '"' +
                  (yaEs ? "" : ' data-cand="' + esc(c.url) + '" title="Usar esta foto"') + '>' +
                  '<img src="' + esc(c.url) + '" alt="" loading="lazy" ' +
                    'onerror="this.closest(\'figure\').remove()">' +
                  '<figcaption>' + esc(pie) + '</figcaption>' +
                '</figure>';
      });
      html += '</div>';
    }

    /* Si la marca tiene buscador, el servidor ya trajo sus fotos y vienen en
       `candidatas` con origen "marca": no hay que ir a ninguna parte, se da clic.
       El enlace al sitio queda solo como salida de emergencia por si ninguna de
       las que trajo es la correcta. */
    var marca = actual.marca || (j && j.producto && j.producto.brand) || "";
    var urlSitio = urlBusqueda(marca, (j && j.producto && j.producto.sku) || actual.nombre);
    if (urlSitio) {
      html += '<div class="fotos-marca-buscar">' +
              '¿Ninguna es la correcta? <a href="' + esc(urlSitio) + '" target="_blank" rel="noopener">' +
              'Abrir el sitio de ' + esc(marca) + '</a>' +
              '<div class="fotos-tip">Copia la imagen (clic derecho → Copiar imagen) y pégala aquí con Ctrl+V.</div></div>';
    }

    ((j && j.notas) || []).forEach(function (n) {
      html += '<div class="fotos-nota">' + esc(n) + '</div>';
    });

    if (!cands.length && !url1) html = '<div class="fotos-cargando">Sin candidatas automáticas.</div>' + html;
    body.innerHTML = html;
  }

  /* ── Guardar ─────────────────────────────────────────────────────────────── */
  function enviar(fd) {
    if (!actual) return;
    fd.append("product_id", actual.id);
    msg("Guardando…");
    fetch(API + "/admin/image-set.php", {
      method: "POST",
      headers: { Authorization: "Bearer " + token() },
      body: fd
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { msg((res.j && res.j.error) || "No se pudo guardar.", "mal"); return; }
        msg("✓ Foto guardada.", "bien");
        /* Se refresca la tabla para que el conteo y la miniatura queden al día sin
           tener que recargar la página entera. */
        if (typeof window.okAdminRecargarCatalogo === "function") window.okAdminRecargarCatalogo();
        setTimeout(cerrar, 700);
      })
      .catch(function () { msg("Falló la conexión.", "mal"); });
  }

  function usarUrl(url) { var fd = new FormData(); fd.append("url", url); enviar(fd); }
  function subirArchivo(file) {
    if (!/^image\//.test(file.type)) { msg("Eso no es una imagen.", "mal"); return; }
    var fd = new FormData(); fd.append("file", file, file.name || "foto.jpg"); enviar(fd);
  }

  /* ── Enganche ────────────────────────────────────────────────────────────── */
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-foto]");
    if (!b) return;
    e.preventDefault();
    abrir(b.getAttribute("data-foto"), b.getAttribute("data-foto-nombre") || "", b.getAttribute("data-foto-marca") || "");
  });

  window.OKfotos = { abrir: abrir };
})();

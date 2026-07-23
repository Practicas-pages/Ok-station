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
  /* Mismo criterio que admin.js: textContent NO escapa comillas y aquí casi todo
     va dentro de un atributo (data-cand="…", href="…"). Un nombre como
     «Arillo Fellowes 1" Plastico» rompía el atributo en la comilla. */
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var modal = null, actual = null;   // actual = { id, nombre, marca }

  /* ── Ayuda para encontrar la foto ──────────────────────────────────────────
     Se probaron los buscadores propios de las marcas (Fellowes, ACCO, 3M, Xerox)
     y ninguno sirve: unos redirigen a su portada, otros no resuelven y otros lo
     prohíben en su robots.txt. Enlazarlos era mandar al trabajador a un callejón.

     En su lugar, una búsqueda web normal con la marca y la clave. Aquí SÍ es
     apropiada, y la diferencia con automatizarla es toda: una máquina que elige
     sola de un buscador acaba publicando la variante equivocada; una persona ve
     el resultado, reconoce el producto y prefiere la página del fabricante. El
     buscador solo la lleva; quien decide es ella.
     Funciona con CUALQUIER marca, incluidas las que no tienen sitio (BACO,
     NEXTEP, MAPASA…), que es justo donde están la mayoría de los huecos. */
  /* Convierte el nombre telegráfico de Exel en algo que un buscador entienda.
     Los nombres vienen así: «Arillo Fellowes 1" Plastico C/10 Negro», «Broche Acco
     No.7 cms P1570 C/50 Broches». Buscarlos tal cual da malos resultados porque
     "C/10" y "C/50" son la PRESENTACIÓN (piezas por paquete), no el producto: dos
     artículos idénticos que solo difieren en cuántos trae la caja se ven iguales en
     foto, y ese dato solo confunde al buscador. Se quitan.
     También se evita repetir la marca cuando el nombre ya la trae — antes salía
     "FELLOWES Arillo Fellowes 1…", que empeora la búsqueda en vez de acotarla. */
  function fraseBusqueda(nombre, marca) {
    var s = String(nombre || "");
    s = s.replace(/\bC\s*\/\s*\d+\b/gi, " ");        // C/10, C/ 25 → presentación
    s = s.replace(/\bcon\s+\d+\s+(pz|pzas|piezas)\b/gi, " ");
    s = s.replace(/\b(pz|pzas|piezas|paq|paquete)\b\.?/gi, " ");
    s = s.replace(/\s+/g, " ").trim();

    /* Exel guarda la RAZÓN SOCIAL, no la marca comercial: "NEXTEP SOLUCIONES",
       "ACCO BRANDS MEXICO". Nadie busca así y esas palabras de más desvían el
       resultado. Importa especialmente con NEXTEP, que es la marca con más
       productos sin foto del catálogo. */
    var m = String(marca || "").trim()
      .replace(/\b(soluciones|brands|mexico|méxico|s\.?a\.?|de|c\.?v\.?|inc\.?|corp\.?|ltd\.?|sa|cv)\b/gi, " ")
      .replace(/\s+/g, " ").trim();

    /* Solo se antepone la marca si el nombre no la menciona ya: si no, salía
       "FELLOWES Arillo Fellowes 1…", que en un buscador estorba más que ayuda. */
    if (m && s.toUpperCase().indexOf(m.toUpperCase()) === -1) s = m + " " + s;
    return s.trim();
  }

  function urlBusqueda(texto) {
    var q = String(texto || "").trim();
    if (!q) return null;
    return "https://duckduckgo.com/?iax=images&ia=images&q=" + encodeURIComponent(q);
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

    /* El .catch de antes tapaba TRES fallas distintas bajo el mismo mensaje: que
       el servidor no respondiera, que devolviera algo que no es JSON (un error de
       PHP se imprime como texto), o que reventara al pintar. Sin distinguirlas no
       hay forma de arreglar nada — se ve "No se pudieron buscar candidatas" y a
       adivinar. Ahora cada una dice lo suyo y el detalle queda en la consola. */
    fetch(API + "/admin/image-candidates.php?product_id=" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + token() }
    })
      .then(function (r) {
        return r.text().then(function (txt) {
          if (!r.ok) {
            var m = "";
            try { m = (JSON.parse(txt) || {}).error || ""; } catch (e) {}
            throw new Error(m || ("El servidor respondió " + r.status + "."));
          }
          try { return JSON.parse(txt); }
          catch (e) {
            /* Respuesta que no es JSON: casi siempre un error de PHP impreso. Se
               enseña el principio, que es donde viene el mensaje útil. */
            console.error("[fotos] respuesta no-JSON:", txt.slice(0, 800));
            throw new Error("El servidor devolvió un error: " + txt.replace(/<[^>]*>/g, " ").trim().slice(0, 160));
          }
        });
      })
      .then(function (j) {
        try { pintarCandidatas(j); }
        catch (e) {
          console.error("[fotos] falló al pintar:", e);
          modal.querySelector("#fotos-body").innerHTML =
            '<div class="fotos-cargando">Se encontraron datos pero no se pudieron mostrar (' + esc(e.message) + ').<br>' +
            'Puedes pegar o subir la imagen abajo.</div>';
        }
      })
      .catch(function (e) {
        console.error("[fotos]", e);
        modal.querySelector("#fotos-body").innerHTML =
          '<div class="fotos-cargando">' + esc(e.message || "No se pudo consultar al servidor.") +
          '<br>Puedes pegar o subir la imagen abajo — esa vía no depende del buscador.</div>';
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
    var prod  = (j && j.producto) || {};
    var marca = actual.marca || prod.brand || "";
    var clave = prod.sku || prod.ref || "";
    var desc  = (prod.description || "").trim();

    /* El NOMBRE va primero porque es lo que de verdad describe la pieza. La clave
       queda de segunda: identifica el producto sin ambigüedad, pero muchas son
       referencias internas del proveedor que no están indexadas en ningún lado.
       La descripción, cuando existe, es la que mejor funciona con productos
       genéricos ("arillo", "broche") donde el nombre solo no basta — pero solo la
       tiene el 14% del catálogo, así que se ofrece únicamente si está. */
    var frase = fraseBusqueda(actual.nombre, marca);
    var enlaces = [];
    enlaces.push('<a href="' + esc(urlBusqueda(frase)) + '" target="_blank" rel="noopener">por nombre</a>');
    if (clave) {
      enlaces.push('<a href="' + esc(urlBusqueda(marca + " " + clave)) + '" target="_blank" rel="noopener">por clave</a>');
    }
    if (desc) {
      /* La descripción entera es demasiado larga para un buscador: se recorta a
         las primeras palabras, que es donde está el producto. */
      var frDesc = fraseBusqueda(desc.split(/\s+/).slice(0, 12).join(" "), marca);
      enlaces.push('<a href="' + esc(urlBusqueda(frDesc)) + '" target="_blank" rel="noopener">por descripción</a>');
    }

    html += '<div class="fotos-marca-buscar"><b>Buscar la foto:</b> ' + enlaces.join(" · ") +
            /* Se enseña la frase que se va a buscar: si sale rara, la persona lo ve
               antes de dar clic en vez de descubrirlo en la pestaña nueva. */
            '<div class="fotos-tip">Buscará: «' + esc(frase) + '»</div>' +
            '<div class="fotos-tip">Abre el resultado, prefiere la página del fabricante, ' +
            'copia la imagen (clic derecho → Copiar imagen) y pégala aquí con <b>Ctrl+V</b>.</div></div>';

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

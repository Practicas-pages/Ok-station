# Plan: conectar OKi (el astronauta) con la tienda (e-commerce)

**Para:** ZequiDev (tienda) y Oscar (OKi)
**Objetivo:** que OKi se sincronice con la tienda **sin que los dos editemos el mismo
archivo** — así no hay conflictos de git ni cosas que se rompan.

---

## La regla de oro para no chocar

- **ZequiDev es el dueño de `tienda.html`** (su maqueta y su código de tienda).
- **Oscar/OKi es dueño de `assets/oki.js` y `assets/oki.css`** (el astronauta).
- **Nadie edita el archivo del otro.** Nos comunicamos por un "contrato" (abajo).

Si respetamos esto, ZequiDev sigue construyendo su tienda y OKi se conecta solo,
sin pisarse y sin merges dolorosos.

---

## Qué debe agregar ZequiDev a su tienda (el "contrato")

En `tienda.html`, ZequiDev expone un objeto global que OKi va a leer. No cambia
su diseño; solo publica su estado y avisa cuando algo cambia.

```js
// Al final de su IIFE de la tienda, ZequiDev agrega:
window.OKtienda = {
  productos:  function(){ return P; },          // catálogo (para recomendar)
  carrito:    function(){ return cart; },        // {id:{p, qty}}
  deseados:   function(){ return wishlist; },    // NUEVO: lista de deseados
  agregar:    function(id){ addToCart(id,1); },  // acciones que OKi puede pedir
  quitar:     function(id){ removeItem(id); },
  toggleDeseado: function(id){ /* NUEVO */ },
  irAProducto:   function(id){ openProduct(id); } // vista previa (ya existe)
};

// Y AVISA cuando cambia algo, con eventos:
function avisar(tipo){ window.dispatchEvent(new CustomEvent('oktienda:'+tipo)); }
//  - en renderCart():         avisar('carrito');
//  - al cambiar deseados:     avisar('deseados');
//  - al abrir el carrito:     avisar('carrito-abierto');
//  - al cerrar el carrito:    avisar('carrito-cerrado');
//  - al entrar a la tienda:   avisar('en-tienda');
```

### Lo que le falta a la tienda y ZequiDev necesita agregar
1. **Deseados (wishlist):** un estado `wishlist`, un botón de corazón ❤ en cada
   producto (y en la vista previa), y `toggleDeseado(id)`.
2. **Cerrar bien el HTML:** a `tienda.html` le falta el `</body></html>` al final.
3. Publicar el objeto `window.OKtienda` + los eventos de arriba.

(La **vista previa de producto ya existe** en su tienda: `openProduct(id)`. 👍)

---

## Qué hace OKi (lo hace Oscar/Claude en oki.js, SIN tocar tienda.html)

Cuando OKi detecta que existe `window.OKtienda` (o sea, estamos en la tienda):
1. **Entra en "modo tienda":** el chat se **oculta** por defecto y se muestra solo
   si el cliente lo pide.
2. El panel de OKi **prioriza la lista**: primero el **carrito** (lo que va
   agregando), luego **recomendados**, luego **deseados** — escuchando los eventos
   `oktienda:carrito` / `oktienda:deseados`.
3. Se **hace a un lado** cuando se abre el carrito (`oktienda:carrito-abierto`) y
   cuando taparía un banner (como en el simulador).
4. Desde OKi se puede **agregar / quitar / marcar deseado / ver vista previa**
   llamando a `window.OKtienda.*`.

---

## Orden sugerido (para no chocar)

1. **Primero ZequiDev** deja su tienda con lo que le falta (deseados, cerrar HTML,
   publicar `window.OKtienda` + eventos) y lo sube a **`main`** por PR.
2. **Luego Oscar/OKi** conecta el astronauta leyendo ese contrato (solo en oki.js).
3. Los dos jalan de `main` y queda todo junto, sin conflictos.

Si prefieren, Oscar puede definir el contrato exacto y ZequiDev solo lo implementa.
Lo importante: **acordar el contrato antes, y no editar `tienda.html` los dos a la vez.**

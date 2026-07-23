# Logotipos de los medios de pago

La ficha de producto (`producto.php` → sección "Medios de pago") toma los
logotipos de esta carpeta.

| Archivo            | Se muestra como   | Estado                  |
|--------------------|-------------------|-------------------------|
| `visa.png`         | Visa              | **Oficial** (brandmark) |
| `mastercard.svg`   | Mastercard        | **Oficial** (SVG)       |
| `amex.jpg`         | American Express  | **Oficial** (web logo)  |
| `mercadopago.svg`  | Mercado Pago      | **Oficial** (SVG del kit de Mercado Pago) |

## Todos son OFICIALES (jul 2026)

Se reemplazaron los dibujos provisionales por el arte OFICIAL de cada marca (las
URLs las dio el dueño): Visa y Amex en imagen (PNG/JPG), Mastercard y Mercado
Pago en SVG. Se usó el formato que da cada marca; por eso son mixtos.

El recuadro blanco, el borde y las esquinas los pone el CSS (`.pdp__pay-item`),
así que el archivo va con fondo transparente donde el formato lo permite (PNG/SVG;
el JPG de Amex trae su propio fondo).

Para reemplazar uno: **sobrescribe el archivo**. Si cambia la extensión, ajusta
`$pagos` en `producto.php` (ahí el nombre ya lleva la extensión completa).

**Para cambiarlos solo hay que sobrescribir el archivo con el mismo nombre.** No
se toca código ni hay que avisarle a nadie.

## Si falta un archivo

La ficha no se rompe: si un `.svg` no existe, muestra una etiqueta de texto con
el nombre de la marca. Mide lo mismo de alto que la imagen, así que el bloque no
da un salto cuando lo subas.

## Medidas

Se pintan a 32px de alto y el ancho se ajusta solo; los de aquí quedan en unos
68-72px, que es lo que los deja parejos. El recuadro blanco, el borde y las
esquinas redondeadas los pone el CSS (`.pdp__pay-item` en
`assets/producto.css`), así que el archivo va con **fondo transparente** y solo
la marca.

Si usas PNG en vez de SVG, que sea de al menos 96px de alto (3x) para que no se
vea borroso, y cambia la extensión en `producto.php`.

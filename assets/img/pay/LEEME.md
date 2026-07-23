# Logotipos de los medios de pago

La ficha de producto (`producto.php` → sección "Medios de pago") toma los
logotipos de esta carpeta.

| Archivo            | Se muestra como   | Estado                  |
|--------------------|-------------------|-------------------------|
| `visa.svg`         | Visa              | Provisional (ver abajo) |
| `mastercard.svg`   | Mastercard        | Provisional (ver abajo) |
| `amex.svg`         | American Express  | Provisional (ver abajo) |
| `mercadopago.svg`  | Mercado Pago      | **Oficial** (SVG del kit de Mercado Pago) |

## Ojo: son provisionales, conviene cambiarlos

Los que están aquí se dibujaron a mano para que la sección no se viera vacía. Se
parecen y se entienden, pero **no son el arte oficial de cada marca**:

- **Mercado Pago YA es el oficial**: se reemplazó por el SVG del kit de vendedor
  (el logo del óvalo azul/cian + "Mercado Pago"). Fondo transparente, como pide
  la sección de "Medidas".
- Mastercard es el más fiel: son dos círculos y la geometría es exacta.
- Visa lleva su nombre en su color, pero en una tipografía común (Arial), no en
  la suya propia.
- American Express dice "AMEX" y no "AMERICAN EXPRESS": a 32px de alto el
  nombre completo sale ilegible.

Son marcas registradas, así que lo correcto es sustituirlos por el archivo
oficial de cada una. Se bajan de sus centros de marca (Visa Brand Center,
Mastercard Brand Center, American Express Brand Hub) y el de Mercado Pago viene
en su kit para vendedores.

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

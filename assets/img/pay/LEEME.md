# Logotipos de los medios de pago

La ficha de producto (`producto.php` → sección "Medios de pago") busca los
logotipos AQUÍ. Mientras un archivo no exista, la ficha muestra una etiqueta de
texto con el nombre — se ve bien igual, pero con el logotipo se ve mejor.

Archivos que espera (nombre EXACTO, en minúsculas):

| Archivo            | Se muestra como   |
|--------------------|-------------------|
| `visa.svg`         | Visa              |
| `mastercard.svg`   | Mastercard        |
| `amex.svg`         | American Express  |
| `mercadopago.svg`  | Mercado Pago      |

En cuanto los subas aparecen solos: no hay que tocar código.

## Por qué no vienen ya hechos

Son marcas registradas. Dibujarlas a mano da un resultado impreciso y no está
permitido: hay que usar el archivo oficial de cada marca. Los oficiales se bajan
de sus centros de marca (Visa Brand Center, Mastercard Brand Center, American
Express Brand Hub) y el de Mercado Pago viene en su kit para vendedores.

## Medidas

Se pintan a 32px de alto y el ancho se ajusta solo. Un SVG de cualquier tamaño
sirve; si usas PNG, que sea de al menos 96px de alto (3x) para que no se vea
borroso, y cambia la extensión en `producto.php`.

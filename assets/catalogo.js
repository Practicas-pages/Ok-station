/* ─────────────────────────────────────────────────────────────────────────
   Catálogo compartido de la tienda OK.station.
   Fuente única de productos. La usan:
     • tienda.html  → arma el catálogo y el carrito en vivo.
     • assets/oki.js → muestra "Tu lista de compras" en CUALQUIER página del sitio
                       (leyendo el carrito guardado en localStorage), aunque no
                       estés dentro del e-commerce.
   Al agregar/editar un producto, hazlo AQUÍ (un solo lugar).
   ───────────────────────────────────────────────────────────────────────── */
window.OK_PRODUCTS = [
  {id:1,cat:"consumibles",brand:"HP",sku:"CON-TON105",name:"Tóner HP 105A Negro",price:1290,old:1490,stock:8,emoji:"🖨",desc:"Cartucho de tóner original HP para impresoras LaserJet.",specs:["Rinde ~1,000 páginas","Original HP","LaserJet 107/135"]},
  {id:2,cat:"consumibles",brand:"Canon",sku:"CON-CAN145",name:"Cartucho Canon 145 Negro",price:389,stock:14,emoji:"🩸",desc:"Cartucho de tinta negra para Canon PIXMA.",specs:["Tinta negra","PIXMA MG/MX","~180 páginas"]},
  {id:3,cat:"consumibles",brand:"Bond",sku:"CON-BOND500",name:"Hojas Bond carta (500)",price:135,stock:40,emoji:"📄",desc:"Paquete de 500 hojas tamaño carta, 75 g.",specs:["500 hojas","75 g · carta","Blancura 95%"]},
  {id:4,cat:"consumibles",brand:"HP",sku:"CON-PFOTO",name:"Papel fotográfico Gloss",price:180,old:229,stock:6,emoji:"🖼",desc:"Papel brillante para fotografías.",specs:["20 hojas","Acabado brillante","180 g"]},
  {id:5,cat:"papeleria",brand:"Norma",sku:"PAP-CU100",name:"Cuaderno profesional",price:59,stock:33,emoji:"📓",desc:"100 hojas, raya, pasta dura.",specs:["100 hojas","Raya","Pasta dura"]},
  {id:6,cat:"papeleria",brand:"BIC",sku:"PAP-BIC12",name:"Bolígrafos BIC (caja 12)",price:75,stock:21,emoji:"🖊",desc:"12 bolígrafos punto medio.",specs:["12 piezas","Tinta azul","1.0 mm"]},
  {id:7,cat:"papeleria",brand:"Pendaflex",sku:"PAP-FOL25",name:"Folders carta (paq. 25)",price:89,stock:18,emoji:"🗂",desc:"Folders manila con pestaña.",specs:["25 piezas","Manila","Carta"]},
  {id:8,cat:"papeleria",brand:"Scotch",sku:"PAP-CINTA",name:"Cinta adhesiva",price:22,stock:52,emoji:"📏",desc:"Rollo 18 mm x 33 m.",specs:["18 mm × 33 m","Transparente"]},
  {id:9,cat:"accesorios",brand:"Kingston",sku:"ACC-USB64",name:"Memoria USB 64 GB",price:159,stock:12,emoji:"💾",desc:"USB 3.2 de alta velocidad.",specs:["64 GB","USB 3.2","120 MB/s"]},
  {id:10,cat:"accesorios",brand:"Logitech",sku:"ACC-MOU01",name:"Mouse inalámbrico",price:229,old:299,stock:9,emoji:"🖱",desc:"Mouse óptico con receptor USB.",specs:["2.4 GHz","1600 DPI","Pilas incluidas"]},
  {id:11,cat:"computo",brand:"Koblenz",sku:"COM-REG08",name:"Regulador 8 tomas",price:499,old:599,stock:4,emoji:"🔌",desc:"Con supresor de picos.",specs:["8 contactos","Supresor","Garantía 1 año"]},
  {id:12,cat:"computo",brand:"HP",sku:"COM-AUD05",name:"Audífonos con micrófono",price:349,stock:15,emoji:"🎧",desc:"Diadema con micrófono.",specs:["Con micrófono","Volumen","3.5 mm"]}
];

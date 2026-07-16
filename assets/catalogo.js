/* ─────────────────────────────────────────────────────────────────────────
   Catálogo compartido de la tienda OK.station — SOLO PAPELERÍA (decisión de
   negocio: la tienda vende papelería + impresión, nada de cómputo/accesorios).
   Es el RESPALDO del catálogo real (tabla `products` vía API); lo usan:
     • tienda.html  → arma el catálogo y el carrito si el API falla.
     • assets/oki.js → muestra "Tu lista de compras" en CUALQUIER página del sitio
                       (leyendo el carrito guardado en localStorage), aunque no
                       estés dentro del e-commerce.
   Al agregar/editar un producto de respaldo, hazlo AQUÍ (un solo lugar).
   Categorías: consumibles (Tinta y tóner) · papel (Papel y cuadernos) ·
               escritura (Escritura) · oficina (Oficina y escolar)
   ───────────────────────────────────────────────────────────────────────── */
window.OK_PRODUCTS = [
  {id:1,cat:"consumibles",brand:"HP",sku:"CON-TON105",name:"Tóner HP 105A Negro",price:1290,old:1490,stock:8,emoji:"🖨",desc:"Cartucho de tóner original HP para impresoras LaserJet.",specs:["Rinde ~1,000 páginas","Original HP","LaserJet 107/135"]},
  {id:2,cat:"consumibles",brand:"Canon",sku:"CON-CAN145",name:"Cartucho Canon 145 Negro",price:389,stock:14,emoji:"🩸",desc:"Cartucho de tinta negra para Canon PIXMA.",specs:["Tinta negra","PIXMA MG/MX","~180 páginas"]},
  {id:3,cat:"papel",brand:"Bond",sku:"PAP-BOND500",name:"Hojas Bond carta (500)",price:135,stock:40,emoji:"📄",desc:"Paquete de 500 hojas tamaño carta, 75 g.",specs:["500 hojas","75 g · carta","Blancura 95%"]},
  {id:4,cat:"papel",brand:"HP",sku:"PAP-PFOTO",name:"Papel fotográfico Gloss",price:180,old:229,stock:6,emoji:"🖼",desc:"Papel brillante para fotografías.",specs:["20 hojas","Acabado brillante","180 g"]},
  {id:5,cat:"papel",brand:"Norma",sku:"PAP-CU100",name:"Cuaderno profesional",price:59,stock:33,emoji:"📓",desc:"100 hojas, raya, pasta dura.",specs:["100 hojas","Raya","Pasta dura"]},
  {id:6,cat:"escritura",brand:"BIC",sku:"ESC-BIC12",name:"Bolígrafos BIC (caja 12)",price:75,stock:21,emoji:"🖊",desc:"12 bolígrafos punto medio.",specs:["12 piezas","Tinta azul","1.0 mm"]},
  {id:7,cat:"oficina",brand:"Pendaflex",sku:"OFI-FOL25",name:"Folders carta (paq. 25)",price:89,stock:18,emoji:"🗂",desc:"Folders manila con pestaña.",specs:["25 piezas","Manila","Carta"]},
  {id:8,cat:"oficina",brand:"Scotch",sku:"OFI-CINTA",name:"Cinta adhesiva",price:22,stock:52,emoji:"📏",desc:"Rollo 18 mm x 33 m.",specs:["18 mm × 33 m","Transparente"]},
  {id:9,cat:"escritura",brand:"Stabilo",sku:"ESC-MTX4",name:"Marcatextos pastel (4)",price:98,stock:24,emoji:"🖍",desc:"Cuatro marcatextos en tonos pastel.",specs:["4 piezas","Punta biselada","Tonos pastel"]},
  {id:10,cat:"escritura",brand:"Sharpie",sku:"ESC-SHP4",name:"Marcadores permanentes (4)",price:120,old:145,stock:15,emoji:"🖊",desc:"Marcadores permanentes punto fino.",specs:["4 piezas","Punto fino","Colores surtidos"]},
  {id:11,cat:"escritura",brand:"Mirado",sku:"ESC-LAP12",name:"Lápices No. 2 (caja 12)",price:48,stock:60,emoji:"✏️",desc:"Lápices de grafito No. 2 con goma.",specs:["12 piezas","No. 2 / HB","Con goma"]},
  {id:12,cat:"oficina",brand:"Rexel",sku:"OFI-ENG01",name:"Engrapadora media carga",price:210,stock:9,emoji:"📎",desc:"Engrapadora metálica para escritorio.",specs:["Media carga","20 hojas","Grapas estándar"]},
  {id:13,cat:"oficina",brand:"Post-it",sku:"OFI-NOTAS",name:"Notas adhesivas 3×3 (5 blocks)",price:85,stock:38,emoji:"🗒",desc:"Cinco blocks de notas adhesivas amarillas.",specs:["5 blocks","76 × 76 mm","100 hojas c/u"]},
  {id:14,cat:"oficina",brand:"Maped",sku:"OFI-TIJ5",name:"Tijeras escolares 5\"",price:35,stock:44,emoji:"✂️",desc:"Tijeras punta roma para escuela.",specs:["5 pulgadas","Punta roma","Acero inoxidable"]},
  {id:15,cat:"papel",brand:"Scribe",sku:"PAP-LIBFR",name:"Libreta francesa raya",price:42,stock:29,emoji:"📔",desc:"Libreta francesa de raya, 96 hojas.",specs:["96 hojas","Raya","Espiral"]},
  {id:16,cat:"consumibles",brand:"Epson",sku:"CON-EP664",name:"Tinta Epson 664 negra",price:259,old:299,stock:19,emoji:"🩸",desc:"Botella de tinta original EcoTank 70 ml.",specs:["70 ml","Original Epson","EcoTank L series"]},
  {id:17,cat:"oficina",brand:"Pritt",sku:"OFI-PEG22",name:"Pegamento en barra 22 g",price:39,stock:57,emoji:"🧴",desc:"Lápiz adhesivo lavable, no tóxico.",specs:["22 g","Lavable","No tóxico"]},
  {id:18,cat:"escritura",brand:"BIC",sku:"ESC-CORR",name:"Corrector en cinta",price:33,stock:36,emoji:"⬜",desc:"Cinta correctora de aplicación en seco.",specs:["5 mm × 8 m","Aplicación en seco"]}
];

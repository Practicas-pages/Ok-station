<?php
/**
 * Cerebro por REGLAS de OKi (sin API, sin costo).
 * ------------------------------------------------
 * Reconoce la intención del mensaje por palabras clave y responde con los
 * datos reales del negocio. Si no reconoce nada, devuelve null y el endpoint
 * deriva a WhatsApp (regla de oro: OKi no inventa).
 *
 * Para editar/añadir respuestas: toca solo el arreglo $INTENTS de abajo.
 * Cada intención:
 *   'need' => tokens que TODOS deben estar (opcional, para desambiguar)
 *   'kw'   => palabras/frases; el puntaje = cuántas aparecen
 *   'a'    => la respuesta de OKi (texto)
 * Gana la intención con más coincidencias. Las de saludo/gracias van al final
 * para que cualquier intención con datos les gane el empate.
 */

const OKI_WA_URL = 'https://wa.me/526647194117';
const OKI_WA_TXT = 'nuestro WhatsApp 664 719 4117 (' . OKI_WA_URL . ')';

function oki_norm(string $s): string
{
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = strtr($s, [
        'á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n',
        'à'=>'a','è'=>'e','ì'=>'i','ò'=>'o','ù'=>'u'
    ]);
    return preg_replace('/\s+/', ' ', $s);
}

function oki_intents(): array
{
    return [
        // ── Servicios de impresión ──
        ['kw'=>['copia','copias','fotostatica','fotocopia','imprimir documento','impresion de documento','sacar copias'],
         'a'=>"Copias e impresión de documentos 🖨️\nCarta B/N: \$2 (1–10), \$1.50 (11–60), \$1.30 (61+).\nCarta a color: \$12 / \$9 / \$5 según cantidad.\nOficio B/N desde \$1.50 · a color desde \$10. Doble carta B/N \$5, color \$20.\nSúbelo en la sección \"Imprime tus fotos\" de la página y ves el precio al instante. La mayoría se entrega el mismo día."],

        ['need'=>['foto'],
         'kw'=>['pasaporte','visa','infantil','credencial','ovalada','ovalo','titulo','diploma','tramite'],
         'a'=>"Fotos para trámite 📸 (paquetes; \"urgente\" el mismo día, \"regular\" al día siguiente):\n• 6 infantil: \$85 urgente / \$55 regular\n• 6 pasaporte o credencial: \$85 / \$65\n• 4 pasaporte americano o visa: \$85 / \$65\n• 4 título \$150 · 4 diploma \$120 · 6 credencial óvalo \$120\nNo necesitas cita, llegas directo; también tomamos fotos a bebés y niños. La foto de visa es 5×5 cm con fondo blanco."],

        ['need'=>['foto'],
         'kw'=>['imprimir','impresion','tamano','ampliacion','gran formato','revelar','revelado','papel'],
         'a'=>"Impresión de fotografías 🖼️\n6×4\" \$10 · 5×7\" \$30 · 8.5×11\" \$75 · 11×17\" \$120.\nGran formato 24×36\": \$380 en foto / \$190 en bond.\nAcabado mate o brillante. Súbelas en la sección \"Imprime tus fotos\" de la página; la mayoría el mismo día."],

        ['kw'=>['enmicar','enmicado','engargolar','engargolado','arillo','mica'],
         'a'=>"Enmicado y engargolado 📚\nEnmicado: credencial \$12 · tarjeta \$15 · carta \$20 · doble carta \$30.\nEngargolado: chico \$38 · mediano \$45 · grande \$60.\nTesis y reportes se cotizan según el grosor. Podemos imprimir y dejártelo listo en el mismo lugar."],

        ['kw'=>['escanear','escaneo','digitalizar','digitalizacion'],
         'a'=>"Escaneo y digitalización 🗂️\n\$2 por hoja. Te lo entregamos en PDF o JPG por correo o en USB (PDF para varias páginas, JPG para imágenes sueltas), en alta resolución."],

        ['kw'=>['pvc','tarjeta pvc','gafete','credencial de pvc','membresia','tarjeta de presentacion'],
         'a'=>"Impresión en tarjetas PVC 🪪\n\$40 por tarjeta (tamaño tarjeta de crédito), a una o doble cara.\nCredenciales, gafetes, tarjetas de presentación y membresías; pueden llevar foto, logo, folio y código QR o de barras."],

        ['kw'=>['plano','planos','gran formato','poster','póster','plotter','lamina','arquitectonico','lona','lonas','banner','pendon'],
         'a'=>"Gran formato y planos 📐\nGran formato 24×36\": \$380 en foto / \$190 en bond.\nImprimimos planos a escala desde PDF, DWG o imagen, hasta 24\" de ancho con el largo que necesites. Otras medidas se cotizan."],

        ['kw'=>['recorte','guillotina','cortar','corte'],
         'a'=>"Recorte en guillotina ✂️\n\$2 por hoja, corte recto y preciso. Cortamos hojas, tarjetas, volantes, separadores y folletos, desde unas cuantas hasta alto volumen por millar."],

        ['kw'=>['papeleria','toner','tóner','cartucho','oficina','mayoreo','pluma','cuaderno','libreta'],
         'a'=>"Papelería ✏️\nSí manejamos papelería: tinta y tóner, papel, carpetas y archivo, adhesivos, engrapado, calculadoras y más, con precios en línea. Míralo en la tienda (o dime \"llévame a la tienda\" y te llevo 🚀). Para pedidos por mayoreo, escríbenos por ".OKI_WA_TXT."."],

        // ── Trámites / citas ──
        ['need'=>['pasaporte'],
         'kw'=>['pasaporte','tramite','requisito','americano','renovar','sre'],
         'a'=>"Pasaporte 🛂 (gestión de la cita):\n• Pasaporte mexicano: \$200 por persona\n• Pasaporte americano: \$400 por persona\n(El costo oficial del documento lo cobra la SRE aparte.)\nRequisitos del mexicano (primera vez): CURP, acta de nacimiento, comprobante de domicilio, teléfono, INE y un contacto de emergencia. En renovación, el pasaporte anterior en vez del acta.\nAgenda en la sección de Citas de la página (necesitas cuenta). ¿Te ayudo con algo más?"],

        ['kw'=>['visa','visa americana','ds160','ds-160','consulado'],
         'a'=>"Visa americana 🇺🇸\nGestión de la cita: \$800 por persona (se paga por adelantado para confirmar).\nRequisitos base: pasaporte, INE, visa anterior si renuevas, tu situación laboral, países visitados en los últimos 5 años y datos familiares.\nAgenda en la sección de Citas (necesitas cuenta)."],

        ['kw'=>['sentri','global entry','globalentry'],
         'a'=>"SENTRI / Global Entry 🚗\nGestión de la cita: \$900 por persona.\nRequisitos: pasaporte o acta, documento para entrar a EUA, historial laboral y de vivienda de 5 años, y RFC (solo para Global Entry)."],

        ['kw'=>['i94','i-94','permiso de viaje'],
         'a'=>"I-94 / permiso de viaje 🧾\nGestión de la cita: \$200 por persona.\nRequisitos: pasaporte o identificación, visa o documento de viaje, e información de tu ingreso a EUA."],

        ['need'=>['acta'],
         'kw'=>['acta','nacimiento'],
         'a'=>"Acta de nacimiento 📄\n¿De qué estado necesitas el acta? Dime el estado (por ejemplo Sonora) y te doy el precio exacto — van de \$265 (Quintana Roo) a \$400 (Yucatán).\nRequisitos: CURP y el nombre completo de los padres."],

        ['need'=>['curp'],
         'kw'=>['curp'],
         'a'=>"CURP 🆔\nCuesta \$35. Solo necesitas tu acta de nacimiento y una identificación oficial. También podemos ayudarte a descargarla e imprimirla."],

        ['kw'=>['ine','credencial de elector','credencial para votar'],
         'a'=>"INE / credencial 🪪\nGestión de la cita INE: \$80.\nRequisitos: acta de nacimiento, CURP, comprobante de domicilio e identificación vigente."],

        ['kw'=>['licencia','licencia de conducir','manejar'],
         'a'=>"Licencia de conducir 🚘\nGestión: \$40. Traes el PDF de tu licencia (lo imprimimos en PVC) y una identificación oficial (opcional)."],

        ['kw'=>['rfc','constancia fiscal','situacion fiscal','imss','semanas cotizadas','nss','seguro social','certificado escolar','documento oficial'],
         'a'=>"Documentos oficiales (te ayudamos a descargarlos e imprimirlos) 🗎\nCURP \$35 · RFC / constancia fiscal \$200 · Semanas cotizadas IMSS \$50 · NSS \$50 · Certificados escolares \$50 · Cita INE \$80.\nTrae el documento ya descargado (USB, correo o WhatsApp) o los datos que pida el portal."],

        ['kw'=>['cita','agendar','agendo','tramite','tramites','como agendo'],
         'a'=>"Con gusto te ayudo a agendar 🗓️\nGestionamos citas de pasaporte (mexicano y americano), visa, SENTRI, I-94, CURP, acta, INE y licencia. Las citas son de lunes a viernes.\nEntra a la sección de Citas de la página, elige el trámite (ahí ves los requisitos sin cuenta) y para agendar necesitas una cuenta. ¿De qué trámite quieres?"],

        // ── Pago de servicios / recargas (antes de "Pagos" para ganar el empate en consultas de servicios) ──
        ['kw'=>['recarga','recargas','pago de servicios','luz','agua','cfe','telmex','internet','recibo','gas','izzi','megacable','totalplay','telnor','cespt','agua tijuana','caseta','iave','pase','infonavit','tesoreria','catalogo','avon','betterware','tiempo aire','pagar servicio'],
         'a'=>"Recargas y pago de servicios ⚡\nPagamos por ti más de 70 servicios, en tienda o por ".OKI_WA_TXT." (no hay opción en línea):\n• Agua (CESPT/Agua Tijuana y más), luz (CFE), gas\n• Teléfono, internet y TV (Telmex, izzi, AT&T, Megacable, Totalplay, Sky…)\n• Gobierno y tesorerías, Infonavit\n• Casetas (IAVE/PASE)\n• Ventas por catálogo (Avon, Betterware, Natura…)\nY recargas de tiempo aire para todas las compañías."],

        // ── Pagos / factura ──
        ['kw'=>['pago','pagar','tarjeta','efectivo','transferencia','mercado pago','mercadopago','meses sin intereses','msi','forma de pago','metodo de pago','american express','amex','mastercard','tarjeta de credito','tarjeta de debito','oxxo','spei'],
         'a'=>"Formas de pago 💳\nEn línea con Mercado Pago (tarjeta), o en tienda con efectivo o transferencia. El pago es de contado (no manejamos meses sin intereses).\nPara pagar en línea el mínimo es \$5. Los pedidos se pagan al 100% al confirmar, y las citas de visa y pasaporte también por adelantado."],

        ['kw'=>['factura','facturar','cfdi','factura electronica'],
         'a'=>"Facturación 🧾\nLa gestionamos por ".OKI_WA_TXT.". Escríbenos por ahí y te ayudamos con tu factura."],

        // ── Tiempos y entrega ──
        ['kw'=>['tardan','tarda','cuanto tardan','cuanto tarda','para cuando','cuando estara','cuando esta listo','cuanto tiempo','tiempo de entrega','demora','demoran','cuando lo recojo'],
         'a'=>"Tiempos de entrega ⏱️\nLa mayoría de los trabajos se entregan el mismo día. Los volúmenes grandes o trabajos especiales llevan un tiempo estimado que te decimos al cotizar. Las fotos de trámite \"urgente\" son el mismo día y las \"regular\" al día siguiente."],

        ['kw'=>['envio','envios','domicilio','a domicilio','entregan a domicilio','mandan a','llega a mi casa','paqueteria'],
         'a'=>"Entrega 🚚\nEn la tienda en línea puedes elegir: recoger GRATIS en la sucursal (Centro Comercial Otay, Local G-03) o envío a domicilio. El costo del envío se calcula según tu código postal, y te avisamos por WhatsApp cuando esté listo.\nLos trabajos de impresión se recogen en la sucursal; si necesitas un envío especial, pregúntanos por ".OKI_WA_TXT."."],

        // ── Tienda en línea (e-commerce) ──
        ['kw'=>['tienda','tienda en linea','comprar en linea','comprar','e-commerce','ecommerce','carrito','carrito de compras','agregar al carrito','anadir al carrito','productos','catalogo de productos','venden','a la venta','ofertas','deseados','lista de deseos','favoritos'],
         'a'=>"Tienda en línea 🛒\nVendemos SOLO papelería: tinta y tóner, papel, carpetas y archivo, adhesivos y cintas, engrapado y perforado, calculadoras, etiquetas y más. Armas tu carrito, guardas favoritos con el ❤ y pagas seguro con Mercado Pago (tarjeta, OXXO o SPEI).\nRecoge GRATIS en la tienda OK.station (Centro Comercial Otay, Local G-03) o pide envío a domicilio (costo según tu C.P.); te avisamos por WhatsApp cuando esté listo.\nSi quieres, dime \"llévame a la tienda\" y te llevo. 🚀"],

        // ── Cómo usar el sitio ──
        ['kw'=>['subir archivo','imprimir en linea','hacer un pedido','como imprimo','mandar archivo','pedido de impresion','imprimir','impresion','archivo','pdf'],
         'a'=>"Para imprimir en línea 🖨️\nEntra a la sección \"Imprime tus fotos\" de la página: subes tu PDF o imágenes, ves el precio estimado al instante y envías tu pedido (necesitas una cuenta). ¡Todo desde la página, sin salir de aquí!"],

        ['kw'=>['cuenta','registrarme','registro','iniciar sesion','crear cuenta','contrasena','password','necesito cuenta','sin cuenta','hay que registrarse'],
         'a'=>"Tu cuenta 👤\nSin cuenta puedes cotizar, subir archivos y ver los requisitos de cualquier trámite. Para ENVIAR un pedido o AGENDAR y pagar una cita sí necesitas cuenta.\nCréala o inicia sesión en la página de Cuenta (pide nombre, correo, teléfono y contraseña)."],

        // ── Reseñas y redes ──
        ['kw'=>['reseña','reseñas','resena','resenas','opiniones','opinion','opinan','calificacion','comentarios','que dicen','que tal son','reviews','recomendaciones'],
         'a'=>"Reseñas ⭐\nTenemos reseñas verificadas de clientes en Google; puedes verlas en la sección \"Reseñas\" de la página. ¡Nos encanta que nos cuentes cómo te fue!"],

        ['kw'=>['facebook','instagram','redes','redes sociales','siguenos','fb','ig'],
         'a'=>"Síguenos en redes 📱\nFacebook: facebook.com/okdock.station\nInstagram: instagram.com/okdock.station"],

        // ── Info del negocio ──
        ['kw'=>['horario','hora','abren','abierto','cierran','cierra','abre','que dias','dias','sabado','domingo'],
         'a'=>"Horario 🕘\nLunes a viernes de 8:00 a 18:00. Sábados de 9:00 a 16:00. Domingo cerrado.\nLas citas de trámites se agendan de lunes a viernes."],

        ['kw'=>['donde','ubicacion','direccion','como llego','como llegar','mapa','estan','ubicados','local'],
         'a'=>"Nos encuentras en 📍 Centro Comercial Otay, Local G-03, Carretera Aeropuerto 1900, Col. Nueva Tijuana, C.P. 22425, Tijuana, B.C.\nEn la sección \"Visítanos\" de la página está el mapa para llegar."],

        ['kw'=>['telefono','numero','contacto','whatsapp','llamar','hablar','comunicar','wasap','wsp'],
         'a'=>"Contáctanos 📞\nLlamadas: 664 104 4896.\nWhatsApp: 664 719 4117 (".OKI_WA_URL.").\nCorreo: station@okdock.mx."],

        ['kw'=>['quienes son','quienes somos','que es okstation','que hacen','a que se dedican','sobre ustedes','mision','valores','historia'],
         'a'=>"Somos Ok.station 🚀 (una marca de OK Dock), en el Centro Comercial Otay, Tijuana. Reunimos en un solo lugar copias, impresiones, fotografías, gran formato, PVC, enmicado, engargolado y la gestión de tus trámites y documentos. Nos mueve resolverte rápido, bien y con trato cercano. \"Tú lo imaginas, nosotros lo hacemos.\""],

        // ── Saludo / cortesía (al final: cualquier dato les gana el empate) ──
        ['kw'=>['gracias','muchas gracias','thank','excelente','perfecto'],
         'a'=>"¡Con gusto! 🚀 Aquí estoy si necesitas algo más — precios, citas, trámites o impresiones."],

        ['kw'=>['hola','buenas','buenos dias','buenas tardes','buenas noches','hey','que tal','holi','saludos','ola','ayuda','ayudame','me ayudas','informacion','info','pregunta'],
         'a'=>"¡Hola! 👋 Soy OKi 🚀 Te ayudo con impresiones, fotos, citas, trámites, precios, horarios y ubicación. ¿Qué necesitas?"],
    ];
}

/** Precio del acta certificada por estado (MXN, IVA incl.). Igual que las tarjetas del sitio.
    Orden: nombres más específicos primero (para que "baja california sur" gane a "baja california"). */
function oki_acta_precios(): array
{
    return [
        'baja california sur'=>['Baja California Sur',345], 'baja california'=>['Baja California',345],
        'quintana roo'=>['Quintana Roo',265], 'san luis potosi'=>['San Luis Potosí',320],
        'nuevo leon'=>['Nuevo León',275], 'ciudad de mexico'=>['Ciudad de México',300], 'cdmx'=>['Ciudad de México',300],
        'estado de mexico'=>['Estado de México',275], 'edomex'=>['Estado de México',275],
        'aguascalientes'=>['Aguascalientes',335], 'campeche'=>['Campeche',275], 'chiapas'=>['Chiapas',345],
        'chihuahua'=>['Chihuahua',325], 'coahuila'=>['Coahuila',370], 'colima'=>['Colima',305],
        'durango'=>['Durango',345], 'guanajuato'=>['Guanajuato',305], 'guerrero'=>['Guerrero',335],
        'hidalgo'=>['Hidalgo',335], 'jalisco'=>['Jalisco',305], 'michoacan'=>['Michoacán',355],
        'morelos'=>['Morelos',310], 'nayarit'=>['Nayarit',285], 'oaxaca'=>['Oaxaca',325],
        'puebla'=>['Puebla',340], 'queretaro'=>['Querétaro',335], 'sinaloa'=>['Sinaloa',320],
        'sonora'=>['Sonora',320], 'tabasco'=>['Tabasco',310], 'tamaulipas'=>['Tamaulipas',310],
        'tlaxcala'=>['Tlaxcala',355], 'veracruz'=>['Veracruz',385], 'yucatan'=>['Yucatán',400],
        'zacatecas'=>['Zacatecas',365],
    ];
}

/** Flujo interactivo del acta por estado. $t y $prev ya vienen normalizados. Devuelve respuesta o null. */
function oki_acta_estado(string $t, string $prev): ?string
{
    // ¿Contexto de acta? El mensaje lo menciona, o OKi acaba de preguntar por el estado.
    $ctx = mb_strpos($t,'acta') !== false
        || mb_strpos($prev,'acta') !== false
        || mb_strpos($prev,'de que estado') !== false;
    if (!$ctx) return null;

    // "México" a secas es ambiguo (Ciudad vs Estado): pedir que aclare.
    $mexEspecifico = mb_strpos($t,'ciudad de mexico')!==false || mb_strpos($t,'cdmx')!==false
        || mb_strpos($t,'estado de mexico')!==false || mb_strpos($t,'edomex')!==false;
    if (!$mexEspecifico && preg_match('/\bmexico\b/', $t)) {
        return "¿La necesitas de Ciudad de México (\$300) o del Estado de México (\$275)? Dime cuál 🙂";
    }

    foreach (oki_acta_precios() as $key => [$nom, $precio]) {
        if (mb_strpos($t, $key) !== false) {
            return "Acta de nacimiento de {$nom} 📄\nCuesta \${$precio}. Requisitos: CURP y el nombre completo de los padres. Te la descargamos e imprimimos, lista para tu trámite.";
        }
    }
    return null;
}

/** ¿El mensaje pide NAVEGAR (ir/mostrar/llévame)? (no una pregunta). $t ya normalizado. */
function oki_nav_intent(string $t): bool
{
    // 1) Verbos/frases EXPLÍCITOS de navegación: siempre cuentan (aunque haya "cuánto/precio").
    if (preg_match('/\b(llevame|llevanos|llevar|llevas|vamonos|vayamos|mandame|dirigeme|redirigeme|abreme|muestrame|ensename|pasame|comparteme|regresame|regresa|regresar|vuelve|volver|volvamos|sacame|donde)\b/', $t)) return true;
    foreach (['vamos a', 'ir a', 'voy a ir', 've a', 'vete a', 'entra a', 'entrar a', 'como llego', 'como llegar',
              'como entro', 'como accedo', 'como hago', 'como puedo hacer', 'como hacer un', 'que servicios', 'dame el link',
              'dame la liga', 'la liga de', 'el link de', 'el enlace de', 'pasame el link', 'pasame la liga',
              'ando buscando', 'estoy buscando'] as $p) {
        if (mb_strpos($t, $p) !== false) return true;
    }
    // 2) Si es claramente una PREGUNTA de precio/horario, NO se navega (lo contesta el cerebro).
    if (preg_match('/\b(cuanto|cuanta|cuantos|precio|precios|cuesta|cuestan|vale|valen|sale|cobran|costo|costos|tarifa|tarifas|a como|a cuanto|que tan caro|que tan barato|cuanto tardan|para cuando|a que hora|que horario|que dias|abren|cierran)\b/', $t)) return false;
    // 3) Intención SUAVE: "quiero/necesito/busco/ocupo… algo". La compuerta de destino evita falsos positivos.
    if (preg_match('/\b(quiero|quisiera|necesito|deseo|busco|ando buscando|ocupo|me gustaria|voy a|puedo)\b/', $t)) return true;
    // 4) "ver/conocer" + artículo/posesivo ("ver la tienda", "ver mis pedidos").
    if (preg_match('/\b(ver|conocer|muestra)\b/', $t) && preg_match('/\b(la|el|los|las|mi|mis|tu|su)\b/', $t)) return true;
    return false;
}

/** Destinos a los que OKi puede llevar, del MÁS específico al más general (gana el primero que coincide). */
function oki_nav_destinos(): array
{
    return [
        ['go'=>'/requisitos-pasaporte-tijuana.html', 'reply'=>"Te llevo a los requisitos del pasaporte 📋",
         'kw'=>['requisito','requisitos','requisitos pasaporte','requisitos del pasaporte','requisitos para el pasaporte','requisitos para pasaporte','que necesito para el pasaporte','que necesito para sacar el pasaporte','que piden para el pasaporte','que se necesita para el pasaporte','documentos para pasaporte','documentos para el pasaporte','papeles para pasaporte','papeles para el pasaporte','que llevar para el pasaporte']],
        ['go'=>'/fotos-para-pasaporte-tijuana.html', 'reply'=>"Te llevo a las fotos para trámite 📸",
         'kw'=>['foto de tramite','fotos de tramite','foto para tramite','fotos para tramite','foto para pasaporte','fotos para pasaporte','foto de pasaporte','fotos de pasaporte','foto tamano pasaporte','foto para la visa','foto para visa','fotos para visa','foto de visa','foto americana','foto para visa americana','foto para mi visa','foto para mi visa americana','foto para mi pasaporte','foto para mi credencial','fotos para bebe','foto infantil','fotos infantiles','tamano infantil','foto tamano infantil','foto para credencial','foto para la credencial','foto para titulo','foto para el titulo','foto para diploma','foto ovalada','foto ovalo','foto tamano ovalo','fondo blanco','foto fondo blanco','foto con fondo blanco','foto para documentos','foto para documento','foto para green card','foto para la green card','foto para mica','foto tipo pasaporte','foto para bebe','foto de bebe','fotos de pasaporte para bebe']],
        ['go'=>'/impresion-de-fotografias-tijuana.html', 'reply'=>"Te llevo a impresión de fotografías 🖼️",
         'kw'=>['imprimir foto','imprimir fotos','imprimir mis fotos','impresion de fotos','impresion de fotografias','impresion fotografica','revelar','revelado','revelar fotos','revelar mis fotos','revelado de fotos','ampliacion','ampliaciones','ampliar foto','ampliar una foto','ampliar imagen','imprimir imagen','imprimir imagenes','fotos del celular','fotos de mi celular','imprimir fotos del cel','papel fotografico','foto brillante','foto mate','foto en papel','10x15','13x18','15x10','retrato','imprimir selfie','imprimir un retrato','poster de foto','foto grande','cuadro de foto']],
        ['go'=>'/impresion-tarjetas-pvc-tijuana.html', 'reply'=>"Te llevo a impresión en tarjetas PVC 🪪",
         'kw'=>['pvc','tarjeta pvc','tarjetas pvc','tarjeta de pvc','tarjetas de pvc','impresion en pvc','imprimir en pvc','tarjeta plastica','tarjeta rigida','credencial pvc','credencial de pvc','hacer credencial','hacer una credencial','mandar hacer credencial','imprimir credencial','credencial escolar','credencial de empleado','credencial de trabajo','gafete','gafetes','hacer gafete','membresia','membresias','tarjeta de membresia','carnet','carnet pvc','tarjeta de presentacion','tarjetas de presentacion','tarjeta con qr','tarjeta con codigo qr']],
        ['go'=>'/impresion-gran-formato-planos-tijuana.html', 'reply'=>"Te llevo a gran formato y planos 📐",
         'kw'=>['gran formato','formato grande','impresion en grande','impresion grande','plotter','plotear','ploteo','plano','planos','plano arquitectonico','planos arquitectonicos','imprimir plano','imprimir planos','imprimir un plano','poster','posters','imprimir poster','lona','lonas','imprimir lona','hacer una lona','banner','banners','pancarta','pancartas','pendon','pendones','manta','mantas','vinil','vinilo','viniles','rotulo','rotulos','rotulacion','roll up','rollup','espectacular','imprimir a escala']],
        ['go'=>'/enmicado-y-engargolado-tijuana.html', 'reply'=>"Te llevo a enmicado y engargolado 📚",
         'kw'=>['enmicado','enmicar','enmicar mi titulo','enmicar titulo','enmicar documento','mica','micas','poner mica','plastificar','laminar','laminado','laminacion','engargolar','engargolo','engargolado','engargolados','engargolar tesis','engargolado de tesis','engargolar mi tesis','engargolo mi tesis','arillo','arillos','arillado','espiral','encuadernar','encuadernacion','empastar','empastado','pasta dura','encuadernar tesis','engargolar documento']],
        ['go'=>'/escaneado-y-digitalizacion-tijuana.html', 'reply'=>"Te llevo a escaneo y digitalización 🗂️",
         'kw'=>['escaneo','escanear','escanear documento','escanear documentos','escaner','escanner','scanner','scan','scanear','digitalizar','digitalizacion','digitalizar documentos','pasar a pdf','pasar a digital','pasar a la compu','convertir a pdf','pasar de papel a pdf','escanear a pdf','escaneo a pdf','escaneo a jpg','escanear ine','escanear identificacion','escanear acta','escanear fotos','escanear a color']],
        ['go'=>'/recorte-guillotina-tijuana.html', 'reply'=>"Te llevo a recorte en guillotina ✂️",
         'kw'=>['guillotina','en guillotina','corte en guillotina','cortar hojas','cortar papel','corte de papel','recorte','recortar','recorte de papel','servicio de corte','corte a la medida','corte recto','refilar','refilado','emparejar hojas','cortar tarjetas','cortar volantes','cortar folletos','cortar en tiras']],
        ['go'=>'/copias-e-impresiones-tijuana.html', 'reply'=>"Te llevo a copias e impresiones 🖨️",
         'kw'=>['copia','copias','sacar copias','sacar una copia','hacer copias','fotocopia','fotocopias','fotocopiar','fotostatica','fotostaticas','copias fotostaticas','xerox','juego de copias','copias a color','copias en blanco y negro','copias b n','copia certificada','copiado','copias oficio','copias carta']],
        ['go'=>'/tramites-y-documentos-oficiales-tijuana.html', 'reply'=>"Te llevo a trámites y documentos oficiales 🗎",
         'kw'=>['curp','sacar curp','sacar mi curp','imprimir curp','imprimir mi curp','descargar curp','tramitar curp','rfc','sacar rfc','mi rfc','constancia fiscal','constancia de situacion fiscal','situacion fiscal','cedula fiscal','imss','semanas cotizadas','vigencia de derechos','constancia del imss','nss','numero de seguro social','seguro social','certificado','certificados','certificado de bachillerato','certificado de secundaria','certificado de primaria','certificado de preparatoria','antecedentes no penales','carta de no antecedentes','carta de antecedentes','documento oficial','documentos oficiales','acta','acta de nacimiento','imprimir mi acta','imprimir acta','imprimir un acta','sacar mi acta','sacar acta','copia de acta']],
        ['go'=>'/papeleria-para-oficinas-tijuana.html', 'reply'=>"Te llevo a papelería para oficinas ✏️",
         'kw'=>['papeleria','papeleria para oficina','papeleria de oficina','papeleria por mayoreo','papeleria al mayoreo','articulos de oficina','articulos de papeleria','material de oficina','materiales de oficina','insumos de oficina','surtir oficina','surtir mi oficina','surtir papeleria','mayoreo','medio mayoreo','por mayoreo','al mayoreo','utiles escolares','lista de utiles','papeleria escolar']],
        ['go'=>'/pedido-de-impresion-en-linea-tijuana.html', 'reply'=>"Te llevo a cómo hacer tu pedido de impresión en línea 🧾",
         'kw'=>['pedido de impresion en linea','pedido de impresion','como hago un pedido','como hago mi pedido','como funciona el pedido en linea','pedido online','pedido en linea de impresion','proceso de pedido']],
        ['go'=>'/citas-tramites-tijuana.html', 'reply'=>"Te llevo a la info de citas para pasaporte, visa y SENTRI 🛂",
         'kw'=>['informacion de citas','info de citas','info de tramites','como funcionan las citas','que tramites hacen','que tramites manejan','servicios de citas','pagina de citas','landing de citas']],
        ['go'=>'/#testimonios', 'reply'=>"Te llevo a las reseñas ⭐",
         'kw'=>['resena','resenas','opiniones','opinion','testimonios','testimonio','comentarios','reviews','review','calificaciones','calificacion','valoraciones','que dicen de ustedes','que opinan','experiencias de clientes','reputacion','resenas de google','opiniones de google','estrellas','dejar una resena','escribir una resena']],
        ['go'=>'/quienes-somos.html', 'reply'=>"Te llevo a Quiénes somos 🚀",
         'kw'=>['quienes somos','quienes son','sobre nosotros','acerca de','acerca de ustedes','sobre la empresa','sobre ustedes','la empresa','conocer la empresa','historia','su historia','mision','vision','valores','trayectoria','quien es okstation','que es okstation','a que se dedican','quien los fundo','fundadores']],
        ['go'=>'/perfil.html', 'reply'=>"Te llevo a tu perfil (tus pedidos, citas y pagos) 👤",
         'kw'=>['mi perfil','mis pedidos','mis ordenes','mis citas','mi historial','historial de pedidos','historial de citas','mis compras','pagar','pagar pedido','pagar mi pedido','pagar cita','pagar mi cita','pagar orden','hacer un pago','realizar pago','quiero pagar','necesito pagar','donde pago','pago pendiente','pagos pendientes','saldo','adeudo','abonar','liquidar','estatus de mi pedido','estado de mi pedido','seguimiento de pedido','rastrear pedido','ver mis pedidos','ver mis citas','mis facturas','mis recibos','mi ticket','mis tickets']],
        ['go'=>'/cuenta.html', 'reply'=>"Te llevo a tu cuenta 👤",
         'kw'=>['crear cuenta','crear una cuenta','crear mi cuenta','abrir cuenta','abrir una cuenta','hacer cuenta','hacer una cuenta','nueva cuenta','mi cuenta','darme de alta','registrarme','registrar','registro','registrarse','iniciar sesion','inicio de sesion','login','logearme','loguearme','ingresar','acceder','entrar a mi cuenta','sign in','sign up','olvide mi contrasena','recuperar contrasena','cambiar contrasena','restablecer contrasena','recuperar mi cuenta','no puedo entrar']],
        ['go'=>'/#visitanos', 'reply'=>"Te llevo al mapa para llegar 📍",
         'kw'=>['ubicacion','ubicados','localizados','direccion','domicilio','donde estan','donde queda la tienda','donde se encuentra','donde estan ubicados','como llegar','como llego','como se llega','ruta','mapa','google maps','sucursal','sucursales','tienda fisica','visitanos','visitar','estacionamiento','como llegar a la tienda']],
        ['go'=>'/contactanos.html', 'reply'=>"Te llevo a Contáctanos 📞",
         'kw'=>['contacto','contactar','contactarlos','contactanos','ponerme en contacto','comunicarme','hablar con alguien','hablar con una persona','atencion a clientes','atencion al cliente','servicio al cliente','telefono','numero de telefono','su numero','llamar','marcar','correo electronico','formulario de contacto','como los contacto']],
        ['go'=>'/#citas', 'reply'=>"¡Claro! Te llevo a agendar tu cita 🗓️ (para agendar necesitas cuenta).",
         'kw'=>['cita','citas','agendar','agendar cita','sacar cita','apartar cita','reservar cita','hacer cita','hacer una cita','programar cita','turno','pasaporte','pasaportes','sacar pasaporte','sacar el pasaporte','renovar pasaporte','tramitar pasaporte','visa','visa americana','sacar visa','sacar la visa','renovar visa','tramitar visa','consulado','ds160','ds 160','sentri','global entry','globalentry','i94','i 94','ine','credencial de elector','credencial para votar','licencia','licencia de conducir','licencia de manejo','sacar licencia','acta de matrimonio','reagendar cita','reagendar mi cita','consultar cita','agendar tramite']],
        ['go'=>'/tienda.html', 'reply'=>"¡Va! Te llevo a la tienda en línea 🛒",
         'kw'=>['tienda','tiendita','tienda en linea','ir de compras','comprar','compra','producto','productos','catalogo','carrito','carrito de compras','ver el carrito','oferta','ofertas','descuento','descuentos','promocion','promociones','deseados','lista de deseos','favoritos','toner','cartucho','cartuchos','tinta','tinta de impresora','papel bond','cuaderno','pluma','plumas','memoria usb','usb','mouse','teclado','laptop','computadora','pc','audifonos','regulador','impresora','comprar impresora']],
        ['go'=>'/#fotos', 'reply'=>"¡Va! Te llevo a subir tus archivos e imprimir 🖨️",
         'kw'=>['imprimir','imprimo','impresion','impresiones','imprimir en linea','impresion en linea','imprimir pdf','imprimir word','imprimir archivo','imprimir un archivo','subir archivo','subir archivos','subir mi archivo','subir para imprimir','mandar a imprimir','enviar a imprimir','imprimir documento','imprimir documentos','imprime tus fotos','cotizar impresion','cotizar mi impresion','hacer un pedido']],
        ['go'=>'/#servicios', 'reply'=>"Te llevo a nuestros servicios 🧰",
         'kw'=>['servicios','servicio','que servicios','que servicios ofrecen','que ofrecen','que hacen','que hacen ustedes','todos los servicios','lista de servicios','que puedo hacer aqui','en que me pueden ayudar','gama de servicios','menu de servicios','todo lo que hacen']],
        ['go'=>'/#faq', 'reply'=>"Te llevo a las preguntas frecuentes ❓",
         'kw'=>['preguntas frecuentes','pregunta frecuente','dudas','dudas frecuentes','faq','seccion de dudas','resolver dudas']],
        ['go'=>'/#top', 'reply'=>"Te regreso al inicio 🏠",
         'kw'=>['inicio','pagina principal','pagina de inicio','menu principal','al principio','regresar al inicio','volver al inicio','home','pantalla principal']],
        ['go'=>'/aviso-privacidad.html', 'reply'=>"Te llevo al Aviso de Privacidad 🔒",
         'kw'=>['aviso de privacidad','politica de privacidad','privacidad','datos personales','derechos arco']],
        ['go'=>'/terminos.html', 'reply'=>"Te llevo a los Términos y Condiciones 📜",
         'kw'=>['terminos','condiciones','terminos y condiciones','terminos de uso','condiciones de uso']],
    ];
}

/** Navegación directa: "llévame a...". Devuelve ['reply'=>, 'go'=>url] o null. $t ya normalizado. */
function oki_navigate(string $t): ?array
{
    if (!oki_nav_intent($t)) return null;
    // Texto con "límites de palabra": quita signos y rodea de espacios para comparar frases completas
    // (evita falsos positivos como 'acta' dentro de 'contacta' o 'ine' dentro de 'imprime').
    $padded = ' ' . preg_replace('/\s+/', ' ', preg_replace('/[^a-z0-9 ]+/', ' ', $t)) . ' ';
    foreach (oki_nav_destinos() as $d) {
        foreach ($d['kw'] as $kw) {
            if (mb_strpos($padded, ' ' . $kw . ' ') !== false) {
                return ['reply' => $d['reply'], 'go' => $d['go']];
            }
        }
    }
    return null; // hay verbo de navegación pero no reconozco el destino → deja que el cerebro conteste
}

/** Devuelve la respuesta de OKi, o null si no reconoce el mensaje. */
function oki_brain_reply(string $text, string $prev = ''): ?string
{
    $t = oki_norm($text);
    if ($t === '') return null;

    // Flujo interactivo del acta por estado (pregunta → estado → precio).
    $acta = oki_acta_estado($t, oki_norm($prev));
    if ($acta !== null) return $acta;

    $best = null; $bestScore = 0;
    foreach (oki_intents() as $intent) {
        // 'need': todos los tokens deben estar presentes.
        if (!empty($intent['need'])) {
            $ok = true;
            foreach ($intent['need'] as $n) {
                if (mb_strpos($t, oki_norm($n)) === false) { $ok = false; break; }
            }
            if (!$ok) continue;
        }
        // Puntaje = cuántas palabras clave aparecen.
        $score = 0;
        foreach ($intent['kw'] as $k) {
            if (mb_strpos($t, oki_norm($k)) !== false) $score++;
        }
        if (!empty($intent['need'])) $score += 1; // bonus por cumplir el requisito
        if ($score > $bestScore) { $bestScore = $score; $best = $intent['a']; }
    }
    return $bestScore > 0 ? $best : null;
}

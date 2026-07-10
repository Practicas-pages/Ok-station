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
         'a'=>"Papelería para oficinas ✏️\nManejamos consumibles (tóner, cartuchos) y artículos de escritorio, con opción de mayoreo. No tenemos lista fija: escríbenos por ".OKI_WA_TXT." con lo que necesitas y te cotizamos. Puedes ir armando tu lista con el botón 📝 aquí."],

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
         'a'=>"Entrega 🚶\nLos trabajos se recogen en la sucursal (Centro Comercial Otay, Local G-03). Si necesitas un envío, pregúntanos por ".OKI_WA_TXT." y vemos si es posible."],

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

/** Navegación directa: "llévame a...". Devuelve ['reply'=>, 'go'=>url] o null. $t ya normalizado. */
function oki_navigate(string $t): ?array
{
    $nav = preg_match('/\b(llevame|llevar|llevas|vamos a|quiero ir|mandame|dirigeme|ir a|abreme|dame el link)\b/', $t)
        || mb_strpos($t, 'donde hago') !== false
        || mb_strpos($t, 'donde puedo hacer') !== false;
    if (!$nav) return null;

    if (mb_strpos($t,'requisito')!==false)
        return ['reply'=>"Te llevo a los requisitos del pasaporte 📋", 'go'=>"/requisitos-pasaporte-tijuana.html"];

    if (mb_strpos($t,'pagar')!==false || mb_strpos($t,'pago')!==false)
        return ['reply'=>"Te llevo a tu perfil para pagar tus pedidos o citas 💳", 'go'=>"/perfil.html"];

    if (mb_strpos($t,'cita')!==false || mb_strpos($t,'agendar')!==false || mb_strpos($t,'agendo')!==false
        || mb_strpos($t,'pasaporte')!==false || mb_strpos($t,'visa')!==false || mb_strpos($t,'sentri')!==false
        || mb_strpos($t,'tramite')!==false)
        return ['reply'=>"¡Claro! Te llevo a agendar tu cita 🚀 (para agendar necesitas cuenta).", 'go'=>"/#citas"];

    if (mb_strpos($t,'imprimir')!==false || mb_strpos($t,'imprime')!==false || mb_strpos($t,'subir')!==false
        || mb_strpos($t,'archivo')!==false || mb_strpos($t,'foto')!==false || mb_strpos($t,'copia')!==false
        || mb_strpos($t,'pedido')!==false)
        return ['reply'=>"¡Va! Te llevo a subir tus archivos e imprimir 🖨️", 'go'=>"/#fotos"];

    if (mb_strpos($t,'ubica')!==false || mb_strpos($t,'como llego')!==false || mb_strpos($t,'como llegar')!==false
        || mb_strpos($t,'mapa')!==false || mb_strpos($t,'visitanos')!==false || mb_strpos($t,'direccion')!==false)
        return ['reply'=>"Te llevo al mapa para llegar 📍", 'go'=>"/#visitanos"];

    if (mb_strpos($t,'cuenta')!==false || mb_strpos($t,'registr')!==false || mb_strpos($t,'sesion')!==false || mb_strpos($t,'login')!==false)
        return ['reply'=>"Te llevo a tu cuenta 👤", 'go'=>"/cuenta.html"];

    if (mb_strpos($t,'contact')!==false)
        return ['reply'=>"Te llevo a Contáctanos 📞", 'go'=>"/contactanos.html"];

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

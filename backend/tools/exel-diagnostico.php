<?php
/**
 * Diagnóstico de la conexión con Exel del Norte — SOLO LECTURA
 * =============================================================================
 * Exel respondió HTTP 401 (llave rechazada). Este script sirve para saber POR QUÉ
 * sin tener que enseñarle la llave a nadie: **nunca imprime el secreto**, solo su
 * forma (largo, si trae espacios, comillas o caracteres raros). Eso basta para
 * distinguir las tres causas típicas:
 *
 *   a) La llave se corrompió en el .env. Ya pasó una vez en este proyecto: un
 *      `>>` sin salto de línea deja la llave pegada a la línea anterior. También
 *      la rompen las comillas sueltas, un espacio al final o un CR de Windows.
 *   b) La llave es correcta pero Exel la revocó o expiró. En ese caso la forma se
 *      ve sana y el cuerpo de la respuesta suele decirlo.
 *   c) Cambió el formato del header (p. ej. ahora piden "Bearer").
 *      Se prueba también esa variante para descartarla.
 *
 * Además reporta desde cuándo NO se sincroniza, que es el dato que dice si el
 * catálogo publicado está viejo.
 *
 * Uso:  php backend/tools/exel-diagnostico.php
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

$CONFIG = require __DIR__ . '/../api/config.php';

echo "══ Diagnóstico de Exel del Norte ══\n\n";

/* ── 1. Forma de la llave (sin revelarla) ────────────────────────────────── */
$key  = (string) env('EXEL_API_KEY', '');
$base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');

echo "── 1. La llave\n";
if ($key === '') {
    echo "   ✗ EXEL_API_KEY está VACÍA o no existe en backend/.env.\n";
    echo "     Hay respaldo en /root/env-okstation-respaldo.txt.\n";
    exit(1);
}

$largo   = strlen($key);
$limpia  = trim($key);
$sobra   = $largo - strlen($limpia);
/* Se muestran solo 2 caracteres de cada punta: suficiente para cotejar contra el
   respaldo de un vistazo, insuficiente para que la llave sirva a nadie. */
$huella  = $largo >= 8
    ? substr($key, 0, 2) . str_repeat('·', min(20, $largo - 4)) . substr($key, -2)
    : str_repeat('·', $largo);

echo "   Largo            : {$largo} caracteres\n";
echo "   Huella           : {$huella}\n";
printf("   Espacios sobrantes: %s\n", $sobra > 0 ? "SÍ ({$sobra}) ← sospechoso" : 'no');
printf("   Comillas pegadas  : %s\n",
    (str_starts_with($key, '"') || str_starts_with($key, "'") ||
     str_ends_with($key, '"')   || str_ends_with($key, "'")) ? 'SÍ ← sospechoso' : 'no');
printf("   Salto/CR adentro  : %s\n",
    preg_match('/[\r\n]/', $key) ? 'SÍ ← sospechoso (el clásico >> sin salto de línea)' : 'no');
printf("   Caracteres raros  : %s\n",
    preg_match('/[^\x20-\x7E]/', $key) ? 'SÍ ← sospechoso (no imprimibles)' : 'no');
$sano = ($sobra === 0 && !preg_match('/[\r\n]/', $key) && !preg_match('/[^\x20-\x7E]/', $key)
        && !str_starts_with($key, '"') && !str_starts_with($key, "'"));
echo "   ➤ " . ($sano
    ? "La forma se ve SANA. Si Exel la rechaza, lo más probable es que esté\n"
    . "     revocada o expirada: hay que pedirle una nueva a Exel.\n"
    : "La llave viene DEFORMADA. Se corrompió al escribirla en el .env;\n"
    . "     restáurala desde /root/env-okstation-respaldo.txt.\n") . "\n";

/* ── 2. Qué contesta Exel, y con qué formato de header ───────────────────── */
echo "── 2. Respuesta de Exel a GET /productos\n";

/** Una llamada de prueba. Devuelve [código, cuerpo recortado]. */
function probar(string $url, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_NOBODY         => false,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($resp === false) return [0, "error de red: {$err}"];
    return [$code, mb_strimwidth(trim(strip_tags((string) $resp)), 0, 240, '…')];
}

/* Se prueban las dos convenciones. El sync usa la llave cruda; si Exel hubiera
   cambiado a Bearer, esta prueba lo delata sin adivinar nada. */
$variantes = [
    'llave cruda (la que usa el sync)' => ['Authorization: ' . $key],
    'Bearer'                           => ['Authorization: Bearer ' . $key],
];
$ok = null;
foreach ($variantes as $nombre => $headers) {
    [$code, $cuerpo] = probar("$base/productos", $headers);
    printf("   %-34s HTTP %d\n", $nombre, $code);
    if ($cuerpo !== '') echo "      dice: {$cuerpo}\n";
    if ($code === 200 && $ok === null) $ok = $nombre;
}
echo "\n   ➤ " . ($ok !== null
    ? "FUNCIONA con: {$ok}\n"
    : "Ninguna variante fue aceptada. La llave no sirve como está.\n") . "\n";

/* ── 3. ¿Desde cuándo no se sincroniza? ──────────────────────────────────── */
echo "── 3. Estado del catálogo publicado\n";
$d = $CONFIG['db'];
try {
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Throwable $e) {
    echo "   (no se pudo abrir la base; se omite esta sección)\n";
    exit(0);
}

$ultima = $pdo->query("SELECT MAX(last_synced_at) FROM products WHERE supplier='exel'")->fetchColumn();
echo "   Última sincronización: " . ($ultima ?: 'NUNCA') . "\n";
if ($ultima) {
    $dias = (int) floor((time() - strtotime((string) $ultima)) / 86400);
    echo "   Antigüedad           : {$dias} día(s)"
       . ($dias >= 2 ? "  ← el catálogo está VIEJO: precios y existencias sin actualizar\n" : "\n");
}

/* Lo que el dueño quiere confirmar: que en la tienda SOLO se vea Oficina y Escolar.
   Esto mira lo que está PUBLICADO ahora mismo, que es lo que ve el cliente. */
echo "\n── 4. Categorías VISIBLES hoy en la tienda (is_active=1)\n";
$st = $pdo->query(
    "SELECT COALESCE(NULLIF(category,''),'(sin categoría)') AS cat, COUNT(*) n
       FROM products WHERE supplier='exel' AND is_active=1
      GROUP BY cat ORDER BY n DESC"
);
$totalAct = 0; $filas = [];
foreach ($st as $r) { $filas[] = $r; $totalAct += (int) $r['n']; }
foreach ($filas as $r) {
    $marca = mb_strtolower(trim($r['cat'])) === 'oficina y escolar' ? '✓' : '✗ NO deberia estar';
    printf("   %-44s %6d  %s\n", $r['cat'], $r['n'], $marca);
}
echo "   " . str_repeat('─', 58) . "\n";
printf("   %-44s %6d\n", 'TOTAL VISIBLE', $totalAct);

$fuera = 0;
foreach ($filas as $r) { if (mb_strtolower(trim($r['cat'])) !== 'oficina y escolar') $fuera += (int) $r['n']; }
echo "\n   ➤ " . ($fuera === 0
    ? "Solo se ve Oficina y Escolar. El filtro ya está aplicado.\n"
    : "Hay {$fuera} productos visibles que NO son Oficina y Escolar.\n"
    . "     Siguen publicados porque el sync no ha podido correr (ver punto 2):\n"
    . "     el filtro nuevo no se aplica hasta que Exel vuelva a contestar.\n");

/* El almacén no se puede afirmar: warehouse_id es un valor que escribimos nosotros,
   no algo que Exel nos haya confirmado. Decirlo claro evita dar por bueno un dato
   que nadie ha comprobado. */
echo "\n── 5. Almacén\n";
$wh = $pdo->query(
    "SELECT COALESCE(NULLIF(warehouse_id,''),'(vacío)') w, COUNT(*) n
       FROM products WHERE supplier='exel' AND is_active=1 GROUP BY w"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($wh as $r) { printf("   warehouse_id = %-10s %6d productos\n", $r['w'], $r['n']); }
echo "   ⚠ Ese valor lo escribimos NOSOTROS al sincronizar; Exel nunca lo confirmó.\n";
echo "     No prueba que el producto esté en el almacén 4. Para eso hace falta el\n";
echo "     endpoint 'productos por almacenes', que aún no tenemos documentado.\n";

echo "\n✔ Diagnóstico terminado. No se escribió nada.\n";

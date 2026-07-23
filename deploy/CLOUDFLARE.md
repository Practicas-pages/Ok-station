# Cloudflare frente a Ok.station — guía de puesta en marcha

Poner Cloudflare como capa de seguridad (anti-bots, anti-fuerza-bruta, DDoS) y
usar su geolocalización por IP para el IVA (BC 8% / nacional 16%) sin pedirle
permiso de ubicación al navegador.

> **Orden obligatorio:**
> **A** (IP real en nginx) → **verificar** → **D** (cambio de PHP) + **B** (cerrar el origen).
> D y B van los dos DESPUÉS de verificar A; entre ellos el orden da igual.
> Hacerlo al revés deja el sitio inaccesible o el rate-limit roto. No te saltes la
> verificación entre A y lo demás.

---

## Por qué importa (y por qué puede ser urgente)

Detrás de Cloudflare, tu servidor deja de ver la IP del visitante y ve la de
Cloudflare: **todos** se ven como la misma IP. Eso rompe todo lo que dependa de la
IP del cliente. La auditoría encontró **9 lugares**:

| Archivo | Lee | Uso | Lo arregla |
|---|---|---|---|
| `login.php:12` | `REMOTE_ADDR` | bloqueo tras 5 logins fallidos | **Paso A** |
| `register.php:14` | `REMOTE_ADDR` | tope 20 altas/15 min | **Paso A** |
| `forgot-password.php:20` | `REMOTE_ADDR` | anti-spam de correo | **Paso A** |
| `payments/process.php`, `lib/Payments.php`, `appointments/create.php`, `lib/authz.php` | `REMOTE_ADDR` | antifraude / bitácoras | **Paso A** |
| `oki/chat.php:114` | **`X-Forwarded-For`** | límite del chatbot | **Paso D (PHP)** |
| `lib/Geo.php:56` | **`X-Forwarded-For`** | geo / IVA | **Paso D (PHP)** |

> **El Paso A arregla 7 de los 9, NO los 9.** El módulo `real_ip` de nginx reescribe
> `REMOTE_ADDR`, pero **no toca `X-Forwarded-For`**. Los dos que leen XFF
> (`chat.php` y `Geo.php`) siguen falsificables aunque hagas el Paso A —
> Cloudflare *anexa* la IP real al XFF que mande el cliente, así que un atacante
> manda `X-Forwarded-For: 9.9.9.9` y esos dos le creen. Por eso el **Paso D** es
> obligatorio y va en el mismo despliegue.

**Urgencia:** `login.php` y `register.php` ya usan `REMOTE_ADDR`. Si tu sitio **ya**
está detrás de Cloudflare **sin** el Paso A, el hueco crítico está **abierto ahora
mismo**: un atacante puede bloquear el login de cualquier usuario, o el registro de
todo el sitio. Corre primero la verificación (abajo): si el veredicto es
`detras_de_cloudflare_SIN_real_ip`, esto no es endurecimiento futuro, es un
incidente activo.

---

## Cómo está hoy tu producción

```
Visitante ─► Cloudflare ─► Nginx :443 ─► Varnish ─► Nginx :8080 ─► PHP-FPM
                             │
                             └─ /backend/ va DIRECTO a PHP-FPM (sin Varnish)
```

- El vhost real **vive en CloudPanel** (Sites → okstation.mx → Vhost), **no en el
  repo**. Los `.conf` del repo son plantilla/parche de referencia.
- Todo `/backend/` (donde viven los 9 puntos) ya salta Varnish y va directo a
  PHP-FPM en el server **:443**. Por eso el Paso A va en ese server y con eso basta
  para el `REMOTE_ADDR` de la API.
- **Invariante a respetar:** ningún `.php` de la raíz (servido por Varnish→:8080,
  p. ej. `producto.php`, `categoria.php`) debe leer la IP del cliente — ahí
  `REMOTE_ADDR` es `127.0.0.1` (Varnish). Si algún día uno necesita geo/rate-limit
  por IP, hay que aplicar `real_ip` también en el server :8080 (confiando en el
  loopback y leyendo el XFF que reenvíe Varnish), no solo en :443.

---

## Paso A — Restaurar la IP real  *(sin esto, nada de lo demás sirve)*

1. Abre **CloudPanel → Sites → okstation.mx → Vhost**.
2. Dentro del `server { listen 443 ... }`, **a nivel de server** (junto al BLOQUE 2
   de `nginx-parche-backend-sin-varnish.conf`, **no** dentro de un `location`), pega
   el contenido de **`deploy/cloudflare-real-ip.conf`**.
3. Guarda y: `nginx -t && systemctl reload nginx` (o **Reload** en el panel).

> ⚠️ **No borres ni muevas** la línea `fastcgi_param HTTP_AUTHORIZATION
> $http_authorization;` del `location ~ \.php$` al editar este server. Sin ella,
> nginx deja de pasar la cabecera Authorization y **todo el login/JWT
> (cuenta, checkout, admin) responde 401**, mientras la home "sigue cargando" — un
> diagnóstico engañoso.

### Comprobar que funcionó  *(obligatorio antes de B y D)*

1. En `backend/.env`, pon `SETUP_TOKEN=algo-secreto` y recarga PHP.
2. Desde **tu navegador** (que pasa por Cloudflare), abre:
   `https://okstation.mx/backend/api/health.php?key=algo-secreto`
3. En el bloque `"ip"`:
   - `"verdict":"ok_real_ip_activo"` → **listo**. `remote_addr` = tu IP real = `cf_connecting_ip`.
   - `"detras_de_cloudflare_SIN_real_ip"` → el `.conf` no quedó aplicado. **Rate-limit roto.** Revisa el Paso A.
   - `"detras_de_proxy_SIN_real_ip"` → `remote_addr` es loopback (Varnish); falta real_ip en el server que ejecuta PHP.
4. Al terminar, **vacía `SETUP_TOKEN`** para deshabilitar el diagnóstico.

> Matices: (a) en local (`php -S`) siempre verás `"local_sin_proxy"` — es normal, no
> corre nginx. (b) El verde solo prueba **tu** camino: si a la lista pegada le falta
> un rango de Cloudflare, un visitante que entre por ese edge sigue roto aunque a ti
> te dé verde — por eso conviene refrescar la lista con `update-cf-ips.sh` antes de
> cerrar. (c) El verde es 100% de fiar **después** del Paso B (con el origen abierto,
> la cabecera `CF-Connecting-IP` es falsificable por quien tenga el token).

---

## Paso D — Endurecer PHP  *(obligatorio, justo después de verificar A)*

`chat.php` y `Geo.php` leen `X-Forwarded-For` primero. Una vez que A está activo, la
IP correcta ya está en `REMOTE_ADDR`, así que deben usar **solo** `REMOTE_ADDR`.

**`backend/api/oki/chat.php:114`** — de:
```php
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$ip = trim(explode(',', $ip)[0]);
```
a:
```php
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';   // real gracias al Paso A; XFF es falsificable
```

**`backend/api/lib/Geo.php:54-58`** (`clientIp()`) — de:
```php
$xff = (string) ($server['HTTP_X_FORWARDED_FOR'] ?? '');
if ($xff !== '') return trim(explode(',', $xff)[0]);
return (string) ($server['REMOTE_ADDR'] ?? '');
```
a:
```php
return (string) ($server['REMOTE_ADDR'] ?? '');   // real gracias al Paso A; XFF es falsificable
```

> **No hagas este cambio ANTES del Paso A.** Sin real_ip, `REMOTE_ADDR` es la IP de
> Cloudflare y `chat.php` colapsaría a un único cubo global (30/min para todo el
> sitio) → 429 con tráfico normal. Por eso va después de verificar A.

---

## Paso B — Cerrar el origen a Cloudflare  *(solo después de verificar A)*

Si el servidor acepta conexiones de cualquier IP, un atacante que descubra tu IP
real (DNS histórico, cabeceras de correo, Shodan…) puede pegarle **directo**,
saltándose Cloudflare **y** falsificando `CF-Connecting-IP`. Hay que aceptar
tráfico **solo** de Cloudflare.

> ⚠️ **La trampa del `allow/deny` en nginx.** No cierres el origen con
> `allow <rangos CF>; deny all;` en nginx. El módulo `real_ip` corre en una fase
> (POST_READ) **anterior** a la de `allow/deny` (ACCESS), y ya reescribió
> `$remote_addr` a la IP del visitante final **sin importar dónde pongas el bloque**.
> Así que el `allow` de rangos de Cloudflare **nunca coincide** y nginx bloquea a
> **todos** tus clientes. El filtrado por IP de Cloudflare va **siempre en el
> firewall del sistema**, que ve la IP verdadera del que se conecta *antes* de nginx.

### Antes de cerrar
- **TODOS** los registros A/AAAA que sirvan 80/443 (apex **y** subdominios: www,
  tienda, api…) deben estar **proxied** (nube naranja, no gris). Un solo registro en
  gris resuelve a tu IP real → sus visitantes caen al cerrar.
- Mientras el lockdown esté activo, **no uses "Pause Cloudflare on Site"**: manda el
  tráfico directo y el firewall lo bloqueará.
- El firewall solo toca **80/443**. **SSH (22) no se toca**, no te dejas fuera.

### Aplicar el firewall
Usa el archivo **completo** que genera `update-cf-ips.sh`:
**`deploy/cloudflare-nft.conf`** (los 22 rangos, ya idempotente — se borra y recrea
la tabla al reaplicar). **No** escribas la lista a mano ni pegues un ejemplo
recortado: si dejas rangos fuera, dropeas ese tráfico de Cloudflare en silencio.

```bash
sudo nft -f deploy/cloudflare-nft.conf          # aplicar (en memoria)
# probar: el sitio carga por tu navegador (entra por CF); pegarle DIRECTO a la IP del server = timeout
```

**Persistir (imprescindible):** `nft -f` solo carga en memoria; un reinicio deja el
origen abierto otra vez. Copia el ruleset a `/etc/nftables.conf` (o un include) y
`sudo systemctl enable --now nftables`. Verifícalo tras un reinicio con
`nft list table inet cloudflare`.

**Reversa:** `sudo nft delete table inet cloudflare` (quirúrgico). **Nunca**
`nft flush ruleset` si el servidor tiene fail2ban, Docker o el firewall de
CloudPanel — eso borra TODO ese ruleset, no solo esta tabla.

**IPv6:** si tienes registro AAAA, el set `cf6` DEBE tener los 7 rangos (ya vienen en
el archivo generado). Un `cf6` vacío haría que la regla dropee **todo** IPv6.

**Let's Encrypt:** si renuevas TLS con reto HTTP-01 en el :80 y la validación no
pasa por Cloudflare, el drop la bloquea y el cert caduca en silencio. El archivo trae
comentada una línea `tcp dport 80 accept` para ese caso; con Origin CA de Cloudflare
o reto DNS-01 no hace falta.

---

## Paso C — Geolocalización para el IVA

`Geo.php` ya lee `CF-IPCountry` y `CF-Region`, pero **Cloudflare no manda `CF-Region`
por defecto**. Para la vía por estado, activa en Cloudflare el **Managed Transform →
"Add visitor location headers"** (agrega `CF-Region`, `CF-Region-Code`, etc.). Si no,
cae al lookup por IP (ya correcto tras el Paso A). El IVA definitivo se reconfirma con
el domicilio en el checkout, así que esto solo afecta la "pista" de precio.

---

## Endurecimiento extra (opcional)

- **Authenticated Origin Pulls (mTLS).** El origen verifica que la conexión trae el
  certificado cliente de Cloudflare. **Cuidado con el certificado correcto:** el
  `ssl_client_certificate` de nginx debe ser la **CA de Origin Pull de Cloudflare**
  (`authenticated_origin_pull_ca.pem`), **NO** el "Origin Certificate" (ese es el que
  nginx *presenta* en `ssl_certificate`). Orden seguro: activa AOP en el panel de
  Cloudflare **primero**, comprueba que llegan peticiones, y **solo entonces** pon
  `ssl_verify_client on`. Reversa: `ssl_verify_client off`. Ojo: el AOP **de zona**
  usa un certificado **compartido por todos los clientes de Cloudflare**, así que ata
  la conexión "a Cloudflare", no "a TU zona"; para atarla a tu zona necesitas AOP
  **per-hostname** con tu propio certificado.
- **Cloudflare Tunnel (`cloudflared`).** El origen **no expone puertos públicos** (se
  conecta de salida a Cloudflare). Es lo más fuerte y elimina el mantenimiento de
  allowlists de IP.

---

## Mantenimiento — que la lista no se pudra

Cloudflare cambia sus rangos rara vez, pero pasa. Programa el script (con `bash`, para
no depender del bit de ejecución que Windows/git no preservan):

```cron
# Domingos 04:00 — regenera los 3 archivos y avisa/recarga si algo cambió
0 4 * * 0  bash /ruta/al/repo/deploy/update-cf-ips.sh >> /var/log/cf-ips.log 2>&1
```

- Regenera `cloudflare-real-ip.conf`, `cloudflare-ips.txt` y `cloudflare-nft.conf`.
- Si nginx **incluye** el `.conf`, corre con `RELOAD_NGINX=1` (valida con `nginx -t`
  y recarga solo si cambió; si `-t` falla, revierte los tres archivos).
- Si **pegaste** el `.conf` en CloudPanel, el script solo detecta el cambio; hay que
  actualizarlo a mano esa vez.
- **El firewall no se recarga solo:** si la lista cambió, reaplica
  `sudo nft -f deploy/cloudflare-nft.conf` y re-persístelo. (Un rango nuevo no
  reaplicado = visitantes de ese edge bloqueados, difícil de diagnosticar.)

---

## Reversa

- **IP real:** quita el bloque `set_real_ip_from …` del vhost y recarga. Vuelve a
  `REMOTE_ADDR` = IP de Cloudflare (rate-limit degradado, pero el sitio funciona).
- **Firewall:** `sudo nft delete table inet cloudflare` (no `flush ruleset`).
- **Paso D:** revertir los dos archivos PHP a leer XFF (git revert del commit).
- **Caché de geo:** si se cachearon estados equivocados durante la ventana, borra
  `storage/geo_cache/*.json` (se recalcula al vuelo).

---

## Pendientes relacionados (para coordinar con Oscar)

- En `nginx-parche-backend-sin-varnish.conf`, el `location ^~ /backend/` define su
  propio `add_header` (Cache-Control), y nginx **no hereda** los `add_header` del
  server dentro de un location que ya declara uno. Efecto: las respuestas de la API
  se sirven **sin** CSP / X-Content-Type-Options / X-Frame-Options. Para arreglarlo
  hay que **repetir** el bloque de headers de seguridad dentro de ese `location`
  (o mover Ok.station a un PHP Site propio). Es su archivo — coordinar antes de tocar.

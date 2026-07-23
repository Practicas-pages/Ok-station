#!/usr/bin/env bash
# ==========================================================================
# Ok.station — Mantener al día los rangos de IP de Cloudflare
# --------------------------------------------------------------------------
# Cloudflare cambia su lista de IPs cada tanto (rara vez, pero pasa). Una lista
# vieja es un agujero silencioso: si Cloudflare añade un rango y nginx no lo
# conoce, el tráfico de ese rango se trata como "no confiable", su IP real se
# ignora (rate-limit/geo mal) y —si además cierras el origen por firewall— ese
# tráfico se BLOQUEA. Todo sin ningún error visible.
#
# Regenera tres archivos a partir de la lista oficial de Cloudflare:
#   - deploy/cloudflare-real-ip.conf  (set_real_ip_from … para nginx)
#   - deploy/cloudflare-ips.txt       (lista plana de CIDR)
#   - deploy/cloudflare-nft.conf      (ruleset nftables COMPLETO para cerrar el origen)
#
# USO MANUAL:   bash deploy/update-cf-ips.sh
# CRON (semanal, domingos 04:00) — usa 'bash' para no depender del bit +x:
#   0 4 * * 0  bash /ruta/al/repo/deploy/update-cf-ips.sh >> /var/log/cf-ips.log 2>&1
#
# Salida: 0 = todo bien (sin cambios o aplicado) · 1 = error (no toca nada).
#   (Se usa 0 en el éxito a propósito: cron/monitoreo tratan !=0 como fallo.)
# ==========================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_CONF="${CF_OUT_CONF:-$DIR/cloudflare-real-ip.conf}"
OUT_IPS="${CF_OUT_IPS:-$DIR/cloudflare-ips.txt}"
OUT_NFT="${CF_OUT_NFT:-$DIR/cloudflare-nft.conf}"
# RELOAD_NGINX=1 SOLO si nginx realmente INCLUYE el .conf (no en el modelo
# "pegar en el panel de CloudPanel", donde nginx no lee este archivo).
RELOAD_NGINX="${RELOAD_NGINX:-0}"

V4_URL="https://www.cloudflare.com/ips-v4"
V6_URL="https://www.cloudflare.com/ips-v6"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

command -v curl >/dev/null || die "curl no está instalado."

# Temporales en el MISMO directorio del destino → el 'mv' final es un rename
# atómico de verdad (mktemp en /tmp suele estar en otro filesystem y degrada a
# copiar+borrar, que no es atómico y puede dejar archivos a medias).
tmp4="$(mktemp "$DIR/.cf-v4.XXXXXX")"
tmp6="$(mktemp "$DIR/.cf-v6.XXXXXX")"
newconf="$(mktemp "$DIR/.cf-conf.XXXXXX")"
newips="$(mktemp "$DIR/.cf-ips.XXXXXX")"
newnft="$(mktemp "$DIR/.cf-nft.XXXXXX")"
trap 'rm -f "$tmp4" "$tmp6" "$newconf" "$newips" "$newnft"' EXIT

# ── Valida un CIDR de verdad (octetos 0-255, prefijo v4 0-32 / v6 0-128).
# La forma sola no basta: "999.1.1.0/33" parece CIDR y nginx lo rechazaría.
valid_cidr() {
    local cidr="$1" ip prefix o
    [[ "$cidr" == */* ]] || return 1
    ip="${cidr%/*}"; prefix="${cidr#*/}"
    [[ "$prefix" =~ ^[0-9]+$ ]] || return 1
    if [[ "$ip" == *:* ]]; then
        [[ "$ip" =~ ^[0-9a-fA-F:]+$ ]] || return 1
        [ "$prefix" -ge 0 ] && [ "$prefix" -le 128 ] || return 1
    else
        [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
        for o in "${BASH_REMATCH[@]:1:4}"; do [ "$o" -le 255 ] || return 1; done
        [ "$prefix" -ge 0 ] && [ "$prefix" -le 32 ] || return 1
    fi
    return 0
}

log "Descargando rangos de Cloudflare…"
curl --fail --silent --show-error --max-time 20 "$V4_URL" -o "$tmp4" || die "no se pudo bajar $V4_URL"
curl --fail --silent --show-error --max-time 20 "$V6_URL" -o "$tmp6" || die "no se pudo bajar $V6_URL"

# Normaliza CRLF → LF (si un proxy/mirror sirviera la lista con \r se rompería todo).
sed -i 's/\r$//' "$tmp4" "$tmp6"

# ── Recolectar y VALIDAR cada línea. Se descarta cualquier basura (líneas de una
# página de error 200, captcha, HTML). Si tras validar quedan muy pocos rangos,
# algo falló y NO se sobreescribe la lista buena.
# El "|| [ -n "$line" ]" procesa también la ÚLTIMA línea cuando el archivo NO
# termina en salto de línea — las páginas de Cloudflare terminan así, y sin esto
# se perdía el último rango de cada lista (131.0.72.0/22 y 2c0f:f248::/32).
v4=(); v6=()
while IFS= read -r line || [ -n "$line" ]; do line="${line//[[:space:]]/}"; [ -z "$line" ] && continue
    if valid_cidr "$line"; then case "$line" in *:*) v6+=("$line");; *) v4+=("$line");; esac; fi
done < "$tmp4"
while IFS= read -r line || [ -n "$line" ]; do line="${line//[[:space:]]/}"; [ -z "$line" ] && continue
    if valid_cidr "$line"; then case "$line" in *:*) v6+=("$line");; *) v4+=("$line");; esac; fi
done < "$tmp6"

n4="${#v4[@]}"; n6="${#v6[@]}"
[ "$n4" -ge 8 ] || die "solo $n4 rangos v4 válidos (esperaba ~15). Aborto para no romper la config."
[ "$n6" -ge 4 ] || die "solo $n6 rangos v6 válidos (esperaba ~7). Aborto para no romper la config."
log "OK: $n4 rangos v4, $n6 rangos v6 (validados)."

today="$(date '+%Y-%m-%d')"

# ── 1) nginx real-ip ──
{
    echo "# =========================================================================="
    echo "# Ok.station — Restaurar la IP REAL del visitante detrás de Cloudflare"
    echo "# GENERADO por deploy/update-cf-ips.sh el $today — evita editarlo a mano."
    echo "# NO arregla oki/chat.php ni lib/Geo.php (leen X-Forwarded-For): ver Paso D de CLOUDFLARE.md."
    echo "# =========================================================================="
    echo ""
    echo "# ── IPv4 de Cloudflare ($n4 rangos) ──"
    for c in "${v4[@]}"; do echo "set_real_ip_from $c;"; done
    echo ""
    echo "# ── IPv6 de Cloudflare ($n6 rangos) ──"
    for c in "${v6[@]}"; do echo "set_real_ip_from $c;"; done
    echo ""
    echo "real_ip_header    CF-Connecting-IP;"
    echo "real_ip_recursive on;"
} > "$newconf"

# ── 2) Lista plana ──
{ for c in "${v4[@]}"; do echo "$c"; done; for c in "${v6[@]}"; do echo "$c"; done; } > "$newips"

# ── 3) nftables COMPLETO para cerrar el origen (idempotente: 'add'+'delete' hace
# que 'delete' no falle si la tabla no existe; luego se recrea entera).
join_by() { local IFS=", "; echo "$*"; }
{
    echo "#!/usr/sbin/nft -f"
    echo "# Ok.station — cerrar el origen: aceptar 80/443 SOLO desde Cloudflare."
    echo "# GENERADO por deploy/update-cf-ips.sh el $today. SSH (22) NO se toca."
    echo "# Aplicar:   nft -f deploy/cloudflare-nft.conf"
    echo "# Persistir: cópialo a /etc/nftables.conf (o un include) y 'systemctl enable --now nftables',"
    echo "#            o NO sobrevive un reinicio y el origen queda abierto en silencio."
    echo "# Revertir:  nft delete table inet cloudflare   (NO 'nft flush ruleset', borra fail2ban/docker)."
    echo "add table inet cloudflare"
    echo "delete table inet cloudflare"
    echo "table inet cloudflare {"
    echo "  set cf4 { type ipv4_addr; flags interval; elements = { $(join_by "${v4[@]}") } }"
    echo "  set cf6 { type ipv6_addr; flags interval; elements = { $(join_by "${v6[@]}") } }"
    echo "  chain input {"
    echo "    type filter hook input priority filter; policy accept;"
    echo "    ct state established,related accept"
    echo '    iif "lo" accept'
    echo "    # ¿Renuevas TLS con Let's Encrypt HTTP-01? Descomenta para no bloquear la validación en :80"
    echo "    # (si usas Origin CA de Cloudflare o reto DNS-01, deja esto comentado):"
    echo "    # tcp dport 80 accept"
    echo "    tcp dport { 80, 443 } ip  saddr != @cf4 drop"
    echo "    tcp dport { 80, 443 } ip6 saddr != @cf6 drop"
    echo "  }"
    echo "}"
} > "$newnft"

# ── ¿Cambió el contenido FUNCIONAL? Se compara todo menos comentarios y vacíos,
# así el cambio de fecha en el encabezado no cuenta como cambio.
funcs() { grep -vE '^\s*#|^\s*$' "$1" 2>/dev/null | sort; }
changed=0
# Cambió si: falta cualquiera de los 3 artefactos, o el contenido funcional del .conf difiere.
if [ ! -f "$OUT_CONF" ] || [ ! -f "$OUT_IPS" ] || [ ! -f "$OUT_NFT" ]; then changed=1
elif ! diff -q <(funcs "$newconf") <(funcs "$OUT_CONF") >/dev/null 2>&1; then changed=1; fi

if [ "$changed" -eq 0 ]; then
    log "Sin cambios en los rangos. Nada que hacer."
    exit 0
fi

# Respaldo simétrico de los tres archivos antes de pisarlos.
for f in "$OUT_CONF" "$OUT_IPS" "$OUT_NFT"; do [ -f "$f" ] && cp -f "$f" "$f.bak"; done
mv -f "$newconf" "$OUT_CONF"; mv -f "$newips" "$OUT_IPS"; mv -f "$newnft" "$OUT_NFT"
chmod 644 "$OUT_CONF" "$OUT_IPS" "$OUT_NFT"
log "Actualizados: $OUT_CONF, $OUT_IPS, $OUT_NFT."

# Restaura los tres desde su .bak (o los borra si no había: primera corrida).
revert_all() {
    for f in "$OUT_CONF" "$OUT_IPS" "$OUT_NFT"; do
        if [ -f "$f.bak" ]; then mv -f "$f.bak" "$f"; else rm -f "$f"; fi
    done
}

if [ "$RELOAD_NGINX" = "1" ]; then
    log "Validando nginx…"
    if nginx -t; then
        systemctl reload nginx
        log "nginx recargado con la lista nueva."
        for f in "$OUT_CONF" "$OUT_IPS" "$OUT_NFT"; do rm -f "$f.bak"; done  # éxito: no dejar cruft
        log "RECORDATORIO: el firewall (cloudflare-nft.conf) NO se recarga solo; reaplícalo si cambió."
    else
        revert_all
        die "nginx -t falló; se revirtió TODO a la lista anterior. No se recargó."
    fi
else
    for f in "$OUT_CONF" "$OUT_IPS" "$OUT_NFT"; do rm -f "$f.bak"; done
    log "RELOAD_NGINX=0: los archivos se actualizaron pero NO se recargó nada."
    log "→ Si pegaste el .conf en CloudPanel, actualízalo a mano con la lista nueva."
    log "→ Si cerraste el origen con nftables, reaplica: nft -f $OUT_NFT (y re-persístelo)."
fi

exit 0

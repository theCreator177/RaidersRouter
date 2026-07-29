#!/usr/bin/env bash
# setup-wireguard.sh — turn a fresh Linux VPS into a personal WireGuard VPN and
# print a phone-scannable QR code for each device.
#
# Usage (as root on the VPS):
#   bash setup-wireguard.sh                  # install server + first client ("phone")
#   bash setup-wireguard.sh add-client NAME  # add another device (laptop, tablet, ...)
#   bash setup-wireguard.sh show-client NAME # re-print a client's QR code + config
#   bash setup-wireguard.sh list-clients
#   bash setup-wireguard.sh remove-client NAME
#
# Tunables (set as env vars before running):
#   WG_PORT=51820                 UDP listen port (443 can help on restrictive networks)
#   WG_NET=10.66.66               first three octets of the tunnel subnet (/24)
#   WG_DNS=1.1.1.1,1.0.0.1        DNS pushed to clients
#   WG_ALLOWED_IPS="0.0.0.0/0, ::/0"  what clients route through the tunnel
#   SERVER_ENDPOINT=<ip-or-dns>   skip public-IP auto-detection
#   FIRST_CLIENT=phone            name of the client created during install
#   WG_SKIP_FIRST_CLIENT=1        install the server only, no first client
#   WG_DRY_RUN=1                  print system-mutating commands instead of running
#                                 them (package install, sysctl, systemctl, firewall);
#                                 keys and configs are still generated under WG_DIR
#   WG_DIR=/etc/wireguard         where configs live (override only for testing)
#
# Notes:
#   - "0.0.0.0/0, ::/0" routes ALL traffic through the tunnel. Keeping ::/0 even on an
#     IPv4-only server is intentional: it prevents IPv6 traffic from leaking around
#     the VPN.
#   - Client private keys are kept in $WG_DIR/clients/*.conf (root-only, mode 600) so
#     QR codes can be re-printed. Delete a client's file after importing it if you
#     prefer the key to exist only on the device (show-client then stops working).
set -euo pipefail
umask 077

WG_IFACE="${WG_IFACE:-wg0}"
WG_PORT="${WG_PORT:-51820}"
WG_NET="${WG_NET:-10.66.66}"
WG_DNS="${WG_DNS:-1.1.1.1,1.0.0.1}"
WG_ALLOWED_IPS="${WG_ALLOWED_IPS:-0.0.0.0/0, ::/0}"
WG_DIR="${WG_DIR:-/etc/wireguard}"
WG_DRY_RUN="${WG_DRY_RUN:-0}"
FIRST_CLIENT="${FIRST_CLIENT:-phone}"

SERVER_CONF="${WG_DIR}/${WG_IFACE}.conf"
CLIENTS_DIR="${WG_DIR}/clients"

die() {
  echo "error: $*" >&2
  exit 1
}

# System-mutating commands go through run() so WG_DRY_RUN=1 can preview them.
run() {
  if [[ "${WG_DRY_RUN}" = "1" ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

need_root() {
  if [[ "${WG_DRY_RUN}" != "1" && "$(id -u)" -ne 0 ]]; then
    die "run as root (sudo bash $0 ...)"
  fi
}

validate_name() {
  [[ "$1" =~ ^[A-Za-z0-9_-]{1,15}$ ]] ||
    die "client name must be 1-15 chars of letters, digits, '-' or '_' (got: '$1')"
}

ensure_tools() {
  if command -v wg >/dev/null && command -v qrencode >/dev/null; then
    return
  fi
  if command -v apt-get >/dev/null; then
    run env DEBIAN_FRONTEND=noninteractive apt-get update -y
    run env DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard-tools qrencode iptables iproute2
  elif command -v dnf >/dev/null; then
    run dnf install -y epel-release || true
    run dnf install -y wireguard-tools qrencode iptables iproute
  else
    die "unsupported distro: need apt-get or dnf (Ubuntu 24.04 LTS recommended)"
  fi
}

egress_iface() {
  ip -4 route show default | awk '{for (i = 1; i < NF; i++) if ($i == "dev") {print $(i + 1); exit}}'
}

get_endpoint() {
  local ep="${SERVER_ENDPOINT:-}"
  if [[ -z "$ep" ]]; then
    ep="$(curl -4fsS -m 5 https://icanhazip.com 2>/dev/null | tr -d '[:space:]')" || true
  fi
  if [[ -z "$ep" ]]; then
    ep="$(curl -4fsS -m 5 https://api.ipify.org 2>/dev/null | tr -d '[:space:]')" || true
  fi
  if [[ -z "$ep" ]]; then
    ep="$(hostname -I 2>/dev/null | awk '{print $1}')"
    echo "warning: could not detect public IP; using ${ep:-<none>} — if this VPS is" >&2
    echo "warning: behind NAT, re-run with SERVER_ENDPOINT=<public-ip-or-dns>" >&2
  fi
  [[ -n "$ep" ]] || die "no server endpoint found; set SERVER_ENDPOINT=<ip-or-dns>"
  echo "$ep"
}

enable_forwarding() {
  run bash -c "printf 'net.ipv4.ip_forward = 1\n' > /etc/sysctl.d/99-wireguard.conf"
  run sysctl -q -p /etc/sysctl.d/99-wireguard.conf
}

open_firewall() {
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    run ufw allow "${WG_PORT}/udp"
  elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    run firewall-cmd --permanent --add-port="${WG_PORT}/udp"
    run firewall-cmd --reload
  fi
}

# Apply server-config changes to a live interface without dropping connections.
live_reload() {
  [[ "${WG_DRY_RUN}" = "1" ]] && return 0
  if wg show "${WG_IFACE}" >/dev/null 2>&1; then
    wg syncconf "${WG_IFACE}" <(wg-quick strip "${SERVER_CONF}")
  fi
}

next_client_octet() {
  local octet
  for octet in $(seq 2 254); do
    if ! grep -q "AllowedIPs = ${WG_NET}\.${octet}/32" "${SERVER_CONF}"; then
      echo "${octet}"
      return
    fi
  done
  die "subnet ${WG_NET}.0/24 is full (253 clients)"
}

server_install() {
  need_root
  [[ -e "${SERVER_CONF}" ]] &&
    die "${SERVER_CONF} already exists — use 'add-client NAME' to add devices"
  ensure_tools
  command -v wg >/dev/null || die "wireguard-tools not available after install"

  mkdir -p "${CLIENTS_DIR}"

  local endpoint egress server_priv server_pub
  endpoint="$(get_endpoint)"
  egress="$(egress_iface)"
  [[ -n "$egress" ]] || die "could not detect the default network interface"
  server_priv="$(wg genkey)"
  server_pub="$(wg pubkey <<<"${server_priv}")"

  cat > "${SERVER_CONF}" <<EOF
# Managed by setup-wireguard.sh — add/remove peers with that script.
[Interface]
Address = ${WG_NET}.1/24
ListenPort = ${WG_PORT}
PrivateKey = ${server_priv}
PostUp = iptables -t nat -A POSTROUTING -s ${WG_NET}.0/24 -o ${egress} -j MASQUERADE; iptables -A INPUT -p udp --dport ${WG_PORT} -j ACCEPT; iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s ${WG_NET}.0/24 -o ${egress} -j MASQUERADE; iptables -D INPUT -p udp --dport ${WG_PORT} -j ACCEPT; iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT
EOF

  enable_forwarding
  open_firewall

  if [[ "${WG_DIR}" = "/etc/wireguard" ]]; then
    run systemctl enable --now "wg-quick@${WG_IFACE}"
  else
    echo "note: WG_DIR is not /etc/wireguard — skipping systemctl (test mode)"
  fi

  echo
  echo "==> WireGuard server is up: ${endpoint}:${WG_PORT} (udp), tunnel net ${WG_NET}.0/24"
  echo "==> If your VPS provider has a cloud firewall (AWS/DO/Hetzner/...), also open"
  echo "    UDP ${WG_PORT} there — that is the #1 reason handshakes fail."

  if [[ "${WG_SKIP_FIRST_CLIENT:-0}" != "1" ]]; then
    add_client "${FIRST_CLIENT}"
  fi
}

add_client() {
  need_root
  local name="${1:-}"
  [[ -n "$name" ]] || die "usage: $0 add-client NAME"
  validate_name "$name"
  [[ -e "${SERVER_CONF}" ]] || die "server not installed yet — run: $0 install"
  command -v wg >/dev/null || die "wireguard-tools not installed — run: $0 install"
  grep -q "^# BEGIN_PEER ${name}\$" "${SERVER_CONF}" &&
    die "client '${name}' already exists (see: $0 show-client ${name})"

  mkdir -p "${CLIENTS_DIR}"
  local endpoint octet client_priv client_pub psk server_pub
  endpoint="$(get_endpoint)"
  octet="$(next_client_octet)"
  client_priv="$(wg genkey)"
  client_pub="$(wg pubkey <<<"${client_priv}")"
  psk="$(wg genpsk)"
  server_pub="$(awk '/^PrivateKey/ {print $3; exit}' "${SERVER_CONF}" | wg pubkey)"

  cat >> "${SERVER_CONF}" <<EOF

# BEGIN_PEER ${name}
[Peer]
PublicKey = ${client_pub}
PresharedKey = ${psk}
AllowedIPs = ${WG_NET}.${octet}/32
# END_PEER ${name}
EOF

  local client_conf="${CLIENTS_DIR}/${name}.conf"
  cat > "${client_conf}" <<EOF
[Interface]
PrivateKey = ${client_priv}
Address = ${WG_NET}.${octet}/32
DNS = ${WG_DNS}

[Peer]
PublicKey = ${server_pub}
PresharedKey = ${psk}
Endpoint = ${endpoint}:${WG_PORT}
AllowedIPs = ${WG_ALLOWED_IPS}
PersistentKeepalive = 25
EOF

  live_reload

  echo
  echo "==> Client '${name}' created (${WG_NET}.${octet}). Config: ${client_conf}"
  print_qr "${client_conf}"
  echo "==> On the phone: install the official WireGuard app, tap '+' -> 'Scan from"
  echo "    QR code', scan the code above, then enable the tunnel."
  echo "==> Verify: with the tunnel on, https://ifconfig.me should show ${endpoint}."
}

print_qr() {
  local conf="$1"
  if command -v qrencode >/dev/null; then
    qrencode -t ansiutf8 < "${conf}"
  else
    echo "(qrencode not installed — import this config manually:)"
    cat "${conf}"
  fi
}

show_client() {
  local name="${1:-}"
  [[ -n "$name" ]] || die "usage: $0 show-client NAME"
  validate_name "$name"
  local conf="${CLIENTS_DIR}/${name}.conf"
  [[ -e "$conf" ]] || die "no such client '${name}' (see: $0 list-clients)"
  print_qr "$conf"
  echo "==> Config file: ${conf}"
}

list_clients() {
  [[ -e "${SERVER_CONF}" ]] || die "server not installed yet — run: $0 install"
  awk '/^# BEGIN_PEER / {print $3}' "${SERVER_CONF}"
}

remove_client() {
  need_root
  local name="${1:-}"
  [[ -n "$name" ]] || die "usage: $0 remove-client NAME"
  validate_name "$name"
  grep -q "^# BEGIN_PEER ${name}\$" "${SERVER_CONF}" 2>/dev/null ||
    die "no such client '${name}' (see: $0 list-clients)"
  sed -i "/^# BEGIN_PEER ${name}\$/,/^# END_PEER ${name}\$/d" "${SERVER_CONF}"
  rm -f "${CLIENTS_DIR}/${name}.conf"
  live_reload
  echo "==> Client '${name}' removed and access revoked."
}

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  local cmd="${1:-install}"
  case "$cmd" in
    install) server_install ;;
    add-client) add_client "${2:-}" ;;
    show-client) show_client "${2:-}" ;;
    list-clients) list_clients ;;
    remove-client) remove_client "${2:-}" ;;
    help|-h|--help) usage ;;
    *) die "unknown command '${cmd}' (try: $0 help)" ;;
  esac
}

main "$@"

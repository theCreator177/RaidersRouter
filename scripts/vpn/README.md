# Phone VPN setup — three options

Three legitimate ways to get a VPN on your phone, from zero-effort to
self-hosted. Nothing here requires sideloading an APK — the phone side is always
the **official** WireGuard / Tailscale / vendor app from your app store.

| Option                                  | Effort | Cost      | Best for                                     |
| --------------------------------------- | ------ | --------- | -------------------------------------------- |
| A. Reputable app (Proton VPN, WARP)     | 2 min  | free      | "I just want privacy on public Wi-Fi"        |
| B. Your own WireGuard server (this dir) | 15 min | ~$5/month | full control, you own the exit IP            |
| C. Tailscale mesh                       | 5 min  | free      | reaching your own PC/home network from phone |

---

## Option A — reputable provider app (no terminal needed)

Install **Proton VPN** (free tier) or **Cloudflare 1.1.1.1 + WARP** from the
App Store / Play Store, sign in, toggle on. Done. Skip the rest of this page.

## Option B — your own WireGuard server

You rent a small VPS, run one script on it, and scan a QR code with the
official WireGuard app. You own the server; no third party sees your traffic.

### 1. Rent a VPS

Any ~$5/month Linux VPS works (Hetzner, DigitalOcean, Vultr, Linode, ...).
Pick **Ubuntu 24.04 LTS**, the smallest size, a region near you. You get a
public IP and SSH access.

### 2. Run the installer

SSH in and run the script from this directory:

```bash
ssh root@YOUR_VPS_IP

# on the VPS:
curl -fsSLO https://raw.githubusercontent.com/theCreator177/RaidersRouter/HEAD/scripts/vpn/setup-wireguard.sh
sudo bash setup-wireguard.sh
```

(Or copy it over yourself: `scp scripts/vpn/setup-wireguard.sh root@YOUR_VPS_IP:`)

The script installs WireGuard, configures NAT + IP forwarding, starts the
`wg-quick@wg0` service, creates a first client named **phone**, and prints a
QR code in the terminal.

### 3. Connect the phone

1. Install the official **WireGuard** app (App Store / Play Store).
2. Tap **+** → **Scan from QR code** → scan the code in your terminal.
3. Enable the tunnel.
4. Verify: visit <https://ifconfig.me> — it should show your VPS IP.

### Managing devices

```bash
sudo bash setup-wireguard.sh add-client laptop     # new device + QR
sudo bash setup-wireguard.sh show-client phone     # re-print a QR
sudo bash setup-wireguard.sh list-clients
sudo bash setup-wireguard.sh remove-client laptop  # revoke access
```

### Tunables

Set env vars before the command, e.g. `WG_PORT=443 sudo -E bash setup-wireguard.sh`:

| Variable          | Default            | Purpose                                    |
| ----------------- | ------------------ | ------------------------------------------ |
| `WG_PORT`         | `51820`            | UDP port (`443` helps on restrictive networks) |
| `WG_DNS`          | `1.1.1.1,1.0.0.1`  | DNS pushed to clients                      |
| `WG_ALLOWED_IPS`  | `0.0.0.0/0, ::/0`  | routes everything; `::/0` blocks IPv6 leaks |
| `SERVER_ENDPOINT` | auto-detected      | set explicitly if the VPS is behind NAT    |
| `WG_DRY_RUN`      | `0`                | `1` = preview system changes, still generate configs |

### Troubleshooting

- **Handshake never completes**: 90% of the time the provider's *cloud
  firewall* (separate from the OS) is blocking UDP 51820 — open it in the
  provider dashboard. Check with `sudo wg show` on the server (look for
  `latest handshake`).
- **Hotel/campus Wi-Fi blocks it**: reinstall with `WG_PORT=443`.
- **Connected but no internet**: confirm `sysctl net.ipv4.ip_forward` is `1`
  and the `PostUp` iptables rules exist (`sudo iptables -t nat -L POSTROUTING`).
- **Server security basics**: keep the box patched (`unattended-upgrades`),
  use SSH keys, don't run anything else on it.

## Option C — Tailscale (reach your own PC from your phone)

If the actual goal is "grab files off my rig remotely", you don't need an exit
VPS at all — Tailscale links your devices into a private WireGuard mesh:

```bash
# on your PC (Linux/macOS; Windows has an installer at tailscale.com/download):
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Then install the **Tailscale** app on the phone, log in with the same account,
and your PC is reachable at its `100.x.y.z` address (or MagicDNS name) from
anywhere. Free for personal use, no port forwarding, no public exposure.

---

**Why not "a VPN off GitHub" on the phone itself?** A VPN app can read all
your traffic, so only official app-store builds of audited clients are worth
trusting. Everything above follows that rule: unofficial code runs only on the
server *you* own.

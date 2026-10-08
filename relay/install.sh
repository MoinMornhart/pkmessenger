#!/usr/bin/env bash
# PKMessenger-Relay – Installer für Debian/Proxmox-LXC. Idempotent.
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Morni-Team/pkmessenger/main/relay/install.sh)"
set -euo pipefail

REPO="https://github.com/Morni-Team/pkmessenger"
APP_DIR="/opt/pkmessenger-relay"
SERVICE="pkmessenger-relay"
PORT="${PORT:-8787}"

msg() { echo -e "\e[1;32m➜\e[0m $*"; }
warn() { echo -e "\e[1;33m!\e[0m $*"; }
[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen."; exit 1; }

msg "Pakete installieren (curl, git, node)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates >/dev/null
if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]]; then
  msg "Node.js 20 LTS installieren…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

if [[ -d "$APP_DIR/.git" ]]; then
  msg "Vorhandene Installation aktualisieren…"
  git -C "$APP_DIR" fetch --all --prune -q
  git -C "$APP_DIR" reset --hard "origin/main" -q
else
  msg "Repository nach $APP_DIR klonen…"
  rm -rf "$APP_DIR"
  git clone -q --depth 1 "$REPO" "$APP_DIR"
fi

msg "Abhängigkeiten installieren…"
( cd "$APP_DIR/relay" && npm ci --omit=dev --silent || npm install --omit=dev --silent )

# update-Befehl bereitstellen
install -m 755 "$APP_DIR/relay/update.sh" /usr/bin/update

# systemd-Dienst (lauscht nur lokal; TLS/Domain macht dein Reverse-Proxy)
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=PKMessenger Relay (verschlüsselnder WebSocket-Vermittler)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR/relay
ExecStart=/usr/bin/node server.js
Environment=PORT=$PORT
Environment=HOST=127.0.0.1
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$SERVICE" >/dev/null

msg "Fertig. Der Relay läuft lokal auf 127.0.0.1:$PORT (WebSocket unter /ws)."
warn "Jetzt noch deinen Reverse-Proxy (Nginx/Caddy) auf deine Domain zeigen lassen – siehe docs/proxmox-quickstart.md."
echo "   Status:  systemctl status $SERVICE"
echo "   Logs:    journalctl -u $SERVICE -f"
echo "   Update:  update"

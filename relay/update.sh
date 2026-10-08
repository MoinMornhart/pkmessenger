#!/usr/bin/env bash
# Aktualisiert den PKMessenger-Relay auf die neueste Version aus Git und startet ihn neu.  Aufruf:  update
set -euo pipefail
APP_DIR="/opt/pkmessenger-relay"
SERVICE="pkmessenger-relay"

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen."; exit 1; }

echo "➜ Hole neueste Version aus Git …"
cd "$APP_DIR"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch --all --prune -q
git reset --hard "origin/${BRANCH}" -q

echo "➜ Abhängigkeiten …"
( cd "$APP_DIR/relay" && npm ci --omit=dev --silent || npm install --omit=dev --silent )

echo "➜ update-Befehl aktualisiert sich selbst mit …"
install -m 755 "$APP_DIR/relay/update.sh" /usr/bin/update

echo "➜ Dienst neu starten …"
systemctl daemon-reload
systemctl restart "$SERVICE"

echo "✔ Update fertig — $(git rev-parse --short HEAD) ($(git log -1 --format=%cd --date=short))"

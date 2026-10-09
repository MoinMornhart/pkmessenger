# PKMessenger-Relay als Container.
# Build-Kontext ist das REPO-Wurzelverzeichnis (wegen src/help-web, das der Relay mit ausliefert):
#   docker build -f relay/Dockerfile -t pkmessenger-relay .
# Einfacher per docker compose (siehe relay/docker-compose.yml) – das setzt den Kontext automatisch.
FROM node:20-alpine

WORKDIR /app

# Nur die Relay-Abhängigkeit (ws), reproduzierbar über das Lockfile.
COPY relay/package.json relay/package-lock.json ./
RUN npm ci --omit=dev

# Relay-Code + die Helfer-Oberfläche. server.js erwartet sie unter ../src/help-web,
# bei __dirname=/app also unter /src/help-web.
COPY relay/core.js relay/server.js ./
COPY src/help-web /src/help-web

ENV HOST=0.0.0.0 \
    PORT=8787
EXPOSE 8787

# Nicht als root laufen.
USER node

# Health-Check gegen die Status-Seite (kein Token, keine Daten).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]

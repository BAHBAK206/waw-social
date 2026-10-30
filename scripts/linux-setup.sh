#!/usr/bin/env bash
# Qubedu first-time setup on Linux / Ubuntu (also inside WSL2). Needs Docker Engine with the compose plugin.
# Usage:  bash scripts/linux-setup.sh [domain] [admin-email]
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="${1:-}"
EMAIL="${2:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install it with:  curl -fsSL https://get.docker.com | sudo sh" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running (or you need sudo). Try:  sudo service docker start   and   sudo usermod -aG docker \$USER  (then open a new terminal)." >&2
  exit 1
fi

secret() { head -c 200 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c "$1"; }

if [ -f .env ]; then
  echo ".env already exists, keeping it (delete it first for a fresh one)."
else
  [ -n "$EMAIL" ] || read -rp "Your email (you become the site administrator): " EMAIL
  [ -n "$DOMAIN" ] || read -rp "Your domain, e.g. qubedu.com (Enter to try it only on this computer): " DOMAIN
  cp .env.example .env
  setenv() { sed -i "s|^$1=.*|$1=$2|" .env; }
  setenv JWT_SECRET "$(secret 64)"
  setenv INTERNAL_TOKEN "$(secret 48)"
  setenv POSTGRES_PASSWORD "$(secret 32)"
  setenv ROOT_ADMIN_EMAIL "$EMAIL"
  if [ -n "$DOMAIN" ]; then
    setenv APP_URL "https://$DOMAIN"
    setenv API_PUBLIC_URL "https://$DOMAIN"
    setenv REALTIME_PUBLIC_URL "wss://$DOMAIN/ws"
    setenv CORS_ORIGINS "https://$DOMAIN"
    setenv TRUST_PROXY_HOPS 2
  fi
  chmod 600 .env
  echo ".env created with random secrets. Keep it private."
fi

echo "Starting Qubedu. The first time takes 10-20 minutes..."
docker compose up -d --build
echo "Done. Open http://localhost:8080"

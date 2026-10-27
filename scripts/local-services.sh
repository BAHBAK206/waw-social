#!/usr/bin/env bash
# Starts PostgreSQL and Redis locally without Docker (for development and tests).
# Usage: bash scripts/local-services.sh start|stop|status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.local"
PGDATA="$DATA/pg"
PGPORT="${PGPORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"
mkdir -p "$DATA"

# PostgreSQL refuses to run as root: delegate to the 'postgres' system user when needed.
as_pg() {
  if [ "$(id -u)" = "0" ]; then
    su postgres -s /bin/bash -c "PATH='$PATH' $*"
  else
    bash -c "$*"
  fi
}

start_pg() {
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    mkdir -p "$PGDATA"
    [ "$(id -u)" = "0" ] && chown -R postgres "$PGDATA" && chmod 700 "$PGDATA"
    as_pg "initdb -D '$PGDATA' -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
  fi
  if ! as_pg "pg_ctl -D '$PGDATA' status" >/dev/null 2>&1; then
    touch "$DATA/pg.log"; [ "$(id -u)" = "0" ] && chown postgres "$DATA/pg.log"
    as_pg "pg_ctl -D '$PGDATA' -l '$DATA/pg.log' -o '-p $PGPORT -k /tmp -c listen_addresses=localhost' -w start >/dev/null"
  fi
  psql -h localhost -p "$PGPORT" -U postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='qubedu'" | grep -q 1 \
    || psql -h localhost -p "$PGPORT" -U postgres -c "CREATE ROLE qubedu LOGIN SUPERUSER PASSWORD 'qubedu'" >/dev/null
  for db in qubedu qubedu_test; do
    psql -h localhost -p "$PGPORT" -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
      || psql -h localhost -p "$PGPORT" -U postgres -c "CREATE DATABASE $db OWNER qubedu" >/dev/null
  done
  echo "postgres: postgres://qubedu:qubedu@localhost:$PGPORT/qubedu"
}

start_redis() {
  if command -v redis-server >/dev/null; then
    if ! redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; then
      redis-server --port "$REDIS_PORT" --daemonize yes --dir "$DATA" --logfile "$DATA/redis.log" >/dev/null
    fi
    echo "redis: redis://localhost:$REDIS_PORT"
  else
    echo "redis: not installed (API falls back to in-memory mode)"
  fi
}

case "${1:-start}" in
  start) start_pg; start_redis ;;
  stop)
    as_pg "pg_ctl -D '$PGDATA' stop -m fast" >/dev/null 2>&1 || true
    redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
    echo stopped ;;
  status)
    as_pg "pg_ctl -D '$PGDATA' status" || true
    redis-cli -p "$REDIS_PORT" ping || true ;;
  *) echo "usage: $0 start|stop|status"; exit 1 ;;
esac

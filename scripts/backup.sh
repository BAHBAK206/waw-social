#!/usr/bin/env sh
# Daily backup: the database (pg_dump custom format) and, with local storage, the uploaded files.
# Keeps the last KEEP_DAYS days. Copy BACKUP_DIR to another machine or bucket for off-site safety.
#
#   DATABASE_URL=postgres://… BACKUP_DIR=/var/backups/qubedu STORAGE_DIR=/var/lib/qubedu/storage ./scripts/backup.sh
#
# Optional: ALERT_WEBHOOK_URL (a failure is announced there), KEEP_DAYS (default 14).
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

fail() {
  echo "backup failed: $1" >&2
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    msg="⚠️ Qubedu backup failed: $1"
    payload="{\"text\":\"$msg\",\"content\":\"$msg\"}"
    if command -v curl >/dev/null 2>&1; then
      curl -fsS -m 10 -H 'content-type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
    else
      wget -q -T 10 -O /dev/null --header='content-type: application/json' --post-data="$payload" "$ALERT_WEBHOOK_URL" || true
    fi
  fi
  exit 1
}

: "${DATABASE_URL:?DATABASE_URL is required}"

DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$DB_FILE.part" || fail "database dump"
mv "$DB_FILE.part" "$DB_FILE"

if [ -n "${STORAGE_DIR:-}" ] && [ -d "$STORAGE_DIR" ]; then
  tar -czf "$BACKUP_DIR/files-$STAMP.tar.gz.part" -C "$STORAGE_DIR" . || fail "files archive"
  mv "$BACKUP_DIR/files-$STAMP.tar.gz.part" "$BACKUP_DIR/files-$STAMP.tar.gz"
fi

# Retention
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete

# Let the admin console show when the last backup ran.
SIZE="$(du -k "$DB_FILE" | cut -f1)"
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "insert into site_settings (key, value) values ('lastBackup', jsonb_build_object('at', now(), 'file', '$(basename "$DB_FILE")', 'sizeKb', $SIZE)) on conflict (key) do update set value = excluded.value, updated_at = now();" >/dev/null 2>&1 || true

echo "backup ok: $DB_FILE"

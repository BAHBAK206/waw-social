#!/usr/bin/env sh
# Restores a backup made by scripts/backup.sh. Stop the API first.
#
#   DATABASE_URL=postgres://… ./scripts/restore.sh backups/db-20261028-030000.dump [backups/files-20261028-030000.tar.gz]
#
# With a files archive, STORAGE_DIR must point to the local storage folder.
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
DB_FILE="${1:?usage: restore.sh <db-dump> [files-archive]}"

printf 'This replaces every table in %s. Type "restore" to continue: ' "$(echo "$DATABASE_URL" | sed 's#//[^@]*@#//***@#')"
read -r answer
[ "$answer" = "restore" ] || { echo "cancelled"; exit 1; }

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$DB_FILE"
if [ -n "${2:-}" ]; then
  : "${STORAGE_DIR:?STORAGE_DIR is required to restore files}"
  mkdir -p "$STORAGE_DIR"
  tar -xzf "$2" -C "$STORAGE_DIR"
fi
echo "restored"

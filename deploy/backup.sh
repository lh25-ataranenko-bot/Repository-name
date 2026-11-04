#!/bin/sh
# Daily PostgreSQL dump with 14-day retention. Runs inside the "backup" service.
set -eu
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
while true; do
  file="${BACKUP_DIR:-/backups}/autowise-$(date +%Y-%m-%d_%H%M).sql.gz"
  if pg_dump --no-owner --clean --if-exists | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "backup ok: $file"
  else
    rm -f "$file.tmp"
    echo "backup FAILED" >&2
  fi
  find "${BACKUP_DIR:-/backups}" -name 'autowise-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done

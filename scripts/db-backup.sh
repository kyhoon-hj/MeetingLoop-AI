#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-35}"
case "$retention_days" in (*[!0-9]*|'') echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2; exit 1;; esac
mkdir -p "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_dir/meetingloop-$timestamp.dump"
temporary="$target.partial"
umask 077
trap 'rm -f "$temporary"' EXIT

pg_dump "$DATABASE_URL" --format=custom --compress=9 --no-owner --no-acl --file="$temporary"
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$target"
sha256sum "$target" > "$target.sha256"
find "$backup_dir" -type f \( -name 'meetingloop-*.dump' -o -name 'meetingloop-*.dump.sha256' \) -mtime "+$retention_days" -delete
echo "backup complete: $(basename "$target")"

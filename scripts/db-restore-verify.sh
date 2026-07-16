#!/bin/sh
set -eu

if [ -z "${RESTORE_DATABASE_URL:-}" ] || [ -z "${BACKUP_FILE:-}" ]; then
  echo "RESTORE_DATABASE_URL and BACKUP_FILE are required" >&2
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "BACKUP_FILE does not exist" >&2
  exit 1
fi
if [ -n "${DATABASE_URL:-}" ] && [ "$RESTORE_DATABASE_URL" = "$DATABASE_URL" ]; then
  echo "RESTORE_DATABASE_URL must not be the production DATABASE_URL" >&2
  exit 1
fi

if [ -f "$BACKUP_FILE.sha256" ]; then
  sha256sum -c "$BACKUP_FILE.sha256"
fi

pg_restore --dbname="$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-acl "$BACKUP_FILE"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from schema_migrations where filename = '0007_privacy_retention_operations.sql') then
    raise exception 'RESTORE_REQUIRED_MIGRATION_MISSING';
  end if;
  if exists (
    select 1 from transcripts t left join meetings m
      on m.organization_id = t.organization_id and m.id = t.meeting_id
    where m.id is null
  ) then
    raise exception 'RESTORE_TRANSCRIPT_ORPHAN_DETECTED';
  end if;
  if exists (
    select 1 from meeting_minutes mm left join meetings m
      on m.organization_id = mm.organization_id and m.id = mm.meeting_id
    where m.id is null
  ) then
    raise exception 'RESTORE_MINUTES_ORPHAN_DETECTED';
  end if;
end
$$;
SQL
echo "restore verification complete"

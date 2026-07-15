create extension if not exists pg_trgm;

alter table organizations
  add constraint organizations_retention_days_range_check
  check (retention_days between 30 and 3650);

alter table meetings
  add constraint meetings_time_range_check
  check (ended_at is null or ended_at >= started_at);

alter table participants
  add constraint participants_identity_confidence_range_check
  check (identity_confidence is null or identity_confidence between 0 and 1);

alter table agendas
  add constraint agendas_time_range_check
  check (end_ms >= start_ms);

alter table recordings
  drop column if exists storage_key,
  drop column if exists checksum,
  drop column if exists upload_status,
  add column if not exists storage_policy text not null default 'LOCAL_ONLY';

alter table recordings
  add constraint recordings_storage_policy_check
  check (storage_policy = 'LOCAL_ONLY');

create table if not exists transcripts (
  id text primary key,
  organization_id text not null,
  meeting_id text not null unique,
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'DELETED')),
  version integer not null default 1 check (version > 0),
  confirmed_by text not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transcripts_organization_id_fkey foreign key (organization_id) references organizations(id) on delete cascade,
  constraint transcripts_meeting_id_fkey foreign key (meeting_id) references meetings(id) on delete cascade,
  constraint transcripts_confirmed_by_fkey foreign key (confirmed_by) references users(id) on delete restrict
);

insert into transcripts (
  id,
  organization_id,
  meeting_id,
  status,
  version,
  confirmed_by,
  confirmed_at,
  created_at,
  updated_at
)
select
  'transcript-' || md5(segments.meeting_id),
  segments.organization_id,
  segments.meeting_id,
  'CONFIRMED',
  1,
  min(segments.edited_by),
  max(segments.updated_at),
  min(segments.created_at),
  max(segments.updated_at)
from transcript_segments segments
group by segments.organization_id, segments.meeting_id
on conflict (meeting_id) do nothing;

alter table transcript_segments add column if not exists transcript_id text;

update transcript_segments segments
set transcript_id = transcripts.id
from transcripts
where transcripts.meeting_id = segments.meeting_id
  and segments.transcript_id is null;

drop index if exists transcript_segments_meeting_sequence_idx;

alter table transcript_segments
  drop constraint if exists transcript_segments_organization_id_fkey,
  drop constraint if exists transcript_segments_meeting_id_fkey,
  drop column if exists organization_id,
  drop column if exists meeting_id,
  alter column transcript_id set not null,
  add constraint transcript_segments_transcript_id_fkey
    foreign key (transcript_id) references transcripts(id) on delete cascade,
  add constraint transcript_segments_time_range_check
    check (end_ms >= start_ms);

alter table transcript_segments
  drop constraint if exists transcript_segments_edited_by_fkey,
  add constraint transcript_segments_edited_by_fkey
    foreign key (edited_by) references users(id) on delete restrict;

create unique index if not exists transcript_segments_transcript_sequence_idx
  on transcript_segments(transcript_id, sequence);

create table if not exists transcript_revisions (
  id text primary key,
  transcript_id text not null references transcripts(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (transcript_id, version)
);

alter table meeting_minutes
  add column if not exists version integer not null default 1,
  add column if not exists updated_by text;

update meeting_minutes
set updated_by = created_by
where updated_by is null;

alter table meeting_minutes
  alter column updated_by set not null,
  add constraint meeting_minutes_version_check check (version > 0),
  add constraint meeting_minutes_updated_by_fkey
    foreign key (updated_by) references users(id) on delete restrict;

create table if not exists meeting_minutes_revisions (
  id text primary key,
  meeting_minutes_id text not null references meeting_minutes(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (meeting_minutes_id, version)
);

alter table memberships
  drop constraint if exists memberships_organization_id_fkey,
  drop constraint if exists memberships_user_id_fkey,
  add constraint memberships_organization_id_fkey
    foreign key (organization_id) references organizations(id) on delete cascade,
  add constraint memberships_user_id_fkey
    foreign key (user_id) references users(id) on delete cascade;

alter table projects
  drop constraint if exists projects_organization_id_fkey,
  drop constraint if exists projects_created_by_fkey,
  add constraint projects_organization_id_fkey
    foreign key (organization_id) references organizations(id) on delete cascade,
  add constraint projects_created_by_fkey
    foreign key (created_by) references users(id) on delete restrict;

alter table meetings
  drop constraint if exists meetings_organization_id_fkey,
  drop constraint if exists meetings_project_id_fkey,
  drop constraint if exists meetings_created_by_fkey,
  drop constraint if exists meetings_approved_by_fkey,
  add constraint meetings_organization_id_fkey
    foreign key (organization_id) references organizations(id) on delete cascade,
  add constraint meetings_project_id_fkey
    foreign key (project_id) references projects(id) on delete restrict,
  add constraint meetings_created_by_fkey
    foreign key (created_by) references users(id) on delete restrict,
  add constraint meetings_approved_by_fkey
    foreign key (approved_by) references users(id) on delete set null;

alter table participants
  drop constraint if exists participants_meeting_id_fkey,
  drop constraint if exists participants_user_id_fkey,
  add constraint participants_meeting_id_fkey
    foreign key (meeting_id) references meetings(id) on delete cascade,
  add constraint participants_user_id_fkey
    foreign key (user_id) references users(id) on delete set null;

alter table agendas
  drop constraint if exists agendas_meeting_id_fkey,
  drop constraint if exists agendas_parent_agenda_id_fkey,
  add constraint agendas_meeting_id_fkey
    foreign key (meeting_id) references meetings(id) on delete cascade,
  add constraint agendas_parent_agenda_id_fkey
    foreign key (parent_agenda_id) references agendas(id) on delete set null;

alter table recordings
  drop constraint if exists recordings_meeting_id_fkey,
  add constraint recordings_meeting_id_fkey
    foreign key (meeting_id) references meetings(id) on delete cascade;

alter table meeting_minutes
  drop constraint if exists meeting_minutes_organization_id_fkey,
  drop constraint if exists meeting_minutes_meeting_id_fkey,
  drop constraint if exists meeting_minutes_created_by_fkey,
  add constraint meeting_minutes_organization_id_fkey
    foreign key (organization_id) references organizations(id) on delete cascade,
  add constraint meeting_minutes_meeting_id_fkey
    foreign key (meeting_id) references meetings(id) on delete cascade,
  add constraint meeting_minutes_created_by_fkey
    foreign key (created_by) references users(id) on delete restrict;

create unique index if not exists users_email_lower_unique_idx on users(lower(email));
create index if not exists meetings_organization_started_at_idx
  on meetings(organization_id, started_at desc, id desc);
create index if not exists meetings_organization_status_started_at_idx
  on meetings(organization_id, status, started_at desc);
create index if not exists transcripts_organization_status_updated_at_idx
  on transcripts(organization_id, status, updated_at desc);
create index if not exists meeting_minutes_organization_status_updated_at_idx
  on meeting_minutes(organization_id, status, updated_at desc);

create index if not exists meetings_title_trgm_idx
  on meetings using gin (title gin_trgm_ops);
create index if not exists participants_display_name_trgm_idx
  on participants using gin (display_name gin_trgm_ops);
create index if not exists transcript_segments_edited_text_trgm_idx
  on transcript_segments using gin (edited_text gin_trgm_ops);
create index if not exists meeting_minutes_search_trgm_idx
  on meeting_minutes using gin (
    (title || ' ' || summary || ' ' || key_points::text || ' ' || discussion_topics::text || ' ' ||
     decisions::text || ' ' || action_items::text || ' ' || risks::text || ' ' || open_questions::text)
    gin_trgm_ops
  );

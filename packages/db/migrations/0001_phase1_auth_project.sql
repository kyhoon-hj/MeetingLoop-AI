create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  timezone text not null default 'Asia/Seoul',
  retention_days integer not null default 365,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  locale text not null default 'ko',
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists memberships (
  id text primary key,
  organization_id text not null references organizations(id),
  user_id text not null references users(id),
  role text not null check (role in ('ORG_ADMIN', 'PROJECT_ADMIN', 'EDITOR', 'MEMBER', 'VIEWER', 'EXTERNAL')),
  status text not null check (status in ('ACTIVE', 'INVITED', 'DISABLED')),
  created_at timestamptz not null,
  unique (organization_id, user_id)
);

create table if not exists projects (
  id text primary key,
  organization_id text not null references organizations(id),
  name text not null,
  key text not null,
  description text not null default '',
  status text not null check (status in ('ACTIVE', 'ARCHIVED')),
  created_by text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, key)
);

create index if not exists memberships_user_id_idx on memberships(user_id);
create index if not exists projects_organization_id_status_idx on projects(organization_id, status);

create table if not exists meetings (
  id text primary key,
  organization_id text not null references organizations(id),
  project_id text not null references projects(id),
  title text not null,
  title_status text not null check (title_status in ('PROVISIONAL', 'CONFIRMED')),
  meeting_type text not null check (meeting_type in ('REQUIREMENTS', 'WEEKLY', 'DECISION', 'REVIEW', 'GENERAL')),
  status text not null check (status in ('DRAFT', 'RECORDING', 'UPLOADING', 'PROCESSING', 'REVIEW', 'APPROVED', 'FAILED', 'ARCHIVED')),
  started_at timestamptz not null,
  ended_at timestamptz,
  timezone text not null default 'Asia/Seoul',
  source_type text not null check (source_type in ('BROWSER_RECORDING', 'FILE_UPLOAD', 'IMPORT')),
  recording_consent_at timestamptz,
  created_by text not null references users(id),
  approved_by text references users(id),
  approved_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists participants (
  id text primary key,
  meeting_id text not null references meetings(id),
  user_id text references users(id),
  display_name text not null,
  role_label text not null default '',
  organization_label text not null default '',
  speaker_cluster_id text,
  identity_status text not null check (identity_status in ('UNKNOWN', 'SUGGESTED', 'CONFIRMED')),
  identity_confidence numeric,
  identity_source text not null check (identity_source in ('MANUAL', 'CALENDAR', 'SELF_INTRO', 'VOICE_PROFILE', 'UNKNOWN')),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists agendas (
  id text primary key,
  meeting_id text not null references meetings(id),
  parent_agenda_id text references agendas(id),
  title text not null,
  summary text not null default '',
  sequence integer not null,
  start_ms integer not null default 0,
  end_ms integer not null default 0,
  status text not null check (status in ('PLANNED', 'DETECTED', 'CONFIRMED')),
  source text not null check (source in ('PRESET', 'AI', 'USER')),
  confidence numeric,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists recordings (
  id text primary key,
  meeting_id text not null references meetings(id),
  storage_key text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  duration_ms integer not null,
  checksum text not null,
  upload_status text not null check (upload_status in ('PENDING', 'UPLOADING', 'COMPLETED', 'FAILED')),
  processing_status text not null check (processing_status in ('DRAFT', 'RECORDING', 'UPLOADING', 'PROCESSING', 'REVIEW', 'APPROVED', 'FAILED', 'ARCHIVED')),
  created_at timestamptz not null
);

create table if not exists transcript_segments (
  id text primary key,
  organization_id text not null references organizations(id),
  meeting_id text not null references meetings(id),
  sequence integer not null,
  speaker_label text not null,
  start_ms integer not null default 0,
  end_ms integer not null default 0,
  raw_text text not null,
  edited_text text not null,
  source text not null check (source in ('LIVE', 'MANUAL', 'STT')),
  status text not null check (status in ('DRAFT', 'CONFIRMED', 'DELETED')),
  edited_by text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists meeting_minutes (
  id text primary key,
  organization_id text not null references organizations(id),
  meeting_id text not null references meetings(id),
  title text not null,
  summary text not null,
  key_points jsonb not null,
  discussion_topics jsonb not null default '[]'::jsonb,
  decisions jsonb not null,
  action_items jsonb not null,
  risks jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  source text not null check (source in ('TRANSCRIPT_TEXT')),
  status text not null check (status in ('DRAFT', 'CONFIRMED')),
  created_by text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (meeting_id)
);

create index if not exists meetings_organization_project_status_idx on meetings(organization_id, project_id, status);
create index if not exists participants_meeting_id_idx on participants(meeting_id);
create index if not exists agendas_meeting_sequence_idx on agendas(meeting_id, sequence);
create index if not exists recordings_meeting_id_idx on recordings(meeting_id);
create index if not exists transcript_segments_meeting_sequence_idx on transcript_segments(meeting_id, sequence);
create index if not exists meeting_minutes_organization_meeting_idx on meeting_minutes(organization_id, meeting_id);

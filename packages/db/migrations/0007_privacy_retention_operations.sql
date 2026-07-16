-- Stage 7 privacy, consent, retention and operational audit schema.
-- Audio and browser draft data remain outside the server under decisions D1-D3.

alter table meetings
  add column recording_consent_by text,
  add column recording_consent_version text;

update meetings
set recording_consent_by = created_by,
    recording_consent_version = '2026-07-16'
where recording_consent_at is not null;

alter table meetings
  add constraint meetings_recording_consent_by_fkey
    foreign key (recording_consent_by) references users(id) on delete restrict,
  add constraint meetings_recording_consent_complete_check
    check (
      (recording_consent_at is null and recording_consent_by is null and recording_consent_version is null)
      or
      (recording_consent_at is not null and recording_consent_by is not null and recording_consent_version is not null)
    );

create table privacy_audit_events (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  meeting_id text,
  actor_id text references users(id) on delete set null,
  event_type text not null check (event_type in (
    'RECORDING_CONSENT_RECORDED',
    'EXTERNAL_AI_CONSENT_RECORDED',
    'MEETING_DELETION_REQUESTED',
    'RETENTION_DELETION_SCHEDULED',
    'MEETING_PURGED'
  )),
  policy_version text not null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint privacy_audit_events_idempotency_format_check check (
    idempotency_key is null or (
      length(idempotency_key) between 8 and 160
      and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    )
  )
);

create unique index privacy_audit_events_actor_idempotency_idx
  on privacy_audit_events(organization_id, actor_id, event_type, idempotency_key)
  where actor_id is not null and idempotency_key is not null;

create index privacy_audit_events_organization_created_at_idx
  on privacy_audit_events(organization_id, created_at desc);

create index privacy_audit_events_meeting_created_at_idx
  on privacy_audit_events(organization_id, meeting_id, created_at desc);

create table external_ai_consents (
  id text primary key,
  organization_id text not null,
  meeting_id text not null,
  actor_id text not null references users(id) on delete restrict,
  provider text not null check (provider = 'gemini'),
  data_scope text not null check (data_scope = 'CONFIRMED_TRANSCRIPT'),
  policy_version text not null,
  consented_at timestamptz not null default now(),
  constraint external_ai_consents_organization_meeting_fkey
    foreign key (organization_id, meeting_id)
    references meetings(organization_id, id)
    on delete cascade,
  unique (organization_id, meeting_id, actor_id, provider, policy_version)
);

create index external_ai_consents_meeting_idx
  on external_ai_consents(organization_id, meeting_id, consented_at desc);

create table meeting_deletion_requests (
  id text primary key,
  organization_id text not null,
  meeting_id text not null,
  requested_by text references users(id) on delete set null,
  reason text not null check (reason in ('USER_REQUEST', 'RETENTION_EXPIRED')),
  requested_at timestamptz not null default now(),
  purge_after timestamptz not null,
  constraint meeting_deletion_requests_organization_meeting_fkey
    foreign key (organization_id, meeting_id)
    references meetings(organization_id, id)
    on delete cascade,
  unique (organization_id, meeting_id),
  check (purge_after >= requested_at)
);

create index meeting_deletion_requests_purge_after_idx
  on meeting_deletion_requests(purge_after, organization_id, meeting_id);

create index meetings_retention_candidate_idx
  on meetings(organization_id, coalesce(ended_at, created_at));

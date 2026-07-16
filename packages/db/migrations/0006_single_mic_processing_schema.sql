-- Stage 2 policy-compliant persistence hardening.
-- Raw audio, recognition drafts, audio quality/VAD/overlap/speaker candidates and review drafts
-- intentionally remain browser-only under decisions D1-D3.

alter table transcripts
  add constraint transcripts_organization_meeting_id_key
    unique (organization_id, meeting_id, id);

alter table transcript_segments
  add column organization_id text,
  add column meeting_id text;

update transcript_segments segments
set organization_id = transcripts.organization_id,
    meeting_id = transcripts.meeting_id
from transcripts
where transcripts.id = segments.transcript_id;

alter table transcript_segments
  alter column organization_id set not null,
  alter column meeting_id set not null,
  drop constraint transcript_segments_transcript_id_fkey,
  add constraint transcript_segments_organization_transcript_id_fkey
    foreign key (organization_id, meeting_id, transcript_id)
    references transcripts(organization_id, meeting_id, id)
    on delete cascade;

create index transcript_segments_organization_meeting_sequence_idx
  on transcript_segments(organization_id, meeting_id, sequence);

alter table transcript_revisions
  add column organization_id text,
  add column meeting_id text;

update transcript_revisions revisions
set organization_id = transcripts.organization_id,
    meeting_id = transcripts.meeting_id
from transcripts
where transcripts.id = revisions.transcript_id;

alter table transcript_revisions
  alter column organization_id set not null,
  alter column meeting_id set not null,
  drop constraint transcript_revisions_transcript_id_fkey,
  add constraint transcript_revisions_organization_transcript_id_fkey
    foreign key (organization_id, meeting_id, transcript_id)
    references transcripts(organization_id, meeting_id, id)
    on delete cascade;

create index transcript_revisions_organization_meeting_created_at_idx
  on transcript_revisions(organization_id, meeting_id, created_at desc);

alter table meeting_minutes
  add constraint meeting_minutes_organization_meeting_id_key
    unique (organization_id, meeting_id, id);

alter table meeting_minutes_revisions
  add column organization_id text,
  add column meeting_id text;

update meeting_minutes_revisions revisions
set organization_id = minutes.organization_id,
    meeting_id = minutes.meeting_id
from meeting_minutes minutes
where minutes.id = revisions.meeting_minutes_id;

alter table meeting_minutes_revisions
  alter column organization_id set not null,
  alter column meeting_id set not null,
  drop constraint meeting_minutes_revisions_meeting_minutes_id_fkey,
  add constraint meeting_minutes_revisions_organization_minutes_id_fkey
    foreign key (organization_id, meeting_id, meeting_minutes_id)
    references meeting_minutes(organization_id, meeting_id, id)
    on delete cascade;

create index meeting_minutes_revisions_organization_meeting_created_at_idx
  on meeting_minutes_revisions(organization_id, meeting_id, created_at desc);

create table content_mutation_receipts (
  id text primary key,
  organization_id text not null,
  meeting_id text not null,
  actor_id text not null,
  operation text not null check (operation in ('SAVE_TRANSCRIPT', 'SAVE_MINUTES')),
  idempotency_key text not null check (
    length(idempotency_key) between 8 and 160
    and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('IN_PROGRESS', 'COMPLETED')),
  response_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_mutation_receipts_organization_meeting_fkey
    foreign key (organization_id, meeting_id)
    references meetings(organization_id, id)
    on delete cascade,
  constraint content_mutation_receipts_actor_id_fkey
    foreign key (actor_id)
    references users(id)
    on delete restrict,
  constraint content_mutation_receipts_completed_response_check
    check ((status = 'IN_PROGRESS' and response_json is null) or (status = 'COMPLETED' and response_json is not null)),
  unique (organization_id, actor_id, operation, idempotency_key)
);

create index content_mutation_receipts_retention_idx
  on content_mutation_receipts(organization_id, created_at);

create index content_mutation_receipts_meeting_operation_idx
  on content_mutation_receipts(organization_id, meeting_id, operation, created_at desc);

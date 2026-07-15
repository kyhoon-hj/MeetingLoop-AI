alter table projects
  add constraint projects_organization_id_id_key unique (organization_id, id);

alter table meetings
  add constraint meetings_organization_id_id_key unique (organization_id, id),
  drop constraint if exists meetings_project_id_fkey,
  add constraint meetings_organization_project_id_fkey
    foreign key (organization_id, project_id)
    references projects(organization_id, id)
    on delete restrict;

alter table transcripts
  drop constraint if exists transcripts_meeting_id_fkey,
  add constraint transcripts_organization_meeting_id_fkey
    foreign key (organization_id, meeting_id)
    references meetings(organization_id, id)
    on delete cascade;

alter table meeting_minutes
  drop constraint if exists meeting_minutes_meeting_id_fkey,
  add constraint meeting_minutes_organization_meeting_id_fkey
    foreign key (organization_id, meeting_id)
    references meetings(organization_id, id)
    on delete cascade;

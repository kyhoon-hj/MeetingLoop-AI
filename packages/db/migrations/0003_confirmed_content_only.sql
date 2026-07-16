alter table transcript_segments
  drop constraint if exists transcript_segments_status_check;

alter table transcript_segments
  add constraint transcript_segments_status_check
  check (status in ('CONFIRMED', 'DELETED'));

alter table meeting_minutes
  drop constraint if exists meeting_minutes_status_check;

alter table meeting_minutes
  add constraint meeting_minutes_status_check
  check (status = 'CONFIRMED');

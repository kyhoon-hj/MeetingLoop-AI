-- Only the user-confirmed transcript is persisted. Recognition drafts remain in the browser.
alter table transcript_segments drop column if exists raw_text;

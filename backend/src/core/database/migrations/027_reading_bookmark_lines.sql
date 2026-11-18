alter table reading_bookmark_entries
  add column start_offset integer not null default 0 check (start_offset between 0 and 10000000),
  add column end_offset integer check (end_offset is null or (end_offset > start_offset and end_offset <= 10000000));

alter table reading_bookmark_entries
  drop constraint reading_bookmark_entries_user_id_chapter_id_paragraph_index_key,
  add constraint reading_bookmark_entries_line_unique unique (user_id, chapter_id, paragraph_index, start_offset);

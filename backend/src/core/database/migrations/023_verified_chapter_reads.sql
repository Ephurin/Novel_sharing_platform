-- Earlier PR builds could seed rows from unverified resume pointers. Keep those
-- rows for compatibility, but only an authorized content GET may verify them.
alter table chapter_reads add column if not exists verified_at timestamptz;

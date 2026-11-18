create table if not exists reading_bookmark_entries (
  bookmark_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id) on delete cascade,
  novel_id uuid not null references novels(novel_id) on delete cascade,
  chapter_id uuid not null references chapters(chapter_id) on delete cascade,
  paragraph_index integer not null check (paragraph_index between 0 and 1000000),
  page_offset numeric(5,4) not null default 0 check (page_offset between 0 and 1),
  excerpt varchar(500) not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, chapter_id, paragraph_index)
);
create index if not exists reading_bookmark_entries_user_novel on reading_bookmark_entries(user_id, novel_id, updated_at desc, bookmark_id);

insert into reading_bookmark_entries(user_id, novel_id, chapter_id, paragraph_index, page_offset, updated_at)
select user_id, novel_id, chapter_id, paragraph_index, page_offset, updated_at from reading_position_bookmarks
on conflict do nothing;

alter table reading_preferences
  add column if not exists margin_size integer not null default 24 check (margin_size between 0 and 80),
  add column if not exists text_align varchar(8) not null default 'LEFT' check (text_align in ('LEFT', 'CENTER', 'RIGHT', 'JUSTIFY'));

create table if not exists reading_position_bookmarks (
  user_id uuid not null references users(user_id) on delete cascade,
  novel_id uuid not null references novels(novel_id) on delete cascade,
  chapter_id uuid not null references chapters(chapter_id) on delete cascade,
  paragraph_index integer not null default 0 check (paragraph_index between 0 and 1000000),
  page_offset numeric(5,4) not null default 0 check (page_offset between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, novel_id)
);

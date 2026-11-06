create table if not exists chapter_reads (
  user_id uuid not null references users(user_id) on delete cascade,
  chapter_id uuid not null references chapters(chapter_id) on delete cascade,
  novel_id uuid not null references novels(novel_id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create index if not exists idx_chapter_reads_user_novel on chapter_reads(user_id, novel_id);

-- Resume pointers are not proof that content was opened. Do not backfill them.

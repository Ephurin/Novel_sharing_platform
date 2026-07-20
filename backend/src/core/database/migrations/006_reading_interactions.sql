create table if not exists reading_preferences (
  user_id uuid primary key references users(user_id) on delete cascade,
  font_family varchar(80),
  font_size integer not null default 18 check (font_size between 10 and 40),
  background varchar(30) not null default 'LIGHT',
  line_height numeric(3,2) not null default 1.60 check (line_height between 1.00 and 3.00),
  updated_at timestamptz not null default now()
);

create table if not exists reading_histories (
  reading_history_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id) on delete cascade,
  novel_id uuid not null references novels(novel_id) on delete cascade,
  chapter_id uuid not null references chapters(chapter_id) on delete cascade,
  paragraph_index integer not null default 0 check (paragraph_index >= 0),
  page_offset numeric(5,4) check (page_offset is null or (page_offset >= 0 and page_offset <= 1)),
  read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, novel_id)
);

create index if not exists idx_reading_histories_user_updated on reading_histories(user_id, updated_at desc);

create table if not exists bookmarks (
  user_id uuid not null references users(user_id) on delete cascade,
  novel_id uuid not null references novels(novel_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, novel_id)
);

create index if not exists idx_bookmarks_user_created on bookmarks(user_id, created_at desc);

create table if not exists likes (
  user_id uuid not null references users(user_id) on delete cascade,
  novel_id uuid not null references novels(novel_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, novel_id)
);

create index if not exists idx_likes_novel on likes(novel_id);

create table if not exists follows (
  follower_id uuid not null references users(user_id) on delete cascade,
  author_id uuid not null references users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_id),
  check (follower_id <> author_id)
);

create index if not exists idx_follows_author on follows(author_id);

create table if not exists novel_follows (
  novel_id uuid not null references novels(novel_id) on delete cascade,
  user_id uuid not null references users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (novel_id, user_id)
);

create table if not exists novel_ratings (
  novel_id uuid not null references novels(novel_id) on delete cascade,
  user_id uuid not null references users(user_id) on delete cascade,
  score smallint not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (novel_id, user_id)
);

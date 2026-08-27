do $$
begin
  if not exists (select 1 from pg_type where typname = 'novel_serial_status') then
    create type novel_serial_status as enum ('ONGOING', 'COMPLETED', 'HIATUS');
  end if;

  if not exists (select 1 from pg_type where typname = 'novel_status') then
    create type novel_status as enum ('DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED');
  end if;

  if not exists (select 1 from pg_type where typname = 'age_rating') then
    create type age_rating as enum ('EVERYONE', 'TEEN', 'MATURE');
  end if;
end $$;

create table if not exists genres (
  genre_id uuid primary key default gen_random_uuid(),
  name varchar(100) unique not null,
  slug varchar(100) unique not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists tags (
  tag_id uuid primary key default gen_random_uuid(),
  name varchar(100) unique not null,
  slug varchar(100) unique not null,
  created_at timestamptz not null default now()
);

create table if not exists novels (
  novel_id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users(user_id),
  title varchar(255) not null,
  slug varchar(255) unique not null,
  synopsis text not null,
  cover_image_url text,
  genre_id uuid references genres(genre_id),
  serial_status novel_serial_status not null default 'ONGOING',
  status novel_status not null default 'DRAFT',
  age_rating age_rating not null default 'TEEN',
  likes_count integer not null default 0,
  views_count integer not null default 0,
  chapters_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_novels_author_status on novels(author_id, status);
create index if not exists idx_novels_status_updated on novels(status, updated_at);
create index if not exists idx_novels_genre_status on novels(genre_id, status);

create table if not exists novel_tags (
  novel_id uuid not null references novels(novel_id) on delete cascade,
  tag_id uuid not null references tags(tag_id),
  created_at timestamptz not null default now(),
  primary key (novel_id, tag_id)
);

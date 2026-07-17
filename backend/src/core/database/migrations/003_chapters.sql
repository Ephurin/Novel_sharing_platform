do $$
begin
  if not exists (select 1 from pg_type where typname = 'chapter_status') then
    create type chapter_status as enum ('DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
  end if;
end $$;

create table if not exists chapters (
  chapter_id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels(novel_id) on delete cascade,
  title varchar(100) not null,
  chapter_number integer not null,
  content text,
  word_count integer not null default 0,
  is_vip boolean not null default false,
  price_coins integer not null default 0 check (price_coins >= 0),
  status chapter_status not null default 'DRAFT',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (novel_id, chapter_number)
);

create index if not exists idx_chapters_novel_number on chapters(novel_id, chapter_number);
create index if not exists idx_chapters_status_published on chapters(status, published_at);

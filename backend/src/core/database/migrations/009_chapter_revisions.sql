do $$
begin
  if not exists (select 1 from pg_type where typname = 'revision_source_type') then
    create type revision_source_type as enum ('AUTHOR_MANUAL', 'AI_DRAFT_ACCEPT', 'BOOTSTRAP');
  end if;
end $$;

create table if not exists chapter_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels(novel_id) on delete cascade,
  chapter_id uuid not null references chapters(chapter_id) on delete cascade,
  parent_revision_id uuid references chapter_revisions(revision_id) on delete set null,
  content_hash varchar(64) not null,
  content text not null,
  word_count integer not null default 0,
  source_type revision_source_type not null default 'AUTHOR_MANUAL',
  source_generation_id varchar(128),
  created_by uuid references users(user_id) on delete set null,
  created_at timestamptz not null default now()
);

alter table chapters add column if not exists latest_revision_id uuid references chapter_revisions(revision_id) on delete set null;

create index if not exists idx_chapter_revisions_chapter on chapter_revisions(chapter_id, created_at desc);
create index if not exists idx_chapter_revisions_novel on chapter_revisions(novel_id);
create index if not exists idx_chapter_revisions_hash on chapter_revisions(content_hash);
create unique index if not exists idx_chapter_revisions_gen_id on chapter_revisions(chapter_id, source_generation_id) where source_generation_id is not null;

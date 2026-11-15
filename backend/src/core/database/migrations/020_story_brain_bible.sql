-- Stable links separate approved Canon from the author's editable Bible details.
alter table character_profiles alter column name type varchar(255);

create table story_brain_bible_links (
  novel_id uuid not null references novels(novel_id) on delete cascade,
  artifact_kind text not null check (artifact_kind in ('entity', 'event', 'relation')),
  artifact_id text not null,
  bible_id uuid not null,
  source_snapshot jsonb not null,
  owns_bible_row boolean not null,
  is_active boolean not null default true,
  primary key (novel_id, artifact_kind, artifact_id)
);
create index idx_brain_bible_rows on story_brain_bible_links(novel_id, artifact_kind, bible_id);

create table story_brain_bible_sync (
  novel_id uuid primary key references novels(novel_id) on delete cascade,
  brain_version bigint not null,
  synced_at timestamptz not null default now()
);

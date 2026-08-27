do $$
begin
  if not exists (select 1 from pg_type where typname = 'context_source') then
    create type context_source as enum ('AUTHOR_MANUAL', 'AICOPILOT_SUGGESTION');
  end if;

  if not exists (select 1 from pg_type where typname = 'character_role') then
    create type character_role as enum ('PROTAGONIST', 'ANTAGONIST', 'SUPPORTING', 'MINOR');
  end if;

  if not exists (select 1 from pg_type where typname = 'plot_summary_scope') then
    create type plot_summary_scope as enum ('NOVEL', 'ARC', 'CHAPTER');
  end if;
end $$;

create table if not exists character_profiles (
  character_id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels(novel_id) on delete cascade,
  name varchar(120) not null,
  role character_role not null,
  personality text,
  description text,
  notes text,
  source context_source not null default 'AUTHOR_MANUAL',
  source_proposal_id uuid,
  created_by uuid not null references users(user_id),
  updated_by uuid not null references users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_character_profiles_novel_name on character_profiles(novel_id, name);
create index if not exists idx_character_profiles_novel_role on character_profiles(novel_id, role);

create table if not exists character_relationships (
  relationship_id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels(novel_id) on delete cascade,
  source_character_id uuid not null references character_profiles(character_id) on delete cascade,
  target_character_id uuid not null references character_profiles(character_id) on delete cascade,
  relationship_type varchar(80) not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_relationships_distinct_characters check (source_character_id <> target_character_id)
);

create index if not exists idx_character_relationships_novel on character_relationships(novel_id);
create index if not exists idx_character_relationships_source on character_relationships(source_character_id);
create index if not exists idx_character_relationships_target on character_relationships(target_character_id);

create table if not exists story_timeline_events (
  event_id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels(novel_id) on delete cascade,
  chapter_id uuid references chapters(chapter_id) on delete set null,
  title varchar(255) not null,
  event_order integer not null,
  summary text not null,
  source context_source not null default 'AUTHOR_MANUAL',
  source_proposal_id uuid,
  created_by uuid not null references users(user_id),
  updated_by uuid not null references users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_story_timeline_events_novel_order on story_timeline_events(novel_id, event_order);
create index if not exists idx_story_timeline_events_chapter on story_timeline_events(chapter_id);

create table if not exists plot_summaries (
  summary_id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels(novel_id) on delete cascade,
  chapter_id uuid references chapters(chapter_id) on delete set null,
  scope plot_summary_scope not null,
  arc_name varchar(120),
  start_chapter_number integer,
  end_chapter_number integer,
  summary text not null,
  source context_source not null default 'AUTHOR_MANUAL',
  source_proposal_id uuid,
  created_by uuid not null references users(user_id),
  updated_by uuid not null references users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint plot_summaries_chapter_scope_requires_chapter check (
    scope <> 'CHAPTER' or chapter_id is not null
  ),
  constraint plot_summaries_arc_scope_requires_arc_name check (
    scope <> 'ARC' or arc_name is not null
  )
);

create index if not exists idx_plot_summaries_novel_scope_arc on plot_summaries(novel_id, scope, arc_name, start_chapter_number);
create index if not exists idx_plot_summaries_chapter on plot_summaries(chapter_id);

create unique index if not exists uq_plot_summaries_current_novel
on plot_summaries(novel_id)
where scope = 'NOVEL' and deleted_at is null;

create unique index if not exists uq_plot_summaries_current_arc
on plot_summaries(novel_id, arc_name)
where scope = 'ARC' and deleted_at is null;

create unique index if not exists uq_plot_summaries_current_chapter
on plot_summaries(chapter_id)
where scope = 'CHAPTER' and deleted_at is null;

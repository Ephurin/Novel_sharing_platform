create table if not exists revision_outbox_events (
  event_id uuid primary key default gen_random_uuid(),
  event_type varchar(50) not null,
  novel_id uuid not null references novels(novel_id) on delete cascade,
  chapter_id uuid not null references chapters(chapter_id) on delete cascade,
  revision_id uuid not null references chapter_revisions(revision_id) on delete cascade,
  content_hash varchar(64) not null,
  created_by uuid references users(user_id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'PENDING',
  retry_count integer not null default 0,
  max_retries integer not null default 5,
  next_retry_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outbox_status_retry on revision_outbox_events(status, next_retry_at) where status in ('PENDING', 'RETRYING');
create unique index if not exists idx_outbox_revision_event on revision_outbox_events(revision_id, event_type);

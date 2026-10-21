alter table user_profiles add column if not exists banner_url text;
alter table user_profiles add column if not exists publishing_schedule varchar(500);
alter table moderation_reviews add column if not exists submitted_content jsonb;
create table if not exists notification_events (
  event_key varchar(200) primary key,
  user_id uuid not null references users(user_id) on delete cascade,
  type varchar(80) not null,
  title text not null,
  content text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists idx_notification_events_pending on notification_events(created_at) where delivered_at is null;
create table if not exists chapter_publication_schedules (
  chapter_id uuid primary key references chapters(chapter_id) on delete cascade,
  schedule_id uuid not null default gen_random_uuid(),
  scheduled_at timestamptz not null,
  draft_version integer not null,
  status varchar(30) not null check (status in ('PENDING','PUBLISHED','PENDING_MODERATION','FAILED','CANCELLED')),
  error text,
  moderation_review_id uuid references moderation_reviews(review_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_chapter_schedules_due on chapter_publication_schedules(scheduled_at) where status = 'PENDING';

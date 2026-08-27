do $$
begin
  if not exists (select 1 from pg_type where typname = 'filter_rule_status') then
    create type filter_rule_status as enum ('ACTIVE', 'INACTIVE');
  end if;

  if not exists (select 1 from pg_type where typname = 'moderation_target_type') then
    create type moderation_target_type as enum ('NOVEL', 'CHAPTER', 'COMMENT', 'USER');
  end if;

  if not exists (select 1 from pg_type where typname = 'moderation_source') then
    create type moderation_source as enum ('KEYWORD_FILTER', 'USER_REPORT');
  end if;

  if not exists (select 1 from pg_type where typname = 'moderation_status') then
    create type moderation_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_target_type') then
    create type report_target_type as enum ('NOVEL', 'CHAPTER', 'COMMENT', 'USER');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type report_status as enum ('OPEN', 'RESOLVED', 'REJECTED');
  end if;
end $$;

create table if not exists content_filter_rules (
  rule_id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  pattern text not null,
  category varchar(100) not null,
  severity varchar(50) not null,
  status filter_rule_status not null default 'ACTIVE',
  created_by uuid references users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_filter_rules_status_severity on content_filter_rules(status, severity);
create index if not exists idx_content_filter_rules_category on content_filter_rules(category);

create table if not exists moderation_reviews (
  review_id uuid primary key default gen_random_uuid(),
  target_type moderation_target_type not null,
  target_id text not null,
  source moderation_source not null,
  status moderation_status not null default 'PENDING',
  evidence_id text,
  reviewed_by uuid references users(user_id),
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_moderation_reviews_target_status on moderation_reviews(target_type, status);
create index if not exists idx_moderation_reviews_target_id on moderation_reviews(target_type, target_id);
create index if not exists idx_moderation_reviews_source_status on moderation_reviews(source, status);

create table if not exists reports (
  report_id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(user_id),
  target_type report_target_type not null,
  target_id text not null,
  review_id uuid references moderation_reviews(review_id),
  reason text not null,
  status report_status not null default 'OPEN',
  resolved_by uuid references users(user_id),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reports_target_status on reports(target_type, target_id, status);
create index if not exists idx_reports_reporter_created on reports(reporter_id, created_at);

insert into content_filter_rules (name, pattern, category, severity)
values
  ('Demo toxic keyword', 'badword', 'TOXIC_LANGUAGE', 'HIGH'),
  ('Demo harassment keyword', 'harassment', 'HARASSMENT', 'MEDIUM')
on conflict do nothing;

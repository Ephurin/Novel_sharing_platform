-- Reports that moderators cannot decide on their own go to Admin through one
-- escalation per pending review; resolved escalations stay readable as history.
create table moderation_escalations (
  escalation_id uuid primary key default gen_random_uuid(),
  review_id uuid not null references moderation_reviews(review_id),
  proposed_by uuid not null references users(user_id),
  proposed_action text not null check(proposed_action in ('WARN','LOCK')),
  reason text not null,
  status text not null default 'OPEN' check(status in ('OPEN','EXECUTED','DISMISSED')),
  resolution text,
  resolved_by uuid references users(user_id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index moderation_escalations_open_review on moderation_escalations(review_id) where status='OPEN';
create index moderation_escalations_queue on moderation_escalations(status,created_at desc);

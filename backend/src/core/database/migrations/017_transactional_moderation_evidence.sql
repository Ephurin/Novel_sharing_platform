-- Publication evidence shares the review/chapter/schedule transaction.
-- Legacy evidence remains readable from MongoDB.
create table if not exists moderation_evidence (
  evidence_id varchar(24) primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

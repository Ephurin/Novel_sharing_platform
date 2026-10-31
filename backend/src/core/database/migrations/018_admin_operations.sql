create table admin_access (
  user_id uuid primary key references users(user_id),
  scope text not null check(scope in ('SUPER_ADMIN','MODERATOR','USER_MANAGER','FINANCE')),
  updated_by uuid references users(user_id), updated_at timestamptz not null default now()
);
-- Existing administrators retain full access; future access changes are explicit.
insert into admin_access(user_id,scope) select user_id,'SUPER_ADMIN' from users where role='ADMIN';

create table admin_audit (
  audit_id uuid primary key default gen_random_uuid(), actor_id uuid references users(user_id),
  action text not null, target_type text not null, target_id text not null,
  affected_user_id uuid references users(user_id), reason text,
  before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
create index admin_audit_target on admin_audit(target_type,target_id,created_at desc);
create index admin_audit_owner on admin_audit(affected_user_id,created_at desc);
create index admin_audit_actor on admin_audit(actor_id,created_at desc);
create function protect_admin_history() returns trigger language plpgsql as $$
begin raise exception 'Administrative history is append-only' using errcode='55000'; end;
$$;
create trigger admin_audit_immutable before update or delete on admin_audit for each row execute function protect_admin_history();

create table admin_sanctions (
  sanction_id uuid primary key default gen_random_uuid(), audit_id uuid unique not null references admin_audit(audit_id),
  review_id uuid references moderation_reviews(review_id), target_type text not null,
  target_id text not null, owner_id uuid not null references users(user_id),
  action text not null check(action in ('WARN','HIDE','LOCK')), previous_state jsonb,
  active boolean not null default true, restored_at timestamptz, restored_by uuid references users(user_id),
  created_at timestamptz not null default now()
);
create unique index admin_active_sanction on admin_sanctions(target_type,target_id) where active and action in ('HIDE','LOCK');

create table admin_appeals (
  appeal_id uuid primary key default gen_random_uuid(), audit_id uuid not null references admin_audit(audit_id),
  user_id uuid not null references users(user_id), message text not null,
  status text not null default 'OPEN' check(status in ('OPEN','ACCEPTED','REJECTED')),
  resolution text, reviewed_by uuid references users(user_id), reviewed_at timestamptz,
  created_at timestamptz not null default now(), unique(audit_id,user_id)
);
create index admin_appeals_queue on admin_appeals(status,created_at desc);

-- Durable MongoDB side effects and notifications; decisions and audit commit together in PostgreSQL.
create table admin_jobs (
  job_order bigserial unique,
  job_id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('COMMENT_SYNC','NOTIFY')),
  payload jsonb not null, status text not null default 'PENDING' check(status in ('PENDING','DONE')),
  attempts integer not null default 0, error text, created_at timestamptz not null default now(), completed_at timestamptz
);
create index admin_jobs_pending on admin_jobs(created_at) where status='PENDING';

create table withdraw_reconciliation (
  withdraw_request_id uuid primary key references withdraw_requests(withdraw_request_id),
  status text not null check(status in ('UNCONFIRMED','PROCESSING','PAID','FAILED')) default 'UNCONFIRMED',
  reference text, evidence_url text, note text, updated_by uuid references users(user_id),
  version integer not null default 0, updated_at timestamptz not null default now()
);
create unique index withdraw_paid_reference on withdraw_reconciliation(lower(trim(reference))) where status='PAID';
create table withdraw_reconciliation_history (
  event_id uuid primary key default gen_random_uuid(), withdraw_request_id uuid not null references withdraw_requests(withdraw_request_id),
  actor_id uuid not null references users(user_id), before_state jsonb, after_state jsonb not null,
  created_at timestamptz not null default now()
);
create trigger reconciliation_history_immutable before update or delete on withdraw_reconciliation_history for each row execute function protect_admin_history();

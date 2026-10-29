-- Additive upgrade: retain pending/done jobs and their identity/idempotency keys.
alter table admin_jobs drop constraint admin_jobs_status_check;
alter table admin_jobs add constraint admin_jobs_status_check check(status in ('PENDING','DONE','FAILED'));
alter table admin_jobs add column next_attempt_at timestamptz not null default now();
alter table admin_jobs add column last_attempt_at timestamptz;
alter table admin_jobs add column failed_at timestamptz;
alter table admin_jobs add column retry_count integer not null default 0 check(retry_count>=0);
drop index admin_jobs_pending;
create index admin_jobs_due on admin_jobs(next_attempt_at,job_order) where status='PENDING';

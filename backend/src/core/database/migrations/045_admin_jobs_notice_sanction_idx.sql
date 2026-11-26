-- Report-outcome dedupe lookups run inside the sanction transaction while the
-- target's advisory and row locks are held; keep them off the unbounded job
-- history. Only notification jobs carrying a sanction reference are indexed.
create index admin_jobs_notice_sanction_idx
  on admin_jobs ((payload->>'type'), (payload->'payload'->>'sanctionId'))
  where kind='NOTIFY' and payload->'payload'->>'sanctionId' is not null;

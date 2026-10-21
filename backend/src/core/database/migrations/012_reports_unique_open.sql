-- Migration 012: Ensure a reporter cannot have multiple unresolved OPEN reports for the same target
-- Preflight: Check for existing duplicate OPEN reports. If found, fail closed with clear remediation instructions rather than silently deleting data.
do $$
declare
  dup_reports integer;
begin
  select count(*) into dup_reports from (
    select reporter_id, target_type, target_id
    from reports
    where status = 'OPEN'
    group by reporter_id, target_type, target_id
    having count(*) > 1
  ) dups;

  if dup_reports > 0 then
    raise exception 'Migration 012 halted: found % group(s) of duplicate OPEN reports. Manual remediation required: review and resolve duplicate open reports before applying idx_reports_open_reporter_target.', dup_reports;
  end if;
end $$;

create unique index if not exists idx_reports_open_reporter_target
  on reports(reporter_id, target_type, target_id)
  where status = 'OPEN';

-- Preflight: Check for existing duplicate PENDING reviews for the same target and source.
do $$
declare
  dup_reviews integer;
begin
  select count(*) into dup_reviews from (
    select target_type, target_id, source
    from moderation_reviews
    where status = 'PENDING'
    group by target_type, target_id, source
    having count(*) > 1
  ) dups;

  if dup_reviews > 0 then
    raise exception 'Migration 012 halted: found % group(s) of duplicate PENDING moderation reviews. Manual remediation required before applying idx_moderation_reviews_pending_target_source.', dup_reviews;
  end if;
end $$;

create unique index if not exists idx_moderation_reviews_pending_target_source
  on moderation_reviews(target_type, target_id, source)
  where status = 'PENDING';


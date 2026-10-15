-- Ensure a reporter cannot have multiple unresolved OPEN reports for the same target
create unique index if not exists idx_reports_open_reporter_target
  on reports(reporter_id, target_type, target_id)
  where status = 'OPEN';

create table novel_featured_placements (
  placement_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references novel_selection_cases(case_id),
  novel_id uuid not null references novels(novel_id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  priority integer not null check (priority between 0 and 100),
  version integer not null default 1 check (version > 0),
  cancelled_at timestamptz,
  created_by uuid not null references users(user_id),
  idempotency_key text not null,
  create_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (created_by,idempotency_key),
  check (ends_at > starts_at and ends_at <= starts_at + interval '336 hours')
);

create index novel_placements_windows on novel_featured_placements(novel_id,starts_at,ends_at)
  where cancelled_at is null;
create index novel_placements_public_order on novel_featured_placements(priority desc,starts_at,placement_id)
  include (ends_at,case_id,novel_id) where cancelled_at is null;
create index novel_placements_start on novel_featured_placements(starts_at) where cancelled_at is null;
create index novel_placements_case on novel_featured_placements(case_id,ends_at) where cancelled_at is null;
create index novel_placements_history on novel_featured_placements(starts_at desc,placement_id desc);

create function cancel_invalid_novel_placements() returns trigger language plpgsql as $$
declare
  cancelled record;
  instant timestamptz := clock_timestamp();
begin
  if old.status='SELECTED' and new.status <> 'SELECTED' then
    for cancelled in
      update novel_featured_placements set cancelled_at=instant,version=version+1
      where case_id=new.case_id and cancelled_at is null and ends_at>instant
      returning placement_id,version
    loop
      insert into admin_audit(actor_id,action,target_type,target_id,reason,before_state,after_state)
        values(null,'PLACEMENT_AUTO_CANCEL','FEATURED_PLACEMENT',cancelled.placement_id::text,
          'Tác phẩm không còn ở trạng thái được tuyển chọn.',
          jsonb_build_object('version',cancelled.version-1),
          jsonb_build_object('version',cancelled.version,'cancelledAt',instant,'selectionVersion',new.version));
    end loop;
  end if;
  return null;
end;
$$;

create trigger cancel_invalid_novel_placements after update of status on novel_selection_cases
  for each row execute function cancel_invalid_novel_placements();

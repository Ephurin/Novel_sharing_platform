create table novel_selection_reconsiderations (
  reconsideration_id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  decision_version integer not null,
  decision_status text not null check (decision_status in ('REJECTED','REVOKED')),
  effective_at timestamptz not null,
  requester_id uuid not null references users(user_id),
  reason text not null check (char_length(reason) between 1 and 2000),
  status text not null default 'OPEN' check (status in ('OPEN','ACCEPTED','REJECTED')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null,
  reviewer_id uuid references users(user_id),
  resolution text,
  resolved_at timestamptz,
  unique (case_id, decision_version),
  foreign key (case_id, decision_version) references novel_selection_events(case_id, version),
  check ((status='OPEN' and reviewer_id is null and resolution is null and resolved_at is null)
    or (status<>'OPEN' and reviewer_id is not null and resolution is not null and resolved_at is not null))
);

create index selection_reconsideration_rate on novel_selection_reconsiderations(requester_id, created_at desc);
create index selection_reconsideration_queue on novel_selection_reconsiderations(status, created_at desc, reconsideration_id desc);

create function selection_reconsideration_deadline(effective_at timestamptz) returns timestamptz
  language sql immutable as $$ select effective_at + interval '336 hours' $$;

create function selection_reconsideration_in_window(effective_at timestamptz, candidate timestamptz) returns boolean
  language sql immutable as $$
  select effective_at <= candidate and candidate < selection_reconsideration_deadline(effective_at)
$$;

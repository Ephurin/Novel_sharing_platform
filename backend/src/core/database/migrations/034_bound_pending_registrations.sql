alter table pending_email_registrations
  add column deadline_at timestamptz,
  add column resends_used smallint not null default 0 check (resends_used between 0 and 3);

update pending_email_registrations set deadline_at = requested_at + interval '1 hour';
alter table pending_email_registrations alter column deadline_at set not null;
create index pending_email_registrations_deadline_idx on pending_email_registrations (deadline_at);

create table registration_email_delivery_budget (
  email varchar(255) primary key,
  window_started_at timestamptz not null,
  sent_count smallint not null check (sent_count between 1 and 5)
);
create index registration_email_delivery_budget_window_idx on registration_email_delivery_budget (window_started_at);

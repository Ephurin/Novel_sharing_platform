alter table pending_email_registrations
  add column channel text not null default 'web'
  check (channel in ('web', 'native'));

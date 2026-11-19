create table if not exists pending_email_registrations (
  email varchar(255) primary key,
  registration_id uuid not null unique,
  username varchar(50) not null,
  password_hash text not null,
  code_hash text not null,
  attempts integer not null default 0,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_pending_email_registrations_expiry
  on pending_email_registrations (expires_at);

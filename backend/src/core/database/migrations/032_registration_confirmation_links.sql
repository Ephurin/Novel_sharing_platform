alter table pending_email_registrations
  add column if not exists link_token_hash text;

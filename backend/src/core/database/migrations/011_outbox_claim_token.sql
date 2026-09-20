alter table revision_outbox_events
  add column if not exists claim_token uuid;

create index if not exists idx_outbox_claim_token on revision_outbox_events(claim_token) where claim_token is not null;

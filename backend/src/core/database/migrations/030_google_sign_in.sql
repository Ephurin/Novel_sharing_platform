create unique index if not exists idx_users_oauth_identity
  on users (oauth_provider, oauth_subject)
  where oauth_provider is not null and oauth_subject is not null;

create table if not exists consumed_google_challenges (
  nonce text primary key,
  expires_at timestamptz not null
);
create index if not exists idx_consumed_google_challenges_expiry on consumed_google_challenges (expires_at);

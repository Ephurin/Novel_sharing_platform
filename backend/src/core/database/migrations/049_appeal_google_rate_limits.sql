create table appeal_google_rate_limits (
  scope text not null,
  bucket_key text not null,
  attempt_count integer not null check (attempt_count > 0),
  reset_at timestamptz not null,
  primary key (scope, bucket_key)
);

create index appeal_google_rate_limits_reset_at_idx on appeal_google_rate_limits (reset_at);

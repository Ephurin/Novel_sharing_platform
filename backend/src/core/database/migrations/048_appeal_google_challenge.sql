alter table consumed_google_challenges
  add column if not exists purpose varchar(30) not null default 'login';

alter table consumed_google_challenges
  drop constraint if exists consumed_google_challenges_pkey;

alter table consumed_google_challenges
  add constraint consumed_google_challenges_pkey primary key (nonce, purpose);

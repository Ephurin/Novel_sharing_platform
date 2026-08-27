create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('READER', 'AUTHOR', 'ADMIN');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type user_status as enum ('ACTIVE', 'LOCKED', 'DELETED');
  end if;
end $$;

create table if not exists schema_migrations (
  migration_id varchar(255) primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  user_id uuid primary key default gen_random_uuid(),
  email varchar(255) unique not null,
  username varchar(50) unique not null,
  password_hash text,
  role user_role not null default 'READER',
  status user_status not null default 'ACTIVE',
  oauth_provider varchar(50),
  oauth_subject varchar(255),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_users_role_status on users(role, status);

create table if not exists user_profiles (
  user_id uuid primary key references users(user_id) on delete cascade,
  display_name varchar(100),
  bio text,
  avatar_url text,
  language varchar(10) not null default 'vi',
  notification_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  refresh_token_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_refresh_tokens_user_expires on refresh_tokens(user_id, expires_at);

create table if not exists wallets (
  wallet_id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users(user_id) on delete cascade,
  coins_balance integer not null default 0 check (coins_balance >= 0),
  locked_coins integer not null default 0 check (locked_coins >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type transaction_type as enum ('DEPOSIT', 'WITHDRAW', 'UNLOCK', 'DONATE');
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    create type transaction_status as enum ('PENDING', 'SUCCESS', 'FAILED');
  end if;
end $$;

create table if not exists transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(wallet_id),
  counterparty_wallet_id uuid references wallets(wallet_id),
  type transaction_type not null,
  status transaction_status not null,
  amount_coins integer not null check (amount_coins > 0),
  reference_type varchar(50),
  reference_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_wallet_created on transactions(wallet_id, created_at desc);
create index if not exists idx_transactions_type_status on transactions(type, status);

create table if not exists deposit_sessions (
  deposit_session_id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(wallet_id),
  package_code varchar(50) not null,
  amount_coins integer not null check (amount_coins > 0),
  status transaction_status not null default 'PENDING',
  transaction_id uuid references transactions(transaction_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deposit_sessions_wallet_created on deposit_sessions(wallet_id, created_at desc);
create index if not exists idx_deposit_sessions_status on deposit_sessions(status);

create table if not exists chapter_unlocks (
  user_id uuid not null references users(user_id) on delete cascade,
  chapter_id uuid not null references chapters(chapter_id) on delete cascade,
  transaction_id uuid not null references transactions(transaction_id),
  created_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create table if not exists withdraw_requests (
  withdraw_request_id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(wallet_id),
  amount_coins integer not null check (amount_coins > 0),
  bank_account_label varchar(255) not null,
  status transaction_status not null default 'PENDING',
  transaction_id uuid not null references transactions(transaction_id),
  reviewed_by uuid references users(user_id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_withdraw_requests_wallet_created on withdraw_requests(wallet_id, created_at desc);
create index if not exists idx_withdraw_requests_status on withdraw_requests(status);

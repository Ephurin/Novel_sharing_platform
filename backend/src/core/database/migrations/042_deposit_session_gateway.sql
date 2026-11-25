-- Coin top-ups can settle through an external gateway (VNPay sandbox) instead of the internal mock.
-- Existing rows stay valid: they were created by the mock gateway and carry no VND amount.
alter table deposit_sessions
  add column if not exists gateway varchar(20) not null default 'MOCK',
  add column if not exists amount_vnd integer check (amount_vnd is null or amount_vnd > 0),
  add column if not exists expires_at timestamptz,
  add column if not exists gateway_txn_no varchar(50),
  add column if not exists gateway_response_code varchar(10),
  add column if not exists gateway_payload jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deposit_sessions_gateway_check') then
    alter table deposit_sessions
      add constraint deposit_sessions_gateway_check check (gateway in ('MOCK', 'VNPAY'));
  end if;
end $$;

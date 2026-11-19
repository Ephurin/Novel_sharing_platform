create function registration_delivery_mailbox_key(address text) returns text
  language sql immutable strict
  as $$
    select case
      when split_part(lower(address), '@', 2) = 'gmail.com' then
        replace(split_part(split_part(lower(address), '@', 1), '+', 1), '.', '') || '@gmail.com'
      else lower(address)
    end
  $$;

alter table registration_email_delivery_budget rename column email to mailbox_key;

-- Carry the active alias counters forward without resetting the newest window.
create temporary table registration_mailbox_budget_merge on commit drop as
select registration_delivery_mailbox_key(mailbox_key) as mailbox_key,
       max(window_started_at) as window_started_at,
       least(sum(sent_count), 5)::smallint as sent_count
from registration_email_delivery_budget
where window_started_at > now() - interval '1 hour'
group by registration_delivery_mailbox_key(mailbox_key);

delete from registration_email_delivery_budget;
insert into registration_email_delivery_budget (mailbox_key, window_started_at, sent_count)
select mailbox_key, window_started_at, sent_count from registration_mailbox_budget_merge;

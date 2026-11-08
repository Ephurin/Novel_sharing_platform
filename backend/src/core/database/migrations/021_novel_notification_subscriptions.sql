create table if not exists novel_notification_subscriptions (
  novel_id uuid not null references novels(novel_id) on delete cascade,
  user_id uuid not null references users(user_id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (novel_id, user_id)
);

create or replace function enqueue_new_chapter_notifications() returns trigger language plpgsql as $$
begin
  if new.status <> 'PUBLISHED' or new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.published_at is not null or old.status = 'PUBLISHED' then return new; end if;
  end if;
  insert into notification_events (event_key, user_id, type, title, content, payload)
  select 'chapter-published:' || new.chapter_id::text || ':' || s.user_id::text,
    s.user_id, 'NOVEL_CHAPTER_PUBLISHED', 'Truyện có chương mới',
    n.title || ' · Chương ' || new.chapter_number::text || ': ' || new.title,
    jsonb_build_object('href', '/reader/chapters/' || new.chapter_id::text,
      'novelId', new.novel_id, 'chapterId', new.chapter_id)
  from novel_notification_subscriptions s
  join users u on u.user_id = s.user_id
  join novels n on n.novel_id = s.novel_id
  where s.novel_id = new.novel_id and s.enabled
    and u.role = 'READER' and u.status = 'ACTIVE' and u.deleted_at is null
    and n.status = 'PUBLISHED' and n.deleted_at is null and s.user_id <> n.author_id
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists notify_new_chapter_subscribers on chapters;
create trigger notify_new_chapter_subscribers
  after insert or update of status on chapters
  for each row execute function enqueue_new_chapter_notifications();

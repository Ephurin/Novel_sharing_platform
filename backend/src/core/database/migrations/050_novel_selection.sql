alter table novels add column story_format text check (story_format = 'SHORT_STORY');

create table novel_selection_cases (
  case_id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels(novel_id),
  status text not null default 'PENDING' check (status in ('PENDING','NEEDS_INFO','SELECTED','RECHECK','REJECTED','REVOKED')),
  version integer not null default 1,
  reviewed_branch text check (reviewed_branch in ('STANDARD','SHORT_STORY')),
  reviewed_snapshot jsonb,
  classified_snapshot jsonb,
  needs_comparison boolean not null default false,
  criteria jsonb,
  author_notes text,
  last_reason text,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index novel_selection_active on novel_selection_cases(novel_id)
  where status in ('PENDING','NEEDS_INFO','SELECTED','RECHECK');
create index novel_selection_latest on novel_selection_cases(novel_id, created_at desc, case_id desc);
create index novel_selection_queue on novel_selection_cases(updated_at desc, case_id desc)
  where status in ('PENDING','NEEDS_INFO','RECHECK') or (status = 'SELECTED' and needs_comparison);
create index novel_selection_selected on novel_selection_cases(updated_at desc, case_id desc) where status='SELECTED';

create table novel_nominations (
  nomination_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references novel_selection_cases(case_id),
  nominator_id uuid not null references users(user_id),
  kind text not null check (kind in ('READER','AUTHOR')),
  reason text not null check (char_length(reason) between 50 and 2000),
  idempotency_key text not null,
  submitted_status text not null,
  created_at timestamptz not null default now(),
  unique (case_id, nominator_id),
  unique (nominator_id, idempotency_key)
);
create index novel_nominations_reader on novel_nominations(nominator_id, created_at desc, nomination_id desc);

create function novel_selection_branches(target uuid) returns text[] language sql stable as $$
  select coalesce((select array_remove(array[
    case when (select count(*) from (select 1 from chapters c where c.novel_id = n.novel_id
      and c.status = 'PUBLISHED' and c.deleted_at is null limit 3) visible) = 3 then 'STANDARD' end,
    case when n.story_format = 'SHORT_STORY' and n.serial_status = 'COMPLETED' and exists (
      select 1 from chapters c where c.novel_id=n.novel_id and c.status='PUBLISHED'
        and c.deleted_at is null and not c.is_vip) then 'SHORT_STORY' end
  ], null) from novels n where n.novel_id=target and n.status='PUBLISHED' and n.deleted_at is null), '{}'::text[]);
$$;

create function novel_selection_text(value text) returns text language sql immutable as $fn$
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    normalize(replace(coalesce(value, ''), E'\r', ''), NFC),
    $re$</?(?:p|br|div|h[1-6]|li)(?:[[:space:]][^>]*)?/?>$re$, E'\n', 'gi'),
    $re$</?(?:b|strong|i|em|u|span|s|del)(?:[[:space:]][^>]*)?/?>$re$, '', 'gi'),
    $re$(\*\*|__|~~)([^\n]+?)\1$re$, '\2', 'g'), '[[:space:]]+', ' ', 'g'));
$fn$;

create function novel_selection_chapter_hash(title text, content text) returns text language sql immutable as $$
  select encode(sha256(convert_to(jsonb_build_array(novel_selection_text(title), novel_selection_text(content))::text, 'UTF8')), 'hex');
$$;

create function novel_selection_changed(target uuid, snapshot jsonb, reviewed jsonb) returns boolean language sql stable as $$
  select novel_selection_text(n.title) is distinct from snapshot->>'title'
      or novel_selection_text(n.synopsis) is distinct from snapshot->>'synopsis'
      or exists (
        select 1 from jsonb_object_keys(reviewed->'chapters') as old(chapter_id)
        left join chapters c on c.chapter_id=old.chapter_id::uuid and c.novel_id=target
          and c.status='PUBLISHED' and c.deleted_at is null
        where (case when c.chapter_id is not null then novel_selection_chapter_hash(c.title,c.content) end)
          is distinct from snapshot->'chapters'->old.chapter_id->>'hash'
          or c.chapter_number is distinct from (snapshot->'chapters'->old.chapter_id->>'number')::integer
      )
    from novels n where n.novel_id=target;
$$;

create function refresh_novel_selection(target uuid, became_unavailable boolean, compare_content boolean) returns void language plpgsql as $$
declare
  current_case novel_selection_cases%rowtype;
  reopen boolean;
begin
  select * into current_case from novel_selection_cases where novel_id=target
    and status in ('PENDING','NEEDS_INFO','SELECTED','RECHECK') for update;
  if not found then return; end if;
  reopen := current_case.status='SELECTED' and (became_unavailable or not coalesce(
    current_case.reviewed_branch = any(novel_selection_branches(target)), false));
  update novel_selection_cases set version=version+1, updated_at=now(),
    status=case when reopen then 'RECHECK' else status end,
    last_reason=case when reopen then 'Tác phẩm thay đổi khả năng công khai hoặc điều kiện tuyển chọn.' else last_reason end,
    needs_comparison=case when reopen then false
      when status='SELECTED' and compare_content then coalesce(novel_selection_changed(target, classified_snapshot, reviewed_snapshot), true)
      else needs_comparison end
    where case_id=current_case.case_id;
  if reopen then
    insert into novel_selection_events(case_id, version, action, reason)
      values (current_case.case_id, current_case.version+1, 'ELIGIBILITY_LOST', 'Tác phẩm thay đổi khả năng công khai hoặc điều kiện tuyển chọn.');
  end if;
end;
$$;

create table novel_selection_events (
  case_id uuid not null references novel_selection_cases(case_id),
  version integer not null,
  actor_id uuid references users(user_id),
  action text not null,
  reason text not null,
  evidence jsonb,
  created_at timestamptz not null default now(),
  primary key (case_id, version)
);

create function selection_novel_update() returns trigger language plpgsql as $$
begin
  if row(old.status,old.deleted_at,old.story_format,old.serial_status,old.title,old.synopsis,old.author_id)
     is distinct from row(new.status,new.deleted_at,new.story_format,new.serial_status,new.title,new.synopsis,new.author_id) then
    perform refresh_novel_selection(new.novel_id,
      new.status <> 'PUBLISHED' or new.deleted_at is not null or old.author_id <> new.author_id, true);
  end if;
  return null;
end;
$$;

create trigger selection_novel_update after update of status,deleted_at,story_format,serial_status,title,synopsis,author_id
  on novels for each row execute function selection_novel_update();

create function selection_chapter_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status='PUBLISHED' and new.deleted_at is null then
      perform refresh_novel_selection(new.novel_id, false, false);
    end if;
  elsif tg_op = 'DELETE' then
    if old.status='PUBLISHED' and old.deleted_at is null then
      perform refresh_novel_selection(old.novel_id, false, true);
    end if;
  elsif ((old.status='PUBLISHED' and old.deleted_at is null) or (new.status='PUBLISHED' and new.deleted_at is null))
    and row(old.status, old.deleted_at, old.is_vip, old.title, old.content, old.chapter_number)
      is distinct from row(new.status, new.deleted_at, new.is_vip, new.title, new.content, new.chapter_number) then
    perform refresh_novel_selection(new.novel_id, false, true);
  end if;
  return null;
end;
$$;

create trigger selection_chapter_change after insert or delete or update of status,deleted_at,is_vip,title,content,chapter_number
  on chapters for each row execute function selection_chapter_change();

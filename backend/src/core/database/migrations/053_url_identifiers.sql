
set local lock_timeout = '5s';

alter table chapters add column slug varchar(255);
alter table discussion_topics add column slug varchar(255);
alter table users add column public_key varchar(80);

create unique index chapters_novel_slug_key on chapters(novel_id, slug);
create unique index discussion_topics_slug_key on discussion_topics(slug);
create unique index users_public_key_key on users(public_key);

create function url_segment(value text) returns text
language sql immutable strict
as $$
  select trim(both '-' from regexp_replace(
    lower(regexp_replace(normalize(translate(value, 'đĐ', 'dD'), NFD), U&'[\0300-\036f]', '', 'g') collate "C"),
    '[^a-z0-9]+', '-', 'g'
  ))
$$;

create function chapter_url_base(number integer, title text) returns text
language sql immutable strict
as $$
  select concat_ws('-', 'chuong', case when number > 0 then number::text end,
    nullif(url_segment(regexp_replace(title, '^\s*(chương|chapter|ch[.])\s*[0-9]+\s*[:.\-–—]?\s*', '', 'i')), ''))
$$;

create function allocate_url_identifier(
  resource text,
  scope_id uuid,
  raw_base text,
  use_bare boolean default false,
  backfilling_profile boolean default false
) returns text
language plpgsql
as $$
declare
  base text := coalesce(nullif(url_segment(raw_base), ''), case resource
    when 'chapter' then 'chuong'
    when 'topic' then 'chu-de'
    when 'profile' then 'thanh-vien'
    else 'novel'
  end);
  max_length integer := case when resource = 'profile' then 80 else 255 end;
  candidate text;
  occupied boolean;
begin
  for attempt in 0..8 loop
    if attempt = 0 then
      if not use_bare or url_segment(raw_base) = '' then
        continue;
      end if;
      candidate := rtrim(left(base, max_length), '-');
    else
      candidate := rtrim(left(base, max_length - 9), '-') || '-' || encode(gen_random_bytes(4), 'hex');
    end if;

    perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', 'url-identifier', resource, scope_id, candidate), 0));
    case resource
      when 'chapter' then
        select exists(select 1 from chapters where novel_id = scope_id and slug = candidate) into occupied;
      when 'topic' then
        select exists(select 1 from discussion_topics where slug = candidate) into occupied;
      when 'profile' then
        select exists(select 1 from users where public_key = candidate)
          or ((attempt <> 0 or not backfilling_profile) and exists(
            select 1 from users where public_key is null and url_segment(username) = candidate
          ))
          into occupied;
      when 'novel' then
        select exists(select 1 from novels where slug = candidate) into occupied;
      else
        raise exception 'Unknown URL identifier resource %', resource;
    end case;
    if not occupied then
      return candidate;
    end if;
  end loop;

  raise exception 'Could not allocate URL identifier for %', resource;
end
$$;

create function assign_chapter_url_identifier() returns trigger
language plpgsql as $$
begin
  if new.slug is null then
    new.slug := allocate_url_identifier('chapter', new.novel_id, chapter_url_base(new.chapter_number, new.title));
  end if;
  return new;
end
$$;

create function assign_topic_url_identifier() returns trigger
language plpgsql as $$
begin
  if new.slug is null then
    new.slug := allocate_url_identifier('topic', null, new.title);
  end if;
  return new;
end
$$;

create function assign_profile_url_identifier() returns trigger
language plpgsql as $$
begin
  if new.public_key is null then
    new.public_key := allocate_url_identifier('profile', null, new.username, true);
  end if;
  return new;
end
$$;

create trigger chapters_assign_url_identifier before insert on chapters
  for each row execute function assign_chapter_url_identifier();
create trigger topics_assign_url_identifier before insert on discussion_topics
  for each row execute function assign_topic_url_identifier();
create trigger users_assign_url_identifier before insert on users
  for each row execute function assign_profile_url_identifier();

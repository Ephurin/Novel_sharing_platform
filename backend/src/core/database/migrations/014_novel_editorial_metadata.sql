alter table novels add column if not exists author_note text
  check (author_note is null or char_length(author_note) <= 5000);

create table if not exists novel_genres (
  novel_id uuid not null references novels(novel_id) on delete cascade,
  genre_id uuid not null references genres(genre_id),
  primary key (novel_id, genre_id)
);

insert into novel_genres (novel_id, genre_id)
select novel_id, genre_id from novels where genre_id is not null
on conflict do nothing;

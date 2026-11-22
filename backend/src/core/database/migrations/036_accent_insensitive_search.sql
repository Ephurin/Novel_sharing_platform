-- UAT 2026-11-20 (BUG-002): searching "kiem" found nothing while "kiếm" found 5 novels.
-- Novel search compares text with the Vietnamese accents (and đ) removed on both sides.
create extension if not exists unaccent;

-- Not schema-qualified: the extension lands in the first schema of the search path, which is not
-- always public (isolated test schemas use "search_path=<schema>,public").
create or replace function f_unaccent(value text) returns text
  language sql stable parallel safe strict
  as $$ select unaccent(value) $$;

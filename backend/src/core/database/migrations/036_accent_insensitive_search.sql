-- UAT 2026-11-20 (BUG-002): searching "kiem" found nothing while "kiếm" found 5 novels.
-- Novel search compares text with the Vietnamese accents (and đ) removed on both sides.
create extension if not exists unaccent;

-- unaccent() is only STABLE; this wrapper pins the dictionary so it can be IMMUTABLE and used in
-- indexes later if search needs one.
create or replace function f_unaccent(value text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, value) $$;

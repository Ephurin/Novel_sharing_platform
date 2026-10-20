alter table novel_ratings add column if not exists review_text text
  check (review_text is null or (char_length(review_text) between 1 and 2000 and char_length(btrim(review_text)) > 0));

create index if not exists idx_novel_reviews_updated
  on novel_ratings (novel_id, updated_at desc, user_id) where review_text is not null;

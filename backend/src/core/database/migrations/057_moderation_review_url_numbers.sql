set local lock_timeout = '3s';

alter table moderation_reviews
  add column url_number integer generated always as identity,
  add constraint moderation_reviews_url_number_key unique (url_number);

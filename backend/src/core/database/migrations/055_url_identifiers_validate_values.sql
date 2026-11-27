
set local lock_timeout = '5s';

alter table chapters validate constraint chapters_slug_present;
alter table discussion_topics validate constraint discussion_topics_slug_present;
alter table users validate constraint users_public_key_present;

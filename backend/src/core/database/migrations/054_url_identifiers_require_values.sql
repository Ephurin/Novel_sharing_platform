
set local lock_timeout = '5s';

alter table chapters add constraint chapters_slug_present check (slug is not null) not valid;
alter table discussion_topics add constraint discussion_topics_slug_present check (slug is not null) not valid;
alter table users add constraint users_public_key_present check (public_key is not null) not valid;

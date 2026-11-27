
set local lock_timeout = '5s';

alter table chapters alter column slug set not null;
alter table discussion_topics alter column slug set not null;
alter table users alter column public_key set not null;

alter table chapters drop constraint chapters_slug_present;
alter table discussion_topics drop constraint discussion_topics_slug_present;
alter table users drop constraint users_public_key_present;

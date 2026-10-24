alter table chapters add column if not exists import_key varchar(128);
alter table chapters add column if not exists import_hash varchar(64);
create unique index if not exists idx_chapters_import_key on chapters(novel_id, import_key) where import_key is not null;
alter table moderation_reviews add column if not exists notification_pending boolean not null default false;

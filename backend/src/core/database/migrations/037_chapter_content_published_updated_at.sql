-- Separate public chapter publication/revision timestamp from private draft activity (chapters.updated_at).
alter table chapters
  add column if not exists published_updated_at timestamptz;

update chapters
set published_updated_at = coalesce(published_at, updated_at)
where status = 'PUBLISHED'
  and published_updated_at is null;

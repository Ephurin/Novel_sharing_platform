-- Separate public chapter publication/revision timestamp from private draft activity (chapters.updated_at).
alter table chapters
  add column if not exists published_updated_at timestamptz;

-- Backfill existing PUBLISHED chapters using the latest approved publication/revision review
-- timestamp when historical moderation_reviews records exist, preserving approved revision dates
-- instead of regressing to initial published_at. If no moderation_reviews history exists (for
-- example, direct seed rows), fall back to coalesce(published_at, updated_at) so private draft
-- saves without an approved review are not promoted over published_at.
update chapters c
set published_updated_at = greatest(
  coalesce(c.published_at, c.updated_at),
  coalesce(
    (
      select max(coalesce(r.reviewed_at, r.updated_at, r.created_at))
      from moderation_reviews r
      where r.target_type = 'CHAPTER'
        and r.target_id = c.chapter_id::text
        and r.source = 'KEYWORD_FILTER'
        and r.status = 'APPROVED'
    ),
    coalesce(c.published_at, c.updated_at)
  )
)
where c.status = 'PUBLISHED'
  and c.published_updated_at is null;

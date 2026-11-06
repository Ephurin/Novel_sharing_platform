-- Repair profiles enriched before author edits explicitly relinquished projection ownership.
-- Retain stable links (including inactive links) and explicit deletion tombstones.
update story_brain_bible_links l
set owns_bible_row = false
from character_profiles p
where l.novel_id = p.novel_id and l.artifact_kind = 'entity' and l.bible_id = p.character_id
  and l.owns_bible_row
  and (p.name is distinct from l.source_snapshot->>'name'
    or p.role <> 'MINOR' or p.personality is not null
    or p.description is not null or p.notes is not null);

update story_brain_bible_links l
set owns_bible_row = false
from story_timeline_events e
where l.novel_id = e.novel_id and l.artifact_kind = 'event' and l.bible_id = e.event_id
  and l.owns_bible_row
  and (e.title is distinct from l.source_snapshot->>'title'
    or e.summary is distinct from l.source_snapshot->>'summary'
    or e.chapter_id is distinct from (l.source_snapshot->>'chapterId')::uuid
    -- Canon updates did not change updated_at; author PATCHes did, including order-only edits.
    or e.updated_at > e.created_at);

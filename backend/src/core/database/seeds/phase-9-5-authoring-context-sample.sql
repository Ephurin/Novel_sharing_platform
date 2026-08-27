-- Phase 9.5 sample authoring context seed
-- Run this after Phase 9.5 migrations create:
-- character_profiles, character_relationships, story_timeline_events, plot_summaries.
-- Source novels are seeded from docs/Assets/test_story and docs/Assets/test_story_2.

begin;

-- Fail early if the Phase 9.5 schema has not been migrated yet.
do $$
begin
  if to_regclass('character_profiles') is null
    or to_regclass('character_relationships') is null
    or to_regclass('story_timeline_events') is null
    or to_regclass('plot_summaries') is null then
    raise exception 'Phase 9.5 authoring context tables are missing. Run migrations before this seed.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Ashenhold - Sample Story
-- novel_id: 81b923d7-5507-48ea-9a84-5303fd1de5f4
-- -----------------------------------------------------------------------------

with novel_ctx as (
  select novel_id, author_id
  from novels
  where novel_id = '81b923d7-5507-48ea-9a84-5303fd1de5f4'
), sample_characters(name, role, personality, description, notes) as (
  values
    ('Kael Draven', 'PROTAGONIST', 'Stubborn, wounded, duty-bound, driven by betrayal.', 'Known as the Ashen Knight. Former defender of Ashenhold and wielder of Cinderbound.', 'Main emotional anchor. His revenge against Lucien should remain morally complicated.'),
    ('Elara Windrider', 'SUPPORTING', 'Sharp, pragmatic, loyal under pressure.', 'Border archer who fights beside Kael during the fall of Ashenhold.', 'Often functions as the voice of survival when Kael becomes reckless.'),
    ('Lucien Blackthorn', 'ANTAGONIST', 'Cold, ideological, manipulative.', 'Kael''s former mentor who opens the kingdom to the Order of the Black Sun.', 'Primary betrayal figure. His motives should hint at a larger world-order ideology.'),
    ('Seraphina Vale', 'SUPPORTING', 'Compassionate, sacrificial, spiritually resilient.', 'Priestess of the Knights of Silver Dawn who saves Kael during the collapse.', 'Represents mercy and the fading old order.'),
    ('Valerius Thorne', 'ANTAGONIST', 'Cruel, theatrical, power-focused.', 'Leader of the Crimson Covenant and wielder of Blood Oath.', 'Physical threat who blocks Kael from reaching Lucien.')
)
insert into character_profiles (novel_id, name, role, personality, description, notes, source, created_by, updated_by, created_at, updated_at)
select nc.novel_id, sc.name, sc.role::character_role, sc.personality, sc.description, sc.notes, 'AUTHOR_MANUAL'::context_source, nc.author_id, nc.author_id, now(), now()
from novel_ctx nc
cross join sample_characters sc
where not exists (
  select 1 from character_profiles cp
  where cp.novel_id = nc.novel_id and lower(cp.name) = lower(sc.name) and cp.deleted_at is null
);

with novel_ctx as (
  select novel_id from novels where novel_id = '81b923d7-5507-48ea-9a84-5303fd1de5f4'
), rels(source_name, target_name, relationship_type, description) as (
  values
    ('Kael Draven', 'Lucien Blackthorn', 'Former mentor / betrayer', 'Lucien trained Kael, then betrayed Ashenhold by helping the Order of the Black Sun.'),
    ('Kael Draven', 'Elara Windrider', 'Comrade', 'Elara fights beside Kael and repeatedly urges survival over pride.'),
    ('Kael Draven', 'Seraphina Vale', 'Rescuer', 'Seraphina saves Kael and reinforces his duty to survive.'),
    ('Kael Draven', 'Valerius Thorne', 'Enemy', 'Valerius prevents Kael from reaching Lucien during the fall of Ashenhold.')
)
insert into character_relationships (novel_id, source_character_id, target_character_id, relationship_type, description, created_at, updated_at)
select nc.novel_id, source_cp.character_id, target_cp.character_id, r.relationship_type, r.description, now(), now()
from novel_ctx nc
join rels r on true
join character_profiles source_cp on source_cp.novel_id = nc.novel_id and source_cp.name = r.source_name and source_cp.deleted_at is null
join character_profiles target_cp on target_cp.novel_id = nc.novel_id and target_cp.name = r.target_name and target_cp.deleted_at is null
where not exists (
  select 1 from character_relationships cr
  where cr.novel_id = nc.novel_id
    and cr.source_character_id = source_cp.character_id
    and cr.target_character_id = target_cp.character_id
    and lower(cr.relationship_type) = lower(r.relationship_type)
);

with novel_ctx as (
  select novel_id, author_id from novels where novel_id = '81b923d7-5507-48ea-9a84-5303fd1de5f4'
), events(event_order, chapter_id, title, summary) as (
  values
    (1, 'c660bede-0493-4a46-97f2-6d01c8ddd3db'::uuid, 'Ashenhold falls', 'The Order of the Black Sun attacks Ashenhold. Kael witnesses Lucien''s betrayal and escapes with Elara and Seraphina.'),
    (2, '4332c8ab-b251-4cc0-ac91-329844c73501'::uuid, 'Survivors reach Silverkeep', 'The surviving group moves toward Silverkeep while Kael struggles with shame and vengeance.'),
    (3, '667a2512-a046-4775-b41e-9b9d7e283880'::uuid, 'Crimson Sanctum revealed', 'The enemy power structure expands through the Crimson Sanctum and Valerius''s influence.'),
    (4, 'ccb10a72-ce54-471e-b74e-2a2a4962a05e'::uuid, 'Whispering Woods omen', 'The party encounters warnings and supernatural signs in Whispering Woods.'),
    (5, '69cfb8d6-49db-4d0a-8f10-9e36e52b5853'::uuid, 'Obsidian betrayal deepens', 'The political and magical betrayal behind Ashenhold becomes clearer.'),
    (6, 'ec0f5295-c4dc-4c85-9429-5a8b813f9bfa'::uuid, 'Storm Age memory', 'A flashback reframes the old era and Kael''s understanding of duty.'),
    (7, '111ab376-6c55-4215-8fc3-242b57ba9a4b'::uuid, 'Silverkeep siege', 'Silverkeep becomes the next major conflict point.'),
    (8, '72021191-d589-4df4-a948-8dc25f313a2b'::uuid, 'Dark mercy', 'Kael confronts the cost of vengeance and mercy.'),
    (9, 'f811e73f-45b0-4017-99cc-ef75a6ea97e0'::uuid, 'Road to Obsidian Citadel', 'The story turns toward Obsidian Citadel and the heart of the enemy.'),
    (10, 'e30f7437-467b-4b3d-94fe-796ed9970499'::uuid, 'Final eclipse', 'The eclipse signals a major culmination of Lucien''s forbidden magic.')
)
insert into story_timeline_events (novel_id, chapter_id, title, event_order, summary, source, created_by, updated_by, created_at, updated_at)
select nc.novel_id, e.chapter_id, e.title, e.event_order, e.summary, 'AUTHOR_MANUAL'::context_source, nc.author_id, nc.author_id, now(), now()
from novel_ctx nc
join events e on true
where not exists (
  select 1 from story_timeline_events ste
  where ste.novel_id = nc.novel_id and ste.event_order = e.event_order
);

with novel_ctx as (
  select novel_id, author_id from novels where novel_id = '81b923d7-5507-48ea-9a84-5303fd1de5f4'
), summaries(scope, arc_name, chapter_id, start_chapter_number, end_chapter_number, summary) as (
  values
    ('NOVEL', null, null::uuid, 1, 10, 'Kael Draven survives the fall of Ashenhold after his former mentor Lucien Blackthorn betrays the kingdom. Across the first arc, Kael moves from shame and vengeance toward a larger confrontation with the Order of the Black Sun, the Crimson Covenant, and the Obsidian Citadel.'),
    ('ARC', 'Fall of Ashenhold', null::uuid, 1, 4, 'The opening arc establishes Ashenhold''s destruction, Lucien''s betrayal, Kael''s survival, and the first supernatural warnings that the conflict is larger than one fallen city.'),
    ('ARC', 'Road to Obsidian', null::uuid, 5, 10, 'The second arc expands the betrayal into a broader war, deepens Kael''s moral conflict, and points the survivors toward Obsidian Citadel and the final eclipse.'),
    ('CHAPTER', null, 'c660bede-0493-4a46-97f2-6d01c8ddd3db'::uuid, 1, 1, 'Ashenhold falls to the Order of the Black Sun. Kael sees Lucien''s betrayal, clashes with Valerius, and is saved by his allies.'),
    ('CHAPTER', null, '4332c8ab-b251-4cc0-ac91-329844c73501'::uuid, 2, 2, 'The survivors move toward Silverkeep while Kael processes defeat and the cost of survival.'),
    ('CHAPTER', null, '667a2512-a046-4775-b41e-9b9d7e283880'::uuid, 3, 3, 'The Crimson Sanctum and its bloody power structure become a clearer threat.'),
    ('CHAPTER', null, 'ccb10a72-ce54-471e-b74e-2a2a4962a05e'::uuid, 4, 4, 'Whispering Woods introduces ominous signs and tests the group''s trust.'),
    ('CHAPTER', null, '69cfb8d6-49db-4d0a-8f10-9e36e52b5853'::uuid, 5, 5, 'The betrayal tied to Obsidian influence becomes more personal and strategic.'),
    ('CHAPTER', null, 'ec0f5295-c4dc-4c85-9429-5a8b813f9bfa'::uuid, 6, 6, 'A flashback to the Storm Age reframes the current war and the old order.'),
    ('CHAPTER', null, '111ab376-6c55-4215-8fc3-242b57ba9a4b'::uuid, 7, 7, 'Silverkeep faces siege, raising stakes for the remaining defenders.'),
    ('CHAPTER', null, '72021191-d589-4df4-a948-8dc25f313a2b'::uuid, 8, 8, 'Kael encounters mercy inside darkness and questions simple revenge.'),
    ('CHAPTER', null, 'f811e73f-45b0-4017-99cc-ef75a6ea97e0'::uuid, 9, 9, 'The path turns toward Obsidian Citadel, making the conflict direct and unavoidable.'),
    ('CHAPTER', null, 'e30f7437-467b-4b3d-94fe-796ed9970499'::uuid, 10, 10, 'The final eclipse marks a major magical and emotional turning point.')
)
insert into plot_summaries (novel_id, chapter_id, scope, arc_name, start_chapter_number, end_chapter_number, summary, source, created_by, updated_by, created_at, updated_at)
select nc.novel_id, s.chapter_id, s.scope::plot_summary_scope, s.arc_name, s.start_chapter_number, s.end_chapter_number, s.summary, 'AUTHOR_MANUAL'::context_source, nc.author_id, nc.author_id, now(), now()
from novel_ctx nc
join summaries s on true
where not exists (
  select 1 from plot_summaries ps
  where ps.novel_id = nc.novel_id
    and ps.scope = s.scope::plot_summary_scope
    and coalesce(ps.chapter_id::text, '') = coalesce(s.chapter_id::text, '')
    and coalesce(ps.arc_name, '') = coalesce(s.arc_name, '')
    and coalesce(ps.start_chapter_number, -1) = coalesce(s.start_chapter_number, -1)
);

-- -----------------------------------------------------------------------------
-- Thanh Van Sword Path - Sample Story
-- novel_id: 451e1280-214c-4500-980b-34b9af0989eb
-- -----------------------------------------------------------------------------

with novel_ctx as (
  select novel_id, author_id
  from novels
  where novel_id = '451e1280-214c-4500-980b-34b9af0989eb'
), sample_characters(name, role, personality, description, notes) as (
  values
    ('Tiêu Trần', 'PROTAGONIST', 'Determined, underestimated, quietly ambitious.', 'A border youth seen as talentless, secretly holding an ancient jade tied to Vạn Kiếm Quy Tông.', 'Growth path should move from mocked outsider to sword cultivator.'),
    ('Lâm Nguyệt Nhi', 'SUPPORTING', 'Candid, gifted, protective beneath teasing.', 'Childhood friend from Thanh Châu Thành with strong cultivation potential.', 'Her doubts should be balanced with genuine care for Tiêu Trần.'),
    ('Hắc Ma Hội', 'ANTAGONIST', 'Violent, predatory, opportunistic.', 'An evil organization attacking smaller families and settlements.', 'Group antagonist for the opening conflict.'),
    ('Thanh Vân Môn', 'SUPPORTING', 'Distant, prestigious, aspirational.', 'Major sect in the Đông Hải region and a symbol of cultivation status.', 'Institutional goalpost rather than a single character.')
)
insert into character_profiles (novel_id, name, role, personality, description, notes, source, created_by, updated_by, created_at, updated_at)
select nc.novel_id, sc.name, sc.role::character_role, sc.personality, sc.description, sc.notes, 'AUTHOR_MANUAL'::context_source, nc.author_id, nc.author_id, now(), now()
from novel_ctx nc
cross join sample_characters sc
where not exists (
  select 1 from character_profiles cp
  where cp.novel_id = nc.novel_id and lower(cp.name) = lower(sc.name) and cp.deleted_at is null
);

with novel_ctx as (
  select novel_id from novels where novel_id = '451e1280-214c-4500-980b-34b9af0989eb'
), rels(source_name, target_name, relationship_type, description) as (
  values
    ('Tiêu Trần', 'Lâm Nguyệt Nhi', 'Childhood friend', 'Lâm Nguyệt Nhi teases Tiêu Trần about cultivation, but follows him into danger.'),
    ('Tiêu Trần', 'Thanh Vân Môn', 'Aspirational goal', 'Tiêu Trần dreams of joining a prestigious sect despite being underestimated.'),
    ('Tiêu Trần', 'Hắc Ma Hội', 'Enemy', 'The attack by Hắc Ma Hội pulls Tiêu Trần into the first major conflict.')
)
insert into character_relationships (novel_id, source_character_id, target_character_id, relationship_type, description, created_at, updated_at)
select nc.novel_id, source_cp.character_id, target_cp.character_id, r.relationship_type, r.description, now(), now()
from novel_ctx nc
join rels r on true
join character_profiles source_cp on source_cp.novel_id = nc.novel_id and source_cp.name = r.source_name and source_cp.deleted_at is null
join character_profiles target_cp on target_cp.novel_id = nc.novel_id and target_cp.name = r.target_name and target_cp.deleted_at is null
where not exists (
  select 1 from character_relationships cr
  where cr.novel_id = nc.novel_id
    and cr.source_character_id = source_cp.character_id
    and cr.target_character_id = target_cp.character_id
    and lower(cr.relationship_type) = lower(r.relationship_type)
);

with novel_ctx as (
  select novel_id, author_id from novels where novel_id = '451e1280-214c-4500-980b-34b9af0989eb'
), events(event_order, chapter_id, title, summary) as (
  values
    (1, 'd5dfd32b-a71e-48ce-b665-9d70624e9735'::uuid, 'Border youth dreams of sword cultivation', 'Tiêu Trần reveals his ambition to join a great sword sect while hiding the secret of an ancient jade.'),
    (2, '1c9d99b6-215e-41f7-a144-b91eed06ba02'::uuid, 'Thanh Châu blood battle', 'The Hắc Ma Hội attack escalates into direct conflict around Thanh Châu.'),
    (3, '6f42eb9a-1660-429b-8d2a-2ccca8f353f5'::uuid, 'A new beginning', 'After surviving the first crisis, Tiêu Trần steps onto a clearer cultivation path.')
)
insert into story_timeline_events (novel_id, chapter_id, title, event_order, summary, source, created_by, updated_by, created_at, updated_at)
select nc.novel_id, e.chapter_id, e.title, e.event_order, e.summary, 'AUTHOR_MANUAL'::context_source, nc.author_id, nc.author_id, now(), now()
from novel_ctx nc
join events e on true
where not exists (
  select 1 from story_timeline_events ste
  where ste.novel_id = nc.novel_id and ste.event_order = e.event_order
);

with novel_ctx as (
  select novel_id, author_id from novels where novel_id = '451e1280-214c-4500-980b-34b9af0989eb'
), summaries(scope, arc_name, chapter_id, start_chapter_number, end_chapter_number, summary) as (
  values
    ('NOVEL', null, null::uuid, 1, 3, 'Tiêu Trần begins as an underestimated youth near Thanh Châu, dreams of sword cultivation, and is forced into action when Hắc Ma Hội attacks. The opening chapters establish his hidden jade secret, his relationship with Lâm Nguyệt Nhi, and the start of his cultivation journey.'),
    ('ARC', 'Thanh Châu Opening', null::uuid, 1, 3, 'The first arc introduces Tiêu Trần, Lâm Nguyệt Nhi, the threat of Hắc Ma Hội, and the catalyst that pushes Tiêu Trần from passive dreamer into active cultivator.'),
    ('CHAPTER', null, 'd5dfd32b-a71e-48ce-b665-9d70624e9735'::uuid, 1, 1, 'Tiêu Trần stands near Thương Loan Sơn, dreams of joining a sword sect, and reveals the secret ancient jade before danger appears.'),
    ('CHAPTER', null, '1c9d99b6-215e-41f7-a144-b91eed06ba02'::uuid, 2, 2, 'The Hắc Ma Hội attack turns the quiet border setup into violent conflict.'),
    ('CHAPTER', null, '6f42eb9a-1660-429b-8d2a-2ccca8f353f5'::uuid, 3, 3, 'The aftermath of the first battle opens Tiêu Trần''s path toward cultivation and a new life direction.')
)
insert into plot_summaries (novel_id, chapter_id, scope, arc_name, start_chapter_number, end_chapter_number, summary, source, created_by, updated_by, created_at, updated_at)
select nc.novel_id, s.chapter_id, s.scope::plot_summary_scope, s.arc_name, s.start_chapter_number, s.end_chapter_number, s.summary, 'AUTHOR_MANUAL'::context_source, nc.author_id, nc.author_id, now(), now()
from novel_ctx nc
join summaries s on true
where not exists (
  select 1 from plot_summaries ps
  where ps.novel_id = nc.novel_id
    and ps.scope = s.scope::plot_summary_scope
    and coalesce(ps.chapter_id::text, '') = coalesce(s.chapter_id::text, '')
    and coalesce(ps.arc_name, '') = coalesce(s.arc_name, '')
    and coalesce(ps.start_chapter_number, -1) = coalesce(s.start_chapter_number, -1)
);

commit;

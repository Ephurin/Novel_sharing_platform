-- Checkpoint B: discussions schema.
-- Additive only: new types, tables, constraints, indexes and seed rows. No existing table, column
-- or row is changed, and no prior discussion data can be cascaded away by these definitions.
--
-- Conventions follow the earlier migrations in this folder: uuid keys with gen_random_uuid(),
-- timestamptz timestamps, and the report/moderation target enums extended in 037 rather than
-- duplicated here.
--
-- Search: f_unaccent (036) is STABLE, so it cannot appear in a generated column or in an index
-- expression. The application writes the normalized text into discussion_topics.search_document
-- through f_unaccent, and the GIN index below only reads that stored column.
--
-- updated_at and edited_at are maintained by callers, matching the rest of the schema.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'discussion_topic_status') then
    create type discussion_topic_status as enum ('VISIBLE', 'HIDDEN', 'DELETED');
  end if;

  if not exists (select 1 from pg_type where typname = 'discussion_comment_status') then
    create type discussion_comment_status as enum ('VISIBLE', 'HIDDEN', 'DELETED');
  end if;
end $$;

create table if not exists discussion_categories (
  category_id uuid primary key default gen_random_uuid(),
  slug varchar(100) not null unique,
  name varchar(150) not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  post_admin_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discussion_categories_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists idx_discussion_categories_active_order
  on discussion_categories(is_active, sort_order, category_id);

create table if not exists discussion_topics (
  topic_id uuid primary key default gen_random_uuid(),
  category_id uuid not null references discussion_categories(category_id) on delete restrict,
  author_id uuid not null references users(user_id) on delete restrict,
  novel_id uuid references novels(novel_id) on delete set null,
  title varchar(255) not null,
  body text not null,
  search_document text not null default '',
  official_requested boolean not null default false,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  status discussion_topic_status not null default 'VISIBLE',
  view_count integer not null default 0,
  reply_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  last_activity_user_id uuid references users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint discussion_topics_title_length check (char_length(btrim(title)) between 1 and 255),
  constraint discussion_topics_body_length check (char_length(btrim(body)) between 1 and 50000),
  constraint discussion_topics_counters_non_negative check (view_count >= 0 and reply_count >= 0)
);

-- Default order: pinned topics first, then last activity, then id for keyset paging.
create index if not exists idx_discussion_topics_activity
  on discussion_topics(status, is_pinned, last_activity_at, topic_id);

-- Newest-first order.
create index if not exists idx_discussion_topics_created
  on discussion_topics(status, created_at, topic_id);

-- Most-replies order.
create index if not exists idx_discussion_topics_replies
  on discussion_topics(status, reply_count, topic_id);

-- Category-filtered variants of the three orders above.
create index if not exists idx_discussion_topics_category_activity
  on discussion_topics(category_id, status, is_pinned, last_activity_at, topic_id);

create index if not exists idx_discussion_topics_category_created
  on discussion_topics(category_id, status, created_at, topic_id);

create index if not exists idx_discussion_topics_category_replies
  on discussion_topics(category_id, status, reply_count, topic_id);

-- Novel-filtered listing and the two-way novel/discussion link.
create index if not exists idx_discussion_topics_novel_activity
  on discussion_topics(novel_id, status, last_activity_at, topic_id)
  where novel_id is not null;

-- Author listing for the owner's own topics, including moderated ones.
create index if not exists idx_discussion_topics_author_created
  on discussion_topics(author_id, created_at, topic_id);

-- Accent-insensitive full text search over the application-normalized text.
create index if not exists idx_discussion_topics_search
  on discussion_topics using gin (to_tsvector('simple', search_document));

-- Moderation queue and recent-content scans that cannot use the VISIBLE-only paths.
create index if not exists idx_discussion_topics_status_activity
  on discussion_topics(status, last_activity_at desc, topic_id);

create table if not exists discussion_comments (
  comment_id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references discussion_topics(topic_id) on delete restrict,
  author_id uuid not null references users(user_id) on delete restrict,
  root_id uuid,
  reply_to_id uuid,
  body text not null,
  status discussion_comment_status not null default 'VISIBLE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint discussion_comments_body_length check (char_length(btrim(body)) between 1 and 20000),
  -- A top-level comment anchors itself: root_id null and reply_to_id null. A reply carries both.
  constraint discussion_comments_root_shape
    check ((root_id is null) = (reply_to_id is null)),
  constraint discussion_comments_self_reference
    check ((reply_to_id is null or reply_to_id <> comment_id)
      and (root_id is null or root_id <> comment_id)),
  unique (comment_id, topic_id),
  -- The service checks that this same-topic anchor is a top-level comment.
  constraint discussion_comments_root_topic_fk
    foreign key (root_id, topic_id)
    references discussion_comments(comment_id, topic_id)
    on delete restrict,
  -- Same-topic target: the reply target must also belong to the same topic.
  constraint discussion_comments_reply_target_topic_fk
    foreign key (reply_to_id, topic_id)
    references discussion_comments(comment_id, topic_id)
    on delete restrict
);

-- Top-level paging per topic: the main public read path.
create index if not exists idx_discussion_comments_topic_roots
  on discussion_comments(topic_id, created_at, comment_id)
  where root_id is null;

-- Reply paging and counting within one root.
create index if not exists idx_discussion_comments_root_created
  on discussion_comments(root_id, created_at, comment_id)
  where root_id is not null;

-- Target lookups and reverse references.
create index if not exists idx_discussion_comments_reply_to
  on discussion_comments(reply_to_id)
  where reply_to_id is not null;

-- Author listing and moderation lookups.
create index if not exists idx_discussion_comments_author_created
  on discussion_comments(author_id, created_at, comment_id);

create index if not exists idx_discussion_comments_topic_status
  on discussion_comments(topic_id, status, created_at, comment_id);

-- One like per user and topic, and one per user and comment. PUT inserts and DELETE removes the
-- row, so the composite key is the idempotency guard. Discussion rows are soft deleted, so a like
-- row is never removed by hiding or deleting a topic or comment.
create table if not exists discussion_topic_likes (
  topic_id uuid not null references discussion_topics(topic_id) on delete restrict,
  user_id uuid not null references users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (topic_id, user_id)
);

create index if not exists idx_discussion_topic_likes_user_created
  on discussion_topic_likes(user_id, created_at desc, topic_id);

create table if not exists discussion_comment_likes (
  comment_id uuid not null references discussion_comments(comment_id) on delete restrict,
  user_id uuid not null references users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists idx_discussion_comment_likes_user_created
  on discussion_comment_likes(user_id, created_at desc, comment_id);

-- View de-duplication: at most one row per topic, viewer key and day. viewer_key is the signed-in
-- user id or a random guest session id; no raw IP address is stored here.
create table if not exists discussion_topic_views (
  topic_id uuid not null references discussion_topics(topic_id) on delete restrict,
  viewer_key varchar(128) not null,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (topic_id, viewer_key, viewed_on),
  constraint discussion_topic_views_viewer_key_length check (char_length(viewer_key) between 1 and 128)
);

-- Retention sweep: delete rows older than the dedupe window by day.
create index if not exists idx_discussion_topic_views_day
  on discussion_topic_views(viewed_on, topic_id);

-- Initial categories. Idempotent: re-running the migration
-- inserts nothing. Only the announcements category is admin-only for posting.
insert into discussion_categories (slug, name, sort_order, is_active, post_admin_only)
values
  ('thao-luan-chung', 'Thảo luận chung', 10, true, false),
  ('thao-luan-truyen', 'Thảo luận truyện', 20, true, false),
  ('goc-tac-gia', 'Góc tác giả', 30, true, false),
  ('hoi-dap', 'Hỏi đáp', 40, true, false),
  ('gop-y-tac-pham', 'Góp ý tác phảm', 50, true, false),
  ('thong-bao-cong-dong', 'Thông báo cộng đồng', 60, true, true)
on conflict (slug) do nothing;

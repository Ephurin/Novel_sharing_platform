-- The existing follows relation serves both readers and authors.
create index if not exists idx_follows_target_follower on follows(author_id, follower_id);

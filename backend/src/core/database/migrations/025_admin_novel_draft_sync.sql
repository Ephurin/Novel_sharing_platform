-- Removing a novel also archives its MongoDB drafts (SRS admin-novel-management §4 step 8).
-- Like COMMENT_SYNC, the Mongo side effect is a durable job so a Mongo outage is retried, not lost.
alter table admin_jobs drop constraint admin_jobs_kind_check;
alter table admin_jobs add constraint admin_jobs_kind_check check(kind in ('COMMENT_SYNC','NOTIFY','NOVEL_DRAFT_SYNC'));

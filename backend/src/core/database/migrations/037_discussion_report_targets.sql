-- Commit these labels before a later migration or query uses them.
alter type report_target_type add value if not exists 'DISCUSSION';
alter type report_target_type add value if not exists 'DISCUSSION_COMMENT';
alter type moderation_target_type add value if not exists 'DISCUSSION';
alter type moderation_target_type add value if not exists 'DISCUSSION_COMMENT';

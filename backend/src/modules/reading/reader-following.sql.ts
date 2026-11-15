// Include legacy saved/liked novels in the unified reader-following state.
export const readerFollowingSql = `
  select novel_id, user_id, max(created_at) as created_at from (
    select novel_id, user_id, created_at from novel_follows
    union all select novel_id, user_id, created_at from bookmarks
    union all select novel_id, user_id, created_at from likes
  ) reader_interests group by novel_id, user_id
`;

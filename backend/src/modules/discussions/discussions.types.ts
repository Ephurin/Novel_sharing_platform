export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type DiscussionStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED';

export type DiscussionTargetKind = 'DISCUSSION' | 'DISCUSSION_COMMENT';

export type TopicSort = 'activity' | 'newest' | 'replies';

export type Category = {
  categoryId: string;
  slug: string;
  name: string;
  sortOrder: number;
  postAdminOnly: boolean;
};

export type TopicAuthor = {
  userId: string;
  publicKey?: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Omitted when the role is not available for public display. */
  role?: string;
};

export type TopicCategory = Category;

export type Topic = {
  topicId: string;
  topicSlug: string;
  category: TopicCategory;
  author: TopicAuthor | null;


  isPinned: boolean;
  isLocked: boolean;
  status: DiscussionStatus;
  title: string;
  body: string;
  viewCount: number;
  replyCount: number;
  likeCount: number;
  viewerLiked: boolean;
  lastActivityAt: string;
  lastActivityUser: TopicAuthor | null;
  createdAt: string;
  editedAt: string | null;
  /**
   * List responses only. `true` when this viewer already opened the topic inside
   * the retained view window (`discussion_topic_views`, pruned after 7 days),
   * `false` when the viewer is known but has no retained view, and omitted when
   * the request carried neither a session nor a guest view cookie — the API then
   * cannot tell, so nothing is claimed.
   */
  viewerViewed?: boolean;
};

export type CommentAuthor = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Omitted when the role is not available for public display. */
  role?: string;
};

export type Comment = {
  commentId: string;
  rootId: string | null;
  replyToId: string | null;
  author: CommentAuthor | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  status: DiscussionStatus;
  likeCount: number;
  viewerLiked: boolean;
  replyCount: number;
};

export type CommentLocation = {
  root: Comment;
  comment: Comment;
  /** Cursor that places `root` at the head of a root listing, or null if already first. */
  rootCursor: string | null;
  /** Cursor that places `comment` at the head of its page group, or null if already first. */
  commentCursor: string | null;
};

/** Public, aggregate-only counters for the community page. */
export type CommunityStats = {
  memberCount: number;
  topicCount: number;
  commentCount: number;
};

export type CommunityOverview = {
  stats: CommunityStats;
  /** Most replied topics with recent activity, already filtered to public content. */
  trending: Topic[];
};

export type TopicListInput = {
  /** Category slug. */
  category?: string;

  q?: string;
  sort: TopicSort;
  cursor?: string;
  limit: number;
};

export type CommentListInput = {
  rootId?: string;
  cursor?: string;
  limit: number;
};

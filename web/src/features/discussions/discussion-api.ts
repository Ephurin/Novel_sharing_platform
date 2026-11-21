import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

/** Public aggregate counters; identical for guests and members. */
export type CommunityStats = {
  memberCount: number;
  topicCount: number;
  commentCount: number;
};

export type CommunityOverview = {
  stats: CommunityStats;
  trending: Topic[];
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
  displayName: string | null;
  avatarUrl: string | null;
  /** Omitted when the role is not available for public display. */
  role?: string;
};

export type TopicCategory = Category;

export type Topic = {
  topicId: string;
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

export type TopicDraft = {
  categoryId: string;
  title: string;
  body: string;


};

export type TopicListParams = {  /** Category slug. */
  category?: string;

  q?: string;
  sort?: TopicSort;
  cursor?: string;
  limit?: number;
};

/** Runtime returns the standard envelope; unwrap `data` and fail loudly on `success: false`. */
function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.success) {
    const error = envelope.error;
    throw new Error(error ? `${error.code}: ${error.message}` : 'Yêu cầu thất bại.');
  }
  return envelope.data;
}

function dropEmpty<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') output[key] = value;
  }
  return output;
}

export async function listCategories(): Promise<Category[]> {
  const response = await apiClient.get<ApiEnvelope<Category[]>>('/discussions/categories');
  return unwrap(response.data);
}

export async function getCommunity(): Promise<CommunityOverview> {
  const response = await apiClient.get<ApiEnvelope<CommunityOverview>>('/discussions/community');
  return unwrap(response.data);
}

export async function listTopics(params: TopicListParams = {}): Promise<CursorPage<Topic>> {  const response = await apiClient.get<ApiEnvelope<CursorPage<Topic>>>('/discussions', {
    params: dropEmpty({
      category: params.category,

      q: params.q,
      sort: params.sort,
      cursor: params.cursor,
      limit: params.limit
    })
  });
  return unwrap(response.data);
}

export async function listOwnTopics(cursor?: string): Promise<CursorPage<Topic>> {
  const response = await apiClient.get<ApiEnvelope<CursorPage<Topic>>>('/discussions/me/topics', {
    params: dropEmpty({ cursor })
  });
  return unwrap(response.data);
}

export async function getTopic(id: string): Promise<Topic> {
  const response = await apiClient.get<ApiEnvelope<Topic>>(`/discussions/${encodeURIComponent(id)}`);
  return unwrap(response.data);
}

export async function createTopic(draft: TopicDraft): Promise<{ topicId: string }> {
  const response = await apiClient.post<ApiEnvelope<{ topicId: string }>>('/discussions', {
    categoryId: draft.categoryId,
    title: draft.title,
    body: draft.body,


  });
  return unwrap(response.data);
}

export async function updateTopic(id: string, draft: Partial<TopicDraft>): Promise<{ ok: boolean }> {
  const payload: Record<string, unknown> = {};
  if (draft.categoryId !== undefined) payload.categoryId = draft.categoryId;
  if (draft.title !== undefined) payload.title = draft.title;
  if (draft.body !== undefined) payload.body = draft.body;



  const response = await apiClient.patch<ApiEnvelope<{ ok: boolean }>>(
    `/discussions/${encodeURIComponent(id)}`,
    payload
  );
  return unwrap(response.data);
}

export async function deleteTopic(id: string): Promise<{ ok: boolean }> {
  const response = await apiClient.delete<ApiEnvelope<{ ok: boolean }>>(
    `/discussions/${encodeURIComponent(id)}`
  );
  return unwrap(response.data);
}

export async function listComments(
  topicId: string,
  rootId?: string,
  cursor?: string
): Promise<CursorPage<Comment>> {
  const response = await apiClient.get<ApiEnvelope<CursorPage<Comment>>>(
    `/discussions/${encodeURIComponent(topicId)}/comments`,
    { params: dropEmpty({ rootId, cursor }) }
  );
  return unwrap(response.data);
}

export async function locateComment(topicId: string, commentId: string): Promise<CommentLocation> {
  const response = await apiClient.get<ApiEnvelope<CommentLocation>>(
    `/discussions/${encodeURIComponent(topicId)}/comments/${encodeURIComponent(commentId)}/location`
  );
  return unwrap(response.data);
}

export async function createComment(
  topicId: string,
  body: string,
  replyToId?: string
): Promise<{ commentId: string }> {
  const response = await apiClient.post<ApiEnvelope<{ commentId: string }>>(
    `/discussions/${encodeURIComponent(topicId)}/comments`,
    dropEmpty({ body, replyToId })
  );
  return unwrap(response.data);
}

export async function updateComment(
  topicId: string,
  commentId: string,
  body: string
): Promise<{ ok: boolean }> {
  const response = await apiClient.patch<ApiEnvelope<{ ok: boolean }>>(
    `/discussions/${encodeURIComponent(topicId)}/comments/${encodeURIComponent(commentId)}`,
    { body }
  );
  return unwrap(response.data);
}

export async function deleteComment(topicId: string, commentId: string): Promise<{ ok: boolean }> {
  const response = await apiClient.delete<ApiEnvelope<{ ok: boolean }>>(
    `/discussions/${encodeURIComponent(topicId)}/comments/${encodeURIComponent(commentId)}`
  );
  return unwrap(response.data);
}

/** `commentId === null` targets the topic itself; otherwise the given comment. */
export async function setLike(
  topicId: string,
  commentId: string | null,
  liked: boolean
): Promise<{ ok: boolean }> {
  const base = `/discussions/${encodeURIComponent(topicId)}`;
  const path =
    commentId === null
      ? `${base}/reaction`
      : `${base}/comments/${encodeURIComponent(commentId)}/reaction`;

  const response = liked
    ? await apiClient.put<ApiEnvelope<{ ok: boolean }>>(path)
    : await apiClient.delete<ApiEnvelope<{ ok: boolean }>>(path);

  return unwrap(response.data);
}

export async function recordView(topicId: string): Promise<{ ok: boolean }> {
  const response = await apiClient.post<ApiEnvelope<{ ok: boolean }>>(
    `/discussions/${encodeURIComponent(topicId)}/views`
  );
  return unwrap(response.data);
}

export async function reportDiscussion(
  targetType: DiscussionTargetKind,
  targetId: string,
  reason: string,
  description?: string
): Promise<{ ok: boolean }> {
  const response = await apiClient.post<ApiEnvelope<{ ok: boolean }>>('/reports', {
    targetType,
    targetId,
    reason,
    ...(description ? { description } : {})
  });
  return unwrap(response.data);
}

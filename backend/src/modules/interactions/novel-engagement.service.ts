import { isContentAdmin } from '../../core/security/auth-context.js';
import type { ReviewSort } from './novel-engagement.repository.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { findNovelById } from '../novels/novels.repository.js';
import { getNovelStatistics, isActiveReader, listNovelReviews, setNovelFollow, setNovelRating } from './novel-engagement.repository.js';

export async function readNovelStatistics(novelId: string, auth?: AuthContext) {
  const novel = await findNovelById(novelId);
  const owner = Boolean(auth && (auth.userId === novel?.authorId || isContentAdmin(auth)));
  if (!novel || (novel.status !== 'PUBLISHED' && !owner)) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }
  return getNovelStatistics(novelId, auth?.userId, owner);
}

export async function updateNovelEngagement(auth: AuthContext, novelId: string, change: { following: boolean } | { score: number | null; review?: string | null }) {
  // Check current account state, not only the role in a potentially stale JWT.
  if (auth.role !== 'READER' || !await isActiveReader(auth.userId)) {
    throw new AppError(403, 'INTERACTION_004', 'Only active registered readers can rate or follow novels');
  }
  const novel = await findNovelById(novelId);
  if (!novel || novel.status !== 'PUBLISHED') throw new AppError(404, 'CONTENT_001', 'Content not found');
  if (novel.authorId === auth.userId) throw new AppError(403, 'INTERACTION_003', 'Authors cannot rate or follow their own novel');
  if ('following' in change) await setNovelFollow(novelId, auth.userId, change.following);
  else await setNovelRating(novelId, auth.userId, change.score, change.review);
  return readNovelStatistics(novelId, auth);
}

export async function readNovelReviews(novelId: string, page: number, limit: number, auth?: AuthContext, sort: ReviewSort = 'newest') {
  await readNovelStatistics(novelId, auth);
  const result = await listNovelReviews(novelId, page, limit, sort);
  return { data: result.items, meta: { page, limit, ratingAverage: result.ratingAverage, totalItems: result.totalItems, totalPages: Math.ceil(result.totalItems / limit) } };
}

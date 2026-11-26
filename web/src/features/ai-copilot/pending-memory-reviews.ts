import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../auth/useAuthStore';
import { getReviewQueue } from '../manuscript-import/manuscript-import-api';
import { getEntityReviews, type EntityReview } from './author-memory-api';

// A chapter's memory update waits on the author twice: first the entity (identity) checkpoint,
// then the Canon proposals. Both must be counted, or the author sees "0 pending" while Story Brain
// silently stops learning new chapters.
export function entityReviewNeedsAuthor(review: Pick<EntityReview, 'status'>) {
  return review.status === 'waiting_entity_review' || review.status === 'entities_reviewed';
}

export function usePendingMemoryReviews(novelId: string, options: { enabled?: boolean; intervalMs?: number } = {}) {
  const accountScope = useAuthStore(state => state.user?.userId ?? 'guest');
  const enabled = Boolean(novelId) && options.enabled !== false;
  const refetchInterval = enabled ? options.intervalMs ?? 15000 : false;
  // Own cache keys: the badge polls even while the Memory panel is closed, and must not feed
  // (or be fed by) the panel's richer queries.
  const entityReviews = useQuery<EntityReview[]>({
    queryKey: ['pending-entity-reviews', novelId, accountScope],
    queryFn: () => getEntityReviews(novelId),
    enabled,
    refetchInterval
  });
  const proposals = useQuery({
    queryKey: ['pending-memory-proposals', novelId, accountScope],
    queryFn: () => getReviewQueue(novelId),
    enabled,
    refetchInterval
  });
  // A badge must never break writing: ignore anything that is not a list.
  const entityCount = Array.isArray(entityReviews.data) ? entityReviews.data.filter(entityReviewNeedsAuthor).length : 0;
  const proposalCount = Array.isArray(proposals.data) ? proposals.data.length : 0;
  // Only claim "nothing to review" once both lists actually loaded.
  const known = Array.isArray(entityReviews.data) && Array.isArray(proposals.data);
  return { entityCount, proposalCount, total: entityCount + proposalCount, known };
}

import type { Chapter, PublicationReview } from './novel-types';

export function publicationDecisionLabel(review?: PublicationReview | null) {
  if (review?.status === 'REVISION_REQUIRED') return 'Yêu cầu sửa';
  if (review?.status === 'REJECTED') return 'Từ chối';
  return null;
}

export function chapterPublicationDecision(chapter?: Pick<Chapter, 'status' | 'pendingPublicationRevision' | 'publicationReview'>) {
  if (chapter?.pendingPublicationRevision || (chapter?.status !== 'REJECTED' && chapter?.status !== 'PUBLISHED')) return null;
  const label = publicationDecisionLabel(chapter.publicationReview);
  return label ? { label, reason: chapter.publicationReview?.reason ?? null } : null;
}

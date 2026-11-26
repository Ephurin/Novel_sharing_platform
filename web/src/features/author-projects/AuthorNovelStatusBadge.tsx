import type { Novel } from '../novels/novel-types';
import { publicationDecisionLabel } from '../novels/publication-review';

const publicationStatuses = {
  DRAFT: { label: 'Bản nháp', tone: 'neutral' },
  PENDING_MODERATION: { label: 'Chờ duyệt', tone: 'warning' },
  REJECTED: { label: 'Từ chối', tone: 'danger' }
} as const;

const serialStatuses = {
  ONGOING: { label: 'Đang sáng tác', tone: 'primary' },
  COMPLETED: { label: 'Hoàn thành', tone: 'success' },
  HIATUS: { label: 'Tạm ngưng', tone: 'neutral' }
} as const;

export function AuthorNovelStatusBadge({ status, serialStatus, publicationReview }: Pick<Novel, 'status' | 'serialStatus' | 'publicationReview'>) {
  const { label: baseLabel, tone } = status === 'PUBLISHED'
    ? serialStatuses[serialStatus] ?? serialStatuses.ONGOING
    : publicationStatuses[status] ?? publicationStatuses.DRAFT;
  // A rejected novel may be "Yêu cầu sửa" rather than a final "Từ chối".
  const label = status === 'REJECTED' ? publicationDecisionLabel(publicationReview) ?? baseLabel : baseLabel;

  return <span className="sc-novel-status" data-tone={tone}>{label}</span>;
}

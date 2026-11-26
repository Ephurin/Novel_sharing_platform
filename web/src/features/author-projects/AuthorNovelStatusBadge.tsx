import type { Novel } from '../novels/novel-types';

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

export function AuthorNovelStatusBadge({ status, serialStatus }: Pick<Novel, 'status' | 'serialStatus'>) {
  const { label, tone } = status === 'PUBLISHED'
    ? serialStatuses[serialStatus] ?? serialStatuses.ONGOING
    : publicationStatuses[status] ?? publicationStatuses.DRAFT;

  return <span className="sc-novel-status" data-tone={tone}>{label}</span>;
}

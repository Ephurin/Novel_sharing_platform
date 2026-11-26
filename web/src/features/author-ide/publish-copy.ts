import type { Chapter, ChapterStatus, NovelStatus } from '../novels/novel-types';
import { chapterPublicationDecision } from '../novels/publication-review';

const NOVEL_STATUS_LABEL: Record<NovelStatus, string> = {
  DRAFT: 'bản nháp', PENDING_MODERATION: 'đang chờ duyệt', PUBLISHED: 'công khai', REJECTED: 'bị từ chối'
};

const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  DRAFT: 'Bản nháp',
  PENDING_MODERATION: 'Chờ duyệt',
  PUBLISHED: 'Đã xuất bản',
  REJECTED: 'Từ chối',
  ARCHIVED: 'Đã lưu trữ'
};

export function chapterPublicationLabel(chapter?: Pick<Chapter, 'status' | 'pendingPublicationRevision' | 'publicationReview'>) {
  if (chapter?.pendingPublicationRevision) return 'Phiên bản mới chờ duyệt';
  const decision = chapterPublicationDecision(chapter);
  if (decision) return chapter?.status === 'PUBLISHED' ? `Bản gửi mới: ${decision.label}` : decision.label;
  return CHAPTER_STATUS_LABEL[chapter?.status ?? 'DRAFT'];
}

export function novelHiddenFromReaders(status: NovelStatus | undefined): boolean {
  return Boolean(status) && status !== 'PUBLISHED';
}

export function publishCopy(novelStatus: NovelStatus | undefined) {
  const hidden = novelHiddenFromReaders(novelStatus);
  return {
    confirm: 'Gửi duyệt chương',
    pending: 'Đang gửi duyệt...',
    notice: 'Hệ thống kiểm tra nội dung trước khi chuyển cho admin. Chương chỉ được xuất bản sau khi admin duyệt.',
    readerNotice: hidden
      ? `Truyện đang ở trạng thái ${NOVEL_STATUS_LABEL[novelStatus!]}, nên độc giả chưa đọc được chương này. Hãy gửi duyệt truyện ở trang thông tin truyện để công khai.`
      : null
  };
}

export function publishedToast(moderationRequired: boolean, novelStatus: NovelStatus | undefined): string {
  if (moderationRequired) return 'Chương đang chờ kiểm duyệt của admin trước khi được đăng.';
  return novelHiddenFromReaders(novelStatus)
    ? 'Chương đã được đăng, nhưng độc giả chỉ đọc được sau khi truyện được công khai.'
    : 'Chương đã được xuất bản công khai thành công!';
}

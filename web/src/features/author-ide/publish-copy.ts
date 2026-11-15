import type { NovelStatus } from '../novels/novel-types';

// Live retest 3: the dialog said "Xác nhận gửi duyệt" but most chapters are published at once (P5),
// and a chapter of a novel that is not public yet showed "Đã đăng" while readers got a raw
// CONTENT_001 error (P4).
const NOVEL_STATUS_LABEL: Record<NovelStatus, string> = {
  DRAFT: 'bản nháp', PENDING_MODERATION: 'đang chờ duyệt', PUBLISHED: 'công khai', REJECTED: 'bị từ chối'
};

export function novelHiddenFromReaders(status: NovelStatus | undefined): boolean {
  return Boolean(status) && status !== 'PUBLISHED';
}

export function publishCopy(novelStatus: NovelStatus | undefined) {
  const hidden = novelHiddenFromReaders(novelStatus);
  return {
    confirm: 'Xuất bản chương',
    pending: 'Đang xuất bản...',
    notice: 'Hệ thống quét nội dung trước khi đăng. Nếu phát hiện nội dung cần kiểm duyệt, chương sẽ chờ duyệt; nếu không, chương được đăng ngay.',
    readerNotice: hidden
      ? `Truyện đang ở trạng thái ${NOVEL_STATUS_LABEL[novelStatus!]}, nên độc giả chưa đọc được chương này. Hãy gửi duyệt truyện ở trang thông tin truyện để công khai.`
      : null
  };
}

export function publishedToast(moderationRequired: boolean, novelStatus: NovelStatus | undefined): string {
  if (moderationRequired) return 'Chương đang chờ kiểm duyệt trước khi được đăng.';
  return novelHiddenFromReaders(novelStatus)
    ? 'Chương đã được đăng, nhưng độc giả chỉ đọc được sau khi truyện được công khai.'
    : 'Chương đã được xuất bản công khai thành công!';
}

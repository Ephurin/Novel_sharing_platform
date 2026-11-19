import { AnimatedModal as Modal } from '../../shared/components/AnimatedModal';
import { Button } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AdminError } from './AdminShared';
import { getAdminChapterPreview } from './admin-api';
import { LoadingState } from '../../shared/components/PageStates';

export function AdminChapterPreview({
  chapterId,
  onClose
}: {
  chapterId: string | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ['admin-chapter', chapterId],
    enabled: !!chapterId,
    queryFn: () => getAdminChapterPreview(chapterId!)
  });
  const preview = query.data;
  return (
    <Modal
      opened={!!chapterId}
      onClose={onClose}
      title={preview?.title || 'Nội dung chương'}
      size="xl"
    >
      <AdminError error={query.error} />
      {query.isLoading && <LoadingState label="Đang tải nội dung..." />}
      {preview && (
        <>
          {(preview.contentSource || preview.pendingReviewId) && (
            <div className="admin-actions" style={{ marginBottom: 12 }}>
              {preview.contentSource && (
                <span className="admin-muted">
                  {preview.contentSource === 'submitted'
                    ? 'Phiên bản đã gửi để kiểm duyệt'
                    : 'Bản nháp đã lưu'}
                </span>
              )}
              {preview.pendingReviewId && (
                <Button
                  component={Link}
                  to={`/admin/moderation/${preview.pendingReviewId}`}
                  variant="light"
                  size="xs"
                  onClick={onClose}
                >
                  Mở hồ sơ kiểm duyệt
                </Button>
              )}
            </div>
          )}
          <div className="admin-prose">{preview.content || 'Chưa có nội dung chương đã lưu.'}</div>
        </>
      )}
    </Modal>
  );
}

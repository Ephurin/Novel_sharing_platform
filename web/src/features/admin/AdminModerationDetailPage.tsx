import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getModerationReview, resolveModerationReview } from './admin-api';
import {
  AdminConfirm,
  AdminHeader,
  AdminPanel,
  dateTime,
  labels,
  number,
  Status
} from './AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

export function AdminModerationDetailPage() {
  const { reviewId = '' } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [reason, setReason] = useState('');
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['admin-moderation-detail', reviewId],
    queryFn: () => getModerationReview(reviewId)
  });
  const mutation = useMutation({
    mutationFn: () => resolveModerationReview(reviewId, decision!, reason),
    onSuccess: async () => {
      setDecision(null);
      setReason('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-moderation'] }),
        cache.invalidateQueries({
          queryKey: ['admin-moderation-detail', reviewId]
        }),
        cache.invalidateQueries({ queryKey: ['admin-stats'] })
      ]);
    }
  });
  if (query.isLoading) return <LoadingState label="Đang tải chi tiết kiểm duyệt..." />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const review = query.data;
  if (!review) return <EmptyState description="Không tìm thấy mục kiểm duyệt." />;
  const report = review.source === 'USER_REPORT';
  const commentReport = report && review.targetType === 'COMMENT';
  const content = review.target?.content || '';
  const approveLabel = report ? 'Chấp nhận báo cáo' : 'Duyệt nội dung';
  const rejectLabel = report ? 'Từ chối báo cáo' : 'Từ chối nội dung';
  return (
    <>
      <div className="admin-actions">
        <Button variant="subtle" onClick={() => navigate(-1)}>
          ← Quay lại
        </Button>
        <Button
          component={Link}
          to={report ? '/admin/reports' : '/admin/moderation'}
          variant="subtle"
        >
          Mở hàng đợi
        </Button>
      </div>
      <AdminHeader title="Chi tiết kiểm duyệt" description={`Mã vụ: ${review.reviewId}`}>
        <Status value={review.status} />
      </AdminHeader>
      <div className="admin-grid-two">
        <AdminPanel>
          <h2>Nội dung cần kiểm tra</h2>
          <p className="admin-id">
            {labels[review.targetType]} · {review.targetId}
          </p>
          {review.target ? (
            <>
              <h3>{review.target.title}</h3>
              {review.target.username && <p className="admin-muted">@{review.target.username}</p>}
              {review.target.novelTitle && (
                <p className="admin-muted">
                  {review.target.novelTitle}{' '}
                  {review.target.chapterTitle && `· ${review.target.chapterTitle}`}
                </p>
              )}
              {review.target.isSubmittedVersion && (
                <p className="admin-muted">Phiên bản đã gửi để kiểm duyệt</p>
              )}
              <div className="admin-prose">
                {expanded || content.length <= 800
                  ? content || 'Đối tượng chưa có nội dung văn bản.'
                  : `${content.slice(0, 800)}…`}
              </div>
              {content.length > 800 && (
                <Button variant="subtle" onClick={() => setExpanded(!expanded)}>
                  {expanded ? 'Thu gọn' : 'Xem đầy đủ'}
                </Button>
              )}
              {review.target.novelId && (
                <p>
                  <Link className="admin-link" to={`/admin/novels/${review.target.novelId}`}>
                    Mở truyện liên quan →
                  </Link>
                </p>
              )}
            </>
          ) : (
            <EmptyState description="Đối tượng không còn tồn tại hoặc không có nội dung để xem." />
          )}
        </AdminPanel>
        <div>
          <AdminPanel>
            <h2>Bằng chứng</h2>
            <p>Nguồn: {labels[review.source]}</p>
            <p>{number(review.evidenceSummary.reportCount)} báo cáo</p>
            {review.evidenceSummary.summary && <p>{review.evidenceSummary.summary}</p>}
            {review.reportReasons?.map((item) => (
              <div className="admin-task" key={item.reason}>
                <span>{item.reason}</span>
                <span>{number(item.count)} lượt</span>
              </div>
            ))}
            {review.evidenceSummary.matchedRules.map((rule) => (
              <p key={rule}>
                <Status value="PENDING" /> {rule}
              </p>
            ))}
            {!review.evidenceSummary.reportCount && !review.evidenceSummary.matchedRules.length && (
              <p className="admin-muted">Chưa có bằng chứng bổ sung.</p>
            )}
          </AdminPanel>
          <AdminPanel>
            <h2>Thông tin kiểm duyệt</h2>
            <p>Đối tượng: {labels[review.targetType]}</p>
            <p>Tiếp nhận: {dateTime(review.createdAt)}</p>
            {review.reviewedAt && <p>Xử lý: {dateTime(review.reviewedAt)}</p>}
            {review.reason && <p className="admin-prose">Lý do: {review.reason}</p>}
          </AdminPanel>
        </div>
      </div>
      <AdminPanel>
        <h2>Quyết định xử lý</h2>
        <div className="admin-actions">
          <Button
            disabled={review.status !== 'PENDING'}
            data-testid={commentReport ? 'admin-approve-report-btn' : 'admin-approve-review-btn'}
            onClick={() => {
              mutation.reset();
              setReason('');
              setDecision('APPROVED');
            }}
          >
            {approveLabel}
          </Button>
          <Button
            color="red"
            className="admin-danger"
            variant="light"
            disabled={review.status !== 'PENDING'}
            data-testid={commentReport ? 'admin-reject-report-btn' : 'admin-reject-review-btn'}
            onClick={() => {
              mutation.reset();
              setReason('');
              setDecision('REJECTED');
            }}
          >
            {rejectLabel}
          </Button>
        </div>
      </AdminPanel>
      <AdminConfirm
        destructive={decision === 'REJECTED' || commentReport}
        opened={!!decision}
        title={decision === 'APPROVED' ? approveLabel : rejectLabel}
        confirmLabel="Xác nhận xử lý"
        reason={reason}
        setReason={setReason}
        required={decision === 'REJECTED'}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setDecision(null)}
        onConfirm={() => mutation.mutate()}
      >
        <p>
          {commentReport
            ? decision === 'APPROVED'
              ? 'Bình luận sẽ bị gỡ và các báo cáo liên quan được đánh dấu đã xử lý.'
              : 'Báo cáo sẽ bị từ chối. Bình luận được giữ nguyên.'
            : report
              ? 'Ghi nhận quyết định xử lý báo cáo đối với đối tượng này.'
              : decision === 'APPROVED'
                ? 'Duyệt phiên bản nội dung đã gửi để phát hành.'
                : 'Từ chối phiên bản nội dung đang chờ duyệt.'}
        </p>
      </AdminConfirm>
    </>
  );
}

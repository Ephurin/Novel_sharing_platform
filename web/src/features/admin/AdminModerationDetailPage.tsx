import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getModerationReview, resolveModerationReview } from './admin-api';
import {
  AdminConfirm,
  AdminHeader,
  AdminId,
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
      <AdminHeader
        title="Chi tiết kiểm duyệt"
        description={`${labels[review.source]} · ${labels[review.targetType]}`}
      >
        <Status value={review.status} />
      </AdminHeader>
      <div className="admin-grid-two admin-review-layout">
        <AdminPanel>
          <h2>Nội dung cần kiểm tra</h2>
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
              <div className="admin-prose" id="admin-review-content">
                {expanded || content.length <= 800
                  ? content || 'Đối tượng chưa có nội dung văn bản.'
                  : `${content.slice(0, 800)}…`}
              </div>
              {content.length > 800 && (
                <Button
                  variant="subtle"
                  aria-expanded={expanded}
                  aria-controls="admin-review-content"
                  onClick={() => setExpanded(!expanded)}
                >
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
            {(report || review.evidenceSummary.reportCount > 0) && (
              <p>{number(review.evidenceSummary.reportCount)} báo cáo</p>
            )}
            {review.evidenceSummary.summary && (
              <p className="admin-prose">{review.evidenceSummary.summary}</p>
            )}
            {review.reportReasons?.map((item) => (
              <div className="admin-task" key={item.reason}>
                <span>{item.reason}</span>
                <span>{number(item.count)} lượt</span>
              </div>
            ))}
            {!!review.evidenceSummary.matchedRules.length && (
              <ul className="admin-evidence-list">
                {review.evidenceSummary.matchedRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            )}
            {!review.evidenceSummary.reportCount && !review.evidenceSummary.matchedRules.length && (
              <p className="admin-muted">Chưa có bằng chứng bổ sung.</p>
            )}
          </AdminPanel>
          <AdminPanel>
            <h2>Quyết định xử lý</h2>
            {review.reason && <p className="admin-prose">Lý do: {review.reason}</p>}
            {mutation.isSuccess && (
              <p role="status" className="admin-muted">
                Đã lưu quyết định xử lý.
              </p>
            )}
            <div className="admin-actions">
              <Button
                disabled={review.status !== 'PENDING' || mutation.isPending}
                data-testid={
                  commentReport ? 'admin-approve-report-btn' : 'admin-approve-review-btn'
                }
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
                disabled={review.status !== 'PENDING' || mutation.isPending}
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
        </div>
      </div>
      <details className="admin-metadata">
        <summary>Thông tin kiểm duyệt</summary>
        <dl>
          <dt>Mã kiểm duyệt</dt>
          <dd>
            <AdminId value={review.reviewId} label="mã kiểm duyệt" compact={false} />
          </dd>
          <dt>Mã đối tượng</dt>
          <dd>
            <AdminId value={review.targetId} label="mã đối tượng" compact={false} />
          </dd>
          <dt>Tiếp nhận</dt>
          <dd>{dateTime(review.createdAt)}</dd>
          {review.reviewedAt && (
            <>
              <dt>Xử lý</dt>
              <dd>{dateTime(review.reviewedAt)}</dd>
            </>
          )}
        </dl>
      </details>
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
            : review.targetType === 'COMMENT'
              ? decision === 'APPROVED'
                ? 'Bình luận sẽ được duyệt để hiển thị.'
                : 'Bình luận sẽ bị từ chối kiểm duyệt.'
              : review.targetType === 'NOVEL' || review.targetType === 'CHAPTER'
                ? decision === 'APPROVED'
                  ? 'Duyệt xuất bản nội dung theo phiên bản đang được kiểm duyệt.'
                  : 'Từ chối xuất bản nội dung đang được kiểm duyệt.'
                : 'Ghi nhận quyết định xử lý trong hồ sơ kiểm duyệt tài khoản.'}
        </p>
      </AdminConfirm>
    </>
  );
}

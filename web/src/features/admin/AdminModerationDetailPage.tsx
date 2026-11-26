import { useState } from 'react';
import { GiphyMedia } from '../reader/CommentGifPicker';
import { AnimatedDisclosure } from '../../shared/components/AnimatedDisclosure';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Select, Alert } from '@mantine/core';
import { useAdminAccess } from './admin-operations-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getModerationReview, resolveModerationReview } from './admin-api';
import {
  AdminConfirm,
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
  const [reportAction, setReportAction] = useState('');
  const access = useAdminAccess();
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['admin-moderation-detail', reviewId],
    queryFn: () => getModerationReview(reviewId)
  });
  const mutation = useMutation({
    mutationFn: () =>
      resolveModerationReview(
        reviewId,
        decision!,
        reason,
        query.data?.source === 'USER_REPORT'
          ? (query.data.targetType.startsWith('DISCUSSION') ? 'HIDE' : reportAction || (query.data.targetType === 'COMMENT' ? 'HIDE' : 'WARN'))
          : undefined
      ),
    onSuccess: async () => {
      setDecision(null);
      setReason('');
      const review = query.data;
      const novelId = review?.target?.novelId;
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-moderation'] }),
        cache.invalidateQueries({
          queryKey: ['admin-moderation-detail', reviewId]
        }),
        cache.invalidateQueries({ queryKey: ['admin-stats'] }),
        ...(novelId
          ? [cache.invalidateQueries({ queryKey: ['admin-novel-detail', novelId] })]
          : []),
        ...(review?.targetType === 'CHAPTER'
          ? [cache.invalidateQueries({ queryKey: ['admin-chapter', review.targetId] })]
          : [])
      ]);
    }
  });
  if (query.isLoading) return <LoadingState label="Đang tải chi tiết kiểm duyệt..." />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const review = query.data;
  if (!review) return <EmptyState description="Không tìm thấy mục kiểm duyệt." />;
  const report = review.source === 'USER_REPORT';
  const commentReport = report && review.targetType === 'COMMENT';
  const discussionReport = report && review.targetType.startsWith('DISCUSSION');
  const escalationOpen = review.escalation?.status === 'OPEN';
  const selectedAction = discussionReport ? 'HIDE' : reportAction || (commentReport ? 'HIDE' : 'WARN');
  const content = review.target?.content || '';
  const publication = !report && (review.targetType === 'NOVEL' || review.targetType === 'CHAPTER');
  const approveLabel = report ? 'Chấp nhận báo cáo' : publication ? 'Duyệt xuất bản' : 'Duyệt nội dung';
  const rejectLabel = report ? 'Từ chối báo cáo' : 'Từ chối nội dung';
  return (
    <div className="admin-review-page">
      <Button variant="subtle" size="compact-sm" mb="sm" onClick={() => navigate(-1)}>
        ← Quay lại
      </Button>
      <header className="admin-page-header admin-review-header">
        <div>
          <div className="admin-review-title">
            <h1>Chi tiết kiểm duyệt</h1>
            <Status value={review.status} />
          </div>
          <p>{labels[review.source]} · {labels[review.targetType]}</p>
        </div>
        <Button
          component={Link}
          to={report ? '/admin/reports' : '/admin/moderation'}
          variant="default"
          size="sm"
        >
          Mở hàng đợi
        </Button>
      </header>
      <div className="admin-review-layout">
        <AdminPanel className="admin-review-reader">
          {review.target ? (
            <>
              <header className="admin-review-reader-header">
                <h2>{review.target.title || 'Nội dung cần kiểm tra'}</h2>
                <div className="admin-review-byline">
                  {review.target.username && <span>@{review.target.username}</span>}
                  {review.target.novelId ? (
                    <Link className="admin-link" to={`/admin/novels/${review.target.novelId}`}>
                      {review.target.novelTitle || 'Mở truyện liên quan'} →
                    </Link>
                  ) : review.target.novelTitle && <span>{review.target.novelTitle}</span>}
                  {review.target.chapterTitle && <span>{review.target.chapterTitle}</span>}
                </div>
                {review.target.isSubmittedVersion && (
                  <p className="admin-muted">Phiên bản đã gửi để kiểm duyệt</p>
                )}
              </header>
              <div className="admin-prose admin-review-manuscript" id="admin-review-content">
                {expanded || content.length <= 800
                  ? content || 'Đối tượng chưa có nội dung văn bản.'
                  : `${content.slice(0, 800)}…`}
              </div>
              {review.target.gifId && <div className="admin-review-gif"><GiphyMedia id={review.target.gifId} /></div>}
              {content.length > 800 && (
                <Button
                  variant="subtle"
                  mt="sm"
                  aria-expanded={expanded}
                  aria-controls="admin-review-content"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? 'Thu gọn' : 'Xem đầy đủ'}
                </Button>
              )}
            </>
          ) : (
            <EmptyState description="Đối tượng không còn tồn tại hoặc không có nội dung để xem." />
          )}
        </AdminPanel>
        <aside className="admin-review-sidebar" aria-label="Bằng chứng và quyết định kiểm duyệt">
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
            {review.reportDescriptions?.some((item) => item.description) && (
              <AnimatedDisclosure summary="Mô tả từ người báo cáo">
                {review.reportDescriptions
                  .filter((item) => item.description)
                  .map((item, index) => (
                    <p key={index} className="admin-prose">
                      <strong>{item.reason}: </strong>
                      {item.description}
                    </p>
                  ))}
              </AnimatedDisclosure>
            )}
            {!!review.evidenceSummary.matchedRules.length && (
              <ul className="admin-evidence-list">
                {review.evidenceSummary.matchedRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            )}
            {!review.evidenceSummary.reportCount && !review.evidenceSummary.matchedRules.length && !review.evidenceSummary.summary && (
              <p className="admin-muted">Chưa có bằng chứng bổ sung.</p>
            )}
          </AdminPanel>
          <AdminPanel>
            <h2>Quyết định xử lý</h2>
            {review.sanctions?.map((s) => (
              <p key={s.sanction_id}>
                {labels[s.action] || s.action} · {s.active ? 'Còn hiệu lực' : 'Đã thu hồi'}
                {s.pending ? ' · Đang đồng bộ' : ''}
              </p>
            ))}
            {review.sanctions?.some((s) => s.pending) && (
              <Alert color="yellow" mb="sm">
                Quyết định đã lưu. Nội dung đang chờ đồng bộ; dùng nút tải lại để kiểm tra.
              </Alert>
            )}
            {escalationOpen && (
              <Alert color="blue" mb="sm" data-testid="admin-escalation-open-notice">
                Hồ sơ đang chờ Admin quyết trong hàng đợi chuyển cấp. Truy cập{' '}
                <Link to="/admin/escalations">hàng đợi chuyển cấp</Link> để xử lý.
              </Alert>
            )}
            {report && review.status === 'PENDING' && (
              <Select
                label="Hành động khi tiếp nhận báo cáo"
                mb="md"
                value={selectedAction}
                data={discussionReport ? [{ value: 'HIDE', label: 'Ẩn nội dung vi phạm' }] : [
                  { value: 'WARN', label: 'Cảnh báo, giữ nguyên nội dung' },
                  ...(review.targetType === 'USER'
                    ? access.data?.permissions.includes('users')
                      ? [{ value: 'LOCK', label: 'Khóa tài khoản' }]
                      : []
                    : [{ value: 'HIDE', label: 'Ẩn nội dung vi phạm' }])
                ]}
                onChange={(v) => setReportAction(v || 'WARN')}
              />
            )}
            {review.reason && <p className="admin-prose">Lý do: {review.reason}</p>}
            {mutation.isSuccess && (
              <p role="status" className="admin-muted">
                Đã lưu quyết định xử lý.
              </p>
            )}
            <div className="admin-review-decisions">
              <Button
                disabled={review.status !== 'PENDING' || escalationOpen || mutation.isPending}
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
                disabled={review.status !== 'PENDING' || escalationOpen || mutation.isPending}
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
          <AnimatedDisclosure className="admin-panel admin-metadata" summary="Thông tin kiểm duyệt">
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
          </AnimatedDisclosure>
        </aside>
      </div>
      <AdminConfirm
        destructive={
          decision === 'REJECTED' ||
          (Boolean(report) &&
            decision === 'APPROVED' &&
            selectedAction !== 'WARN')
        }
        opened={!!decision}
        title={decision === 'APPROVED' ? approveLabel : rejectLabel}
        confirmLabel="Xác nhận xử lý"
        reason={reason}
        setReason={setReason}
        required={report || decision === 'REJECTED'}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setDecision(null)}
        onConfirm={() => mutation.mutate()}
      >
        <p>
          {report
            ? decision === 'APPROVED'
              ? selectedAction === 'WARN'
                ? 'Gửi cảnh báo và đánh dấu báo cáo đã xử lý. Nội dung được giữ nguyên.'
                : reportAction === 'LOCK'
                  ? 'Khóa tài khoản và ghi nhận lý do.'
                  : 'Ẩn nội dung vi phạm. Trạng thái xuất bản được giữ nguyên.'
              : 'Bác báo cáo và giữ nguyên nội dung / tài khoản.'
            : review.targetType === 'COMMENT'
              ? decision === 'APPROVED'
                ? 'Bình luận sẽ được duyệt để hiển thị.'
                : 'Bình luận sẽ bị từ chối kiểm duyệt.'
              : publication
                ? decision === 'APPROVED'
                  ? 'Duyệt xuất bản nội dung theo phiên bản đang được kiểm duyệt.'
                  : 'Từ chối xuất bản nội dung đang được kiểm duyệt.'
                : 'Ghi nhận quyết định xử lý trong hồ sơ kiểm duyệt tài khoản.'}
        </p>
      </AdminConfirm>
    </div>
  );
}

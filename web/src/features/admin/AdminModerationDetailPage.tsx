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
          ? reportAction || (query.data.targetType === 'COMMENT' ? 'HIDE' : 'WARN')
          : undefined
      ),
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
              {review.target.gifId && <div className="admin-review-gif"><GiphyMedia id={review.target.gifId} /></div>}
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
            {!review.evidenceSummary.reportCount && !review.evidenceSummary.matchedRules.length && (
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
            {report && review.status === 'PENDING' && (
              <Select
                label="Hành động khi tiếp nhận báo cáo"
                mb="md"
                value={reportAction || (commentReport ? 'HIDE' : 'WARN')}
                data={[
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
      <AnimatedDisclosure className="admin-metadata" summary="Thông tin kiểm duyệt">
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
      <AdminConfirm
        destructive={decision === 'REJECTED' || commentReport}
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
              ? (reportAction || (commentReport ? 'HIDE' : 'WARN')) === 'WARN'
                ? 'Gửi cảnh báo và đánh dấu báo cáo đã xử lý. Nội dung được giữ nguyên.'
                : reportAction === 'LOCK'
                  ? 'Khóa tài khoản và ghi nhận lý do.'
                  : 'Ẩn nội dung vi phạm. Trạng thái xuất bản được giữ nguyên.'
              : 'Bác báo cáo và giữ nguyên nội dung / tài khoản.'
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

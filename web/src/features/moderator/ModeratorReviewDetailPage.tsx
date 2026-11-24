import { useState } from 'react';
import { GiphyMedia } from '../reader/CommentGifPicker';
import { AnimatedDisclosure } from '../../shared/components/AnimatedDisclosure';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Select, Alert } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminConfirm,
  AdminId,
  AdminPanel,
  dateTime,
  labels,
  number,
  Status
} from '../admin/AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getModeratorReview, resolveModeratorReview } from './moderator-api';

type Decision = 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED';

export function ModeratorReviewDetailPage() {
  const { reviewId = '' } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [reportAction, setReportAction] = useState('');
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['moderator-review-detail', reviewId],
    queryFn: () => getModeratorReview(reviewId)
  });
  const mutation = useMutation({
    mutationFn: () =>
      resolveModeratorReview(
        reviewId,
        decision!,
        reason,
        query.data?.source === 'USER_REPORT'
          ? query.data.targetType.startsWith('DISCUSSION')
            ? 'HIDE'
            : reportAction || (query.data.targetType === 'COMMENT' ? 'HIDE' : 'WARN')
          : undefined
      ),
    onSuccess: async () => {
      setDecision(null);
      setReason('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['moderator-reviews'] }),
        cache.invalidateQueries({ queryKey: ['moderator-review-detail', reviewId] })
      ]);
    }
  });
  if (query.isLoading) return <LoadingState label="Đang tải chi tiết hồ sơ..." />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const review = query.data;
  if (!review) return <EmptyState description="Không tìm thấy hồ sơ điều hành." />;
  const report = review.source === 'USER_REPORT';
  const commentReport = report && review.targetType === 'COMMENT';
  const discussionReport = report && review.targetType.startsWith('DISCUSSION');
  const selectedAction = discussionReport ? 'HIDE' : reportAction || (commentReport ? 'HIDE' : 'WARN');
  const content = review.target?.content || '';
  const publication = !report && (review.targetType === 'NOVEL' || review.targetType === 'CHAPTER');
  return (
    <div className="admin-review-page">
      <Button variant="subtle" size="compact-sm" mb="sm" onClick={() => navigate(-1)}>
        ← Quay lại
      </Button>
      <header className="admin-page-header admin-review-header">
        <div>
          <div className="admin-review-title">
            <h1>Chi tiết hồ sơ điều hành</h1>
            <Status value={review.status} />
          </div>
          <p>{labels[review.source]} · {labels[review.targetType]}</p>
        </div>
        <Button component={Link} to="/moderator/reviews" variant="default" size="sm">
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
                  {review.target.novelTitle && <span>{review.target.novelTitle}</span>}
                  {review.target.chapterTitle && <span>{review.target.chapterTitle}</span>}
                </div>
                {review.target.isSubmittedVersion && (
                  <p className="admin-muted">Phiên bản đã gửi để kiểm duyệt</p>
                )}
              </header>
              <div className="admin-prose admin-review-manuscript" id="moderator-review-content">
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
                  aria-controls="moderator-review-content"
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
        <aside className="admin-review-sidebar" aria-label="Bằng chứng và quyết định điều hành">
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
            <h2>Lịch sử vi phạm chủ thể</h2>
            {!review.ownerViolations?.length && <p className="admin-muted">Chưa có vi phạm đã ghi nhận.</p>}
            {review.ownerViolations?.map((violation) => (
              <div className="admin-task" key={violation.sanction_id} data-testid="moderator-owner-violation">
                <span>{labels[violation.action] || violation.action}{violation.active ? '' : ' (đã thu hồi)'}</span>
                <span>{dateTime(violation.created_at)}</span>
              </div>
            ))}
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
                value={selectedAction}
                data={discussionReport ? [{ value: 'HIDE', label: 'Ẩn nội dung vi phạm' }] : [
                  { value: 'WARN', label: 'Cảnh báo, giữ nguyên nội dung' },
                  ...(review.targetType === 'USER'
                    ? []
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
                disabled={review.status !== 'PENDING' || mutation.isPending}
                data-testid="moderator-approve-review-btn"
                onClick={() => {
                  mutation.reset();
                  setReason('');
                  setDecision('APPROVED');
                }}
              >
                {report ? 'Chấp nhận báo cáo' : publication ? 'Duyệt xuất bản' : 'Duyệt nội dung'}
              </Button>
              {publication && (
                <Button
                  color="orange"
                  variant="light"
                  disabled={review.status !== 'PENDING' || mutation.isPending}
                  data-testid="moderator-revision-review-btn"
                  onClick={() => {
                    mutation.reset();
                    setReason('');
                    setDecision('REVISION_REQUIRED');
                  }}
                >
                  Yêu cầu sửa
                </Button>
              )}
              <Button
                color="red"
                className="admin-danger"
                variant="light"
                disabled={review.status !== 'PENDING' || mutation.isPending}
                data-testid="moderator-reject-review-btn"
                onClick={() => {
                  mutation.reset();
                  setReason('');
                  setDecision('REJECTED');
                }}
              >
                {report ? 'Từ chối báo cáo' : 'Từ chối nội dung'}
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
          (Boolean(report) && decision === 'APPROVED' && selectedAction !== 'WARN')
        }
        opened={!!decision}
        title={
          decision === 'APPROVED'
            ? report
              ? 'Chấp nhận báo cáo'
              : publication
                ? 'Duyệt xuất bản'
                : 'Duyệt nội dung'
            : decision === 'REVISION_REQUIRED'
              ? 'Yêu cầu sửa'
              : report
                ? 'Từ chối báo cáo'
                : 'Từ chối nội dung'
        }
        confirmLabel="Xác nhận xử lý"
        reason={reason}
        setReason={setReason}
        required={Boolean(report) || decision === 'REJECTED' || decision === 'REVISION_REQUIRED'}
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
                : 'Ẩn nội dung vi phạm. Trạng thái xuất bản được giữ nguyên.'
              : 'Bác báo cáo và giữ nguyên nội dung / tài khoản.'
            : review.targetType === 'COMMENT'
              ? decision === 'APPROVED'
                ? 'Bình luận sẽ được duyệt để hiển thị.'
                : decision === 'REVISION_REQUIRED'
                  ? 'Yêu cầu tác giả chỉnh sửa trước khi đăng lại. Cần nhập lý do.'
                  : 'Bình luận sẽ bị từ chối kiểm duyệt.'
              : publication
                ? decision === 'APPROVED'
                  ? 'Duyệt xuất bản nội dung theo phiên bản đang được kiểm duyệt.'
                  : decision === 'REVISION_REQUIRED'
                    ? 'Trả lại cho tác giả chỉnh sửa theo lý do. Cần nhập lý do.'
                    : 'Từ chối xuất bản nội dung đang được kiểm duyệt.'
                : 'Ghi nhận quyết định xử lý trong hồ sơ kiểm duyệt tài khoản.'}
        </p>
      </AdminConfirm>
    </div>
  );
}

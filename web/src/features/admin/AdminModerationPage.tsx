import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getAdminList, type ModerationReview } from './admin-api';
import { AdminHeader, AdminPagination, AdminPanel, labels, number, options, Status } from './AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

export function AdminModerationPage({ reports = false }: { reports?: boolean }) {
  const [targetType,setTargetType] = useState(''); const [status,setStatus] = useState('PENDING'); const [source,setSource] = useState(''); const [page,setPage] = useState(1);
  const filters = {targetType,status,source:reports ? 'USER_REPORT' : source,page,limit:8};
  const query = useQuery({queryKey:['admin-moderation',filters],queryFn:() => getAdminList<ModerationReview>('/admin/moderation/reviews',filters)});
  return <><AdminHeader title={reports ? 'Báo cáo người dùng' : 'Hàng đợi kiểm duyệt'} description={reports ? 'Xem và xử lý nội dung do người dùng báo cáo.' : 'Xem và xử lý nội dung cần kiểm tra.'} refresh={() => void query.refetch()}><span className="admin-muted">{number(query.data?.meta.totalItems ?? 0)} mục theo bộ lọc</span></AdminHeader>
    <AdminPanel><div className="admin-toolbar"><Select label="Đối tượng" data={options(['NOVEL','CHAPTER','COMMENT','USER'],'Tất cả đối tượng')} value={targetType} onChange={v => {setTargetType(v ?? '');setPage(1);}} /><Select label="Trạng thái" data={options(['PENDING','APPROVED','REJECTED','REVISION_REQUIRED'],'Tất cả trạng thái')} value={status} onChange={v => {setStatus(v ?? '');setPage(1);}} />{reports ? <span className="admin-muted">Nguồn: Báo cáo người dùng</span> : <Select label="Nguồn" data={options(['KEYWORD_FILTER','USER_REPORT'],'Tất cả nguồn')} value={source} onChange={v => {setSource(v ?? '');setPage(1);}} />}<Button variant="subtle" onClick={() => {setTargetType('');setStatus('');setSource('');setPage(1);}}>Xóa bộ lọc</Button></div>
    {query.isLoading && <LoadingState label="Đang tải kiểm duyệt..." />}{query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}{query.data && !query.data.items.length && <EmptyState description="Không có mục nào khớp với bộ lọc hiện tại." />}
    {!!query.data?.items.length && <div className="admin-table-scroll"><table><thead><tr><th>Mã kiểm duyệt</th><th>Đối tượng</th><th>Mã đối tượng</th><th>{reports ? 'Số báo cáo' : 'Nguồn'}</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{query.data.items.map(review => <tr key={review.reviewId} data-testid={`moderation-review-card-${review.reviewId}`}><td className="admin-id" title={review.reviewId}>{review.reviewId}</td><td>{labels[review.targetType]}</td><td className="admin-id">{review.targetId}</td><td>{reports ? `${number(review.reportCount ?? 0)} báo cáo` : labels[review.source]}</td><td><Status value={review.status} /></td><td><Button component={Link} to={`/admin/moderation/${review.reviewId}`} variant="light" size="xs" data-testid={`moderation-review-inspect-${review.reviewId}`}>Chi tiết →</Button></td></tr>)}</tbody></table></div>}<AdminPagination meta={query.data?.meta} onChange={setPage} /></AdminPanel>
  </>;
}

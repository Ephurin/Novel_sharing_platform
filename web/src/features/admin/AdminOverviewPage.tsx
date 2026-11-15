import { AnimatedNumber } from '../../shared/components/AuthorAdminMotion';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDashboardStats } from './admin-api';
import { AdminHeader, AdminPanel, number, dateTime } from './AdminShared';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { AdminIcon } from './AdminShell';

export function AdminOverviewPage() {
  const query = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getDashboardStats
  });
  const stats = query.data;
  const peak = Math.max(1, ...(stats?.activity ?? []).flatMap((day) => [day.users, day.novels]));
  const max = Math.ceil(peak / 4) * 4;
  return (
    <>
      <AdminHeader
        title="Tổng quan hệ thống"
        description="Theo dõi hoạt động StoryCraft"
        refresh={() => void query.refetch()}
      />
      {query.isLoading && <LoadingState label="Đang tải tổng quan..." />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {stats && (
        <>
          <div className="admin-grid-four admin-kpis">
            {[
              [
                'Tổng người dùng',
                stats.totalUsers,
                `${number(stats.newUsers7Days)} tài khoản mới trong 7 ngày`
              ],
              [
                'Tổng tác phẩm',
                stats.totalNovels,
                `${number(stats.newNovels7Days)} tác phẩm mới trong 7 ngày`
              ],
              [
                'Chờ kiểm duyệt',
                stats.pendingModerationItems,
                'Bao gồm nội dung và báo cáo người dùng'
              ],
              ['Tổng coin đã nạp', stats.totalDepositedCoins, 'Các giao dịch nạp thành công']
            ].map(([label, value, note]) => (
              <div className="admin-metric" key={label}>
                <span>{label}</span>
                <strong><AnimatedNumber value={value as number} /></strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <div className="admin-grid-two">
            <AdminPanel>
              <h2>Hoạt động nền tảng (7 ngày qua)</h2>
              <p className="admin-muted">Người dùng mới · Tác phẩm mới</p>
              <svg
                className="admin-chart"
                viewBox="0 0 560 260"
                role="img"
                aria-label="Biểu đồ số người dùng và tác phẩm mới theo ngày"
              >
                <title>Hoạt động 7 ngày qua</title>
                {[0, 1, 2, 3, 4].map((i) => (
                  <g key={i}>
                    <line x1="40" y1={20 + i * 45} x2="550" y2={20 + i * 45} />
                    <text x="0" y={24 + i * 45}>
                      {Math.ceil((max * (4 - i)) / 4)}
                    </text>
                  </g>
                ))}
                {stats.activity.map((day, i) => (
                  <g key={day.date}>
                    <title>
                      {day.date}: {day.users} người dùng, {day.novels} tác phẩm
                    </title>
                    <rect
                      className="admin-chart-users sc-author-chart-bar"
                      x={60 + i * 70}
                      y={200 - (day.users / max) * 180}
                      width="18"
                      height={(day.users / max) * 180}
                      rx="3"
                    />
                    <rect
                      className="admin-chart-novels sc-author-chart-bar"
                      x={82 + i * 70}
                      y={200 - (day.novels / max) * 180}
                      width="18"
                      height={(day.novels / max) * 180}
                      rx="3"
                    />
                    <text x={56 + i * 70} y="225">
                      {day.date.slice(5).split('-').reverse().join('/')}
                    </text>
                  </g>
                ))}
              </svg>
              <p className="admin-muted">Màu cam: người dùng · Màu xanh: tác phẩm</p>
              <small className="admin-muted">Cập nhật lúc {dateTime(stats.generatedAt)}</small>
            </AdminPanel>
            <AdminPanel>
              <h2>Cần xử lý</h2>
              {[
                [
                  '/admin/moderation',
                  'hourglass_top',
                  'Nội dung chờ kiểm duyệt',
                  stats.pendingModerationItems - stats.pendingReports
                ],
                ['/admin/reports', 'flag', 'Báo cáo người dùng', stats.pendingReports],
                ['/admin/withdraws', 'payments', 'Yêu cầu rút tiền', stats.pendingWithdraws]
              ].map(([path, icon, label, count]) => (
                <Link className="admin-task" to={String(path)} key={path}>
                  <AdminIcon name={String(icon)} />
                  <strong>{label}</strong>
                  <span>
                    {number(count as number)} <AdminIcon name="arrow_forward" />
                  </span>
                </Link>
              ))}
            </AdminPanel>
          </div>
        </>
      )}
    </>
  );
}

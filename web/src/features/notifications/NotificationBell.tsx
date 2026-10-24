import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { getUnreadNotificationCount } from './notification-api';

export function NotificationBell() {
  const userId = useAuthStore(state => state.user?.userId);
  const unread = useQuery({
    queryKey: ['notifications', 'unread-count', userId],
    queryFn: getUnreadNotificationCount,
    enabled: Boolean(userId),
    refetchInterval: 15000
  });
  const count = unread.data;
  const hasUnread = typeof count === 'number' && count > 0;
  const label = typeof count === 'number' ? `Thông báo, ${count.toLocaleString('vi-VN')} chưa đọc` : 'Thông báo';

  return (
    <Link to="/notifications" className="sc-icon-button sc-notification-bell" aria-label={label} title={label}>
      <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
      {hasUnread && <span className="sc-notification-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
    </Link>
  );
}

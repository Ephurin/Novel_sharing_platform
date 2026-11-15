import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { getUnreadNotificationCount } from './notification-api';
import { useEffect, useRef } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { AnimatedTooltip } from '../../shared/components/AnimatedTooltip';

export function NotificationBell() {
  const userId = useAuthStore(state => state.user?.userId);
  const unread = useQuery({
    queryKey: ['notifications', 'unread-count', userId],
    queryFn: getUnreadNotificationCount,
    enabled: Boolean(userId),
    refetchInterval: 15000
  });
  const count = unread.data;
  const animation = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const previous = useRef<{ userId: string | undefined; count: number } | null>(null);
  useEffect(() => {
    if (reduceMotion) {
      animation.stop();
      animation.set({ rotate: 0 });
    }
    if (typeof count !== 'number') return;
    if (!reduceMotion && previous.current && previous.current.userId === userId && count > previous.current.count) {
      void animation.start({ rotate: [0, -12, 12, -8, 8, 0], transition: { duration: 0.45 } });
    }
    previous.current = { userId, count };
  }, [count, userId, reduceMotion, animation]);
  const hasUnread = typeof count === 'number' && count > 0;
  const label = typeof count === 'number' ? `Thông báo, ${count.toLocaleString('vi-VN')} chưa đọc` : 'Thông báo';

  return (
    <AnimatedTooltip label={label}>
    <Link to="/notifications" className="sc-icon-button sc-notification-bell" aria-label={label}
      onMouseEnter={() => {
        if (!reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          void animation.start({ rotate: [0, -10, 10, -6, 0], transition: { duration: 0.4 } });
        }
      }}>
      <motion.span className="material-symbols-outlined" aria-hidden="true" animate={animation} style={{ transformOrigin: '50% 15%' }}>notifications</motion.span>
      {hasUnread && <motion.span key={count} className="sc-notification-count" aria-hidden="true"
        initial={{ scale: reduceMotion ? 1 : 0.85 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }}>{count > 99 ? '99+' : count}</motion.span>}
    </Link>
    </AnimatedTooltip>
  );
}

import { navigationHref } from '../../shared/routes';
import { ThemeControl } from '../../shared/components/ThemeControl';
import { Badge, Box, Button, Group, NavLink, Stack, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import type { UserRole } from '../../features/auth/auth-types';
import { logout } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { AuthorNavbar, AuthorTheme, SessionMarker } from '../../shared/components/AuthorTheme';
import { AdminShell } from '../../features/admin/AdminShell';

const navItems: Array<{ to: string; label: string; roles: UserRole[] }> = [
  { to: navigationHref('/author'), label: 'Tác phẩm của tôi', roles: ['AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/author/ide'), label: 'Không gian sáng tác', roles: ['AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/reader'), label: 'Khám phá truyện', roles: ['READER', 'AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/reader/library'), label: 'Thư viện của tôi', roles: ['READER', 'AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/reader/history'), label: 'Lịch sử đọc', roles: ['READER', 'AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/wallet'), label: 'Ví Xu', roles: ['READER', 'AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/notifications'), label: 'Thông báo', roles: ['READER', 'AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/appeals'), label: 'Khiếu nại', roles: ['READER', 'AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/profile/me'), label: 'Hồ sơ & cài đặt', roles: ['READER', 'AUTHOR', 'MODERATOR'] },
  { to: navigationHref('/moderator/reviews'), label: 'Hồ sơ điều hành', roles: ['MODERATOR'] },
  { to: navigationHref('/moderator/discussions'), label: 'Điều hành thảo luận', roles: ['MODERATOR'] },
  { to: navigationHref('/admin'), label: 'Tổng quan quản trị', roles: ['ADMIN'] },
  { to: navigationHref('/admin/novels'), label: 'Tác phẩm', roles: ['ADMIN'] },
  { to: navigationHref('/admin/users'), label: 'Người dùng', roles: ['ADMIN'] },
  { to: navigationHref('/admin/taxonomy'), label: 'Thể loại & Nhãn', roles: ['ADMIN'] },
  { to: navigationHref('/admin/moderation'), label: 'Kiểm duyệt', roles: ['ADMIN'] },
  { to: navigationHref('/admin/reports'), label: 'Báo cáo vi phạm', roles: ['ADMIN'] },
  { to: navigationHref('/admin/withdraws'), label: 'Yêu cầu rút Xu', roles: ['ADMIN'] }
];

export function WebAppShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const visibleNavItems = navItems.filter((item) => user && item.roles.includes(user.role));

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      queryClient.clear();
      navigate(navigationHref('/login'), { replace: true });
    }
  };

  // Authors, readers and moderators share the StoryCraft shell; admins keep the operations shell for now.
  if (user?.role === 'AUTHOR' || user?.role === 'READER' || user?.role === 'MODERATOR') {
    return <AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><Outlet /></main></AuthorTheme>;
  }

  if (user?.role === 'ADMIN') {
    return <AdminShell onLogout={() => void handleLogout()} />;
  }

  return (
    <AuthorTheme className="web-shell">
      <Group className="web-topbar" justify="space-between">
        <Group gap="sm">
          <Text fw={700}>StoryCraft</Text>
        </Group>
        <Group gap="xs">
          {user && <SessionMarker role={user.role} username={user.username} />}
          <ThemeControl />
          <Badge size="sm" variant="outline">
            {user?.role ?? 'KHÁCH'}
          </Badge>
          <Text size="sm" c="dimmed">
            {user?.username ?? 'Đã khôi phục phiên'}
          </Text>
          <Button
            size="xs"
            variant="subtle"
            data-testid="shell-logout-btn"
            onClick={() => void handleLogout()}
          >
            Đăng xuất
          </Button>
        </Group>
      </Group>

      <Box className="web-body">
        <Stack className="web-nav" gap={4}>
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              component={RouterNavLink}
              to={item.to}
              end={item.to === navigationHref('/admin')}
              label={item.label}
              className="web-nav-link"
            />
          ))}
        </Stack>
        <Box className="web-content">
          <Outlet />
        </Box>
      </Box>
    </AuthorTheme>
  );
}

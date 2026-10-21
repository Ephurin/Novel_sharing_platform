import { ThemeControl } from '../../shared/components/ThemeControl';
import { Badge, Box, Button, Group, NavLink, Stack, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import type { UserRole } from '../../features/auth/auth-types';
import { logout } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { AuthorNavbar, AuthorTheme } from '../../shared/components/AuthorTheme';

const navItems: Array<{ to: string; label: string; roles: UserRole[] }> = [
  { to: '/author', label: 'Writing Projects', roles: ['AUTHOR'] },
  { to: '/author/ide', label: 'Author IDE', roles: ['AUTHOR'] },
  { to: '/reader', label: 'Reader Home', roles: ['READER', 'AUTHOR'] },
  { to: '/reader/library', label: 'Library', roles: ['READER', 'AUTHOR'] },
  { to: '/reader/history', label: 'History', roles: ['READER', 'AUTHOR'] },
  { to: '/wallet', label: 'Wallet', roles: ['READER', 'AUTHOR'] },
  { to: '/notifications', label: 'Notifications', roles: ['READER', 'AUTHOR'] },
  { to: '/profile/me', label: 'Profile', roles: ['READER', 'AUTHOR'] },
  { to: '/admin', label: 'Admin', roles: ['ADMIN'] },
  { to: '/admin/novels', label: 'Novels', roles: ['ADMIN'] },
  { to: '/admin/users', label: 'Users', roles: ['ADMIN'] },
  { to: '/admin/taxonomy', label: 'Taxonomy', roles: ['ADMIN'] },
  { to: '/admin/moderation', label: 'Moderation', roles: ['ADMIN'] },
  { to: '/admin/reports', label: 'User Reports', roles: ['ADMIN'] },
  { to: '/admin/withdraws', label: 'Withdraws', roles: ['ADMIN'] }
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
      navigate('/login', { replace: true });
    }
  };

  if (user?.role === 'AUTHOR') {
    return <AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><Outlet /></main></AuthorTheme>;
  }

  return (
    <Box className="web-shell">
      <Group className="web-topbar" justify="space-between">
        <Group gap="sm">
          <Text fw={800}>Ephurin</Text>
          <Badge variant="light">Official Web MVP</Badge>
        </Group>
        <Group gap="xs">
          <ThemeControl />
          <Badge size="sm" variant="outline">
            {user?.role ?? 'GUEST'}
          </Badge>
          <Text size="sm" c="dimmed">
            {user?.username ?? 'session restored'}
          </Text>
          <Button
            size="xs"
            variant="subtle"
            data-testid="shell-logout-btn"
            onClick={() => void handleLogout()}
          >
            Logout
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
              end={item.to === '/admin'}
              label={item.label}
              className="web-nav-link"
            />
          ))}
          <Text size="xs" c="dimmed" mt="auto">
            AI Copilot: Sẵn sàng trong Author IDE
          </Text>
        </Stack>
        <Box className="web-content">
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

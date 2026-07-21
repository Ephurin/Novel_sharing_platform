import { Badge, Box, Button, Group, NavLink, Stack, Text } from '@mantine/core';
import { NavLink as RouterNavLink, Outlet } from 'react-router-dom';
import type { UserRole } from '../../features/auth/auth-types';
import { useAuthStore } from '../../features/auth/useAuthStore';

const navItems: Array<{ to: string; label: string; roles: UserRole[] }> = [
  { to: '/author', label: 'Writing Projects', roles: ['AUTHOR', 'ADMIN'] },
  { to: '/author/ide', label: 'Author IDE', roles: ['AUTHOR', 'ADMIN'] },
  { to: '/reader', label: 'Reader Home', roles: ['READER', 'AUTHOR', 'ADMIN'] },
  { to: '/reader/library', label: 'Library', roles: ['READER', 'AUTHOR', 'ADMIN'] },
  { to: '/reader/history', label: 'History', roles: ['READER', 'AUTHOR', 'ADMIN'] },
  { to: '/wallet', label: 'Wallet', roles: ['READER', 'AUTHOR', 'ADMIN'] },
  { to: '/notifications', label: 'Notifications', roles: ['READER', 'AUTHOR', 'ADMIN'] },
  { to: '/profile/me', label: 'Profile', roles: ['READER', 'AUTHOR', 'ADMIN'] },
  { to: '/admin', label: 'Admin', roles: ['ADMIN'] },
  { to: '/admin/users', label: 'Users', roles: ['ADMIN'] },
  { to: '/admin/taxonomy', label: 'Taxonomy', roles: ['ADMIN'] },
  { to: '/admin/moderation', label: 'Moderation', roles: ['ADMIN'] },
  { to: '/admin/reports', label: 'Reports', roles: ['ADMIN'] },
  { to: '/admin/withdraws', label: 'Withdraws', roles: ['ADMIN'] }
];

export function WebAppShell() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const visibleNavItems = navItems.filter((item) => user && item.roles.includes(user.role));

  return (
    <Box className="web-shell">
      <Group className="web-topbar" justify="space-between">
        <Group gap="sm">
          <Text fw={800}>Ephurin</Text>
          <Badge variant="light">Official Web MVP</Badge>
        </Group>
        <Group gap="xs">
          <Badge size="sm" variant="outline">
            {user?.role ?? 'GUEST'}
          </Badge>
          <Text size="sm" c="dimmed">
            {user?.username ?? 'session restored'}
          </Text>
          <Button size="xs" variant="subtle" onClick={clearSession}>
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
              label={item.label}
              className="web-nav-link"
            />
          ))}
          <Text size="xs" c="dimmed" mt="auto">
            AI entry points stay disabled
          </Text>
        </Stack>
        <Box className="web-content">
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

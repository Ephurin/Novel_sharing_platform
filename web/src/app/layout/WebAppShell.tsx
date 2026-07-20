import { Anchor, Badge, Box, Button, Group, NavLink, Stack, Text } from '@mantine/core';
import { NavLink as RouterNavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { AuthLanding } from '../../shared/components/AuthLanding';

const navItems = [
  { to: '/author/ide', label: 'Author IDE' },
  { to: '/reader', label: 'Reader' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/admin', label: 'Admin' }
];

export function WebAppShell() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  if (!accessToken) {
    return <AuthLanding />;
  }

  return (
    <Box className="web-shell">
      <Group className="web-topbar" justify="space-between">
        <Group gap="sm">
          <Text fw={800}>Ephurin</Text>
          <Badge variant="light">Phase 8 Web MVP</Badge>
        </Group>
        <Group gap="xs">
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              component={RouterNavLink}
              to={item.to}
              label={item.label}
              className="web-nav-link"
            />
          ))}
          <Anchor href="/author/ide" size="xs" c="dimmed" mt="auto">
            AI entry points stay disabled
          </Anchor>
        </Stack>
        <Box className="web-content">
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

import { Box } from '@mantine/core';
import { Outlet } from 'react-router-dom';
import { AppTopBar } from '../../shared/components/AppTopBar';

export function WebAppShell() {
  return (
    <Box className="web-shell">
      <AppTopBar />
      <main className="web-content">
        <Outlet />
      </main>
    </Box>
  );
}

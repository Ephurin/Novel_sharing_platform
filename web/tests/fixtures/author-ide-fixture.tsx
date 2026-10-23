import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme, cssVariablesResolver } from '../../src/theme';
import { apiClient } from '../../src/shared/api/api-client';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { AuthorWritingIde } from '../../src/features/author-ide/AuthorWritingIde';

import '@mantine/core/styles.css';
import '../../src/theme/storycraft.css';
import '../../src/theme/color-mode.css';

const config = (window as any).testConfig;
if (config?.base) {
  apiClient.defaults.baseURL = config.base;
}

if (config?.accounts?.[0]) {
  useAuthStore.getState().setSession({
    accessToken: config.accounts[0].token,
    user: {
      userId: config.accounts[0].userId,
      role: 'AUTHOR',
      username: 'author_tester',
      email: 'author_tester@test.invalid'
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 0
    }
  }
});

function App() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  (window as any).setTheme = setMode;
  (window as any).remount = () => {
    queryClient.clear();
    setGeneration((v) => v + 1);
  };

  const novelId = config?.accounts?.[0]?.novelId ?? '';
  const chapterId = config?.accounts?.[0]?.chapterIds?.[0] ?? '';
  const initialUrl = `/author/ide?novelId=${novelId}&chapterId=${chapterId}`;

  const router = React.useMemo(() => {
    return createMemoryRouter(
      [
        {
          path: '/author/ide',
          element: <AuthorWritingIde />
        },
        {
          path: '*',
          element: <AuthorWritingIde />
        }
      ],
      {
        initialEntries: [initialUrl]
      }
    );
  }, [generation, initialUrl]);

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme={mode}>
        <RouterProvider key={generation} router={router} />
      </MantineProvider>
    </QueryClientProvider>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}

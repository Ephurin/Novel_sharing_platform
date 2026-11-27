import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme, cssVariablesResolver } from '../../src/theme';
import { apiClient } from '../../src/shared/api/api-client';
import { AuthGate } from '../../src/features/auth/AuthGate';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { AuthorWritingIde } from '../../src/features/author-ide/AuthorWritingIde';
import { ToastProvider } from '../../src/shared/components/ToastProvider';
import { AuthorTheme } from '../../src/shared/components/AuthorTheme';

import '@mantine/core/styles.css';
import '../../src/theme/storycraft.css';
import '../../src/theme/color-mode.css';
import '../../src/theme/refinements.css';

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
  const [mode, setMode] = useState<'light' | 'dark'>(() => localStorage.getItem('storycraft-theme') === 'dark' ? 'dark' : 'light');
  const [generation, setGeneration] = useState(0);
  const [accountIndex, setAccountIndex] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  (window as any).setTheme = (value: 'light' | 'dark') => { localStorage.setItem('storycraft-theme', value); setMode(value); };
  (window as any).remount = () => {
    queryClient.clear();
    setGeneration((v) => v + 1);
  };

  (window as any).selectTestAccount = (index: number) => {
    const account = config.accounts[index];
    useAuthStore.getState().setSession({ accessToken: account.token, user: { userId: account.userId, role: 'AUTHOR', username: 'author_tester', email: 'author_tester@test.invalid' } });
    queryClient.clear(); setAccountIndex(index); setGeneration(value => value + 1);
  };
  const novelId = config?.accounts?.[accountIndex]?.novelId ?? '';
  const chapterId = config?.accounts?.[accountIndex]?.chapterIds?.[0] ?? '';
  const initialUrl = `/author/ide?novelId=${novelId}&chapterId=${chapterId}`;

  const router = React.useMemo(() => {
    return createMemoryRouter(
      [
        {
          path: '/author/ide',
          element: (
            <AuthGate>
              <AuthorWritingIde />
            </AuthGate>
          )
        },
        {
          path: '/dang-nhap',
          element: <div data-testid="login-page">Login Page</div>
        },
        {
          path: '*',
          element: (
            <AuthGate>
              <AuthorWritingIde />
            </AuthGate>
          )
        }
      ],
      {
        initialEntries: [initialUrl]
      }
    );
  }, [generation, initialUrl]);
  (window as any).navigateTestChapter = (id: string) => router.navigate(`/author/ide?novelId=${novelId}&chapterId=${id}`);

  (window as any).router = router;
  (window as any).navigateChapter = (id: string) => router.navigate(`/author/ide?novelId=${novelId}&chapterId=${id}`);
  (window as any).logout = () => useAuthStore.getState().clearSession();
  (window as any).loginAuthor = (account: { token: string; userId: string }, targetNovelId?: string, targetChapterId?: string) => {
    useAuthStore.getState().setSession({
      accessToken: account.token,
      user: {
        userId: account.userId,
        role: 'AUTHOR',
        username: 'author_tester',
        email: 'author_tester@test.invalid'
      }
    });
    return router.navigate(`/author/ide?novelId=${targetNovelId ?? novelId}&chapterId=${targetChapterId ?? chapterId}`);
  };
  (window as any).switchAuthor = (id: string) => useAuthStore.getState().setSession({
    accessToken: 'fixture-token', user: { userId: id, role: 'AUTHOR', username: 'fixture', email: 'fixture@test.invalid' }
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme={mode}>
        <ToastProvider><AuthorTheme><RouterProvider key={generation} router={router} /></AuthorTheme></ToastProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}

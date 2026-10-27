import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthorMemoryPanel } from '../../src/features/ai-copilot/AuthorMemoryPanel';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { apiClient } from '../../src/shared/api/api-client';
import '@mantine/core/styles.css';

apiClient.defaults.baseURL = '/api/v1';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function setAccount(id: string) {
  useAuthStore.getState().setSession({ accessToken: 'fixture-token-' + id,
    user: { userId: id, email: 'fixture@example.test', username: id, role: 'AUTHOR', status: 'ACTIVE' } });
}
setAccount('author-a');
function Harness() {
  const [novel, setNovel] = useState('10000000-0000-0000-0000-000000000001');
  const [opened, setOpened] = useState(true);
  Object.assign(window, { __profileSetAccount: setAccount, __profileSetNovel: setNovel,
    __profileSetOpened: setOpened, __profileQueryClient: queryClient });
  return <AuthorMemoryPanel novelId={novel} chapterId="chapter-fixture" content="fixture prose" opened={opened} onClose={() => setOpened(false)} saved />;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><MantineProvider><Harness /></MantineProvider></QueryClientProvider>);

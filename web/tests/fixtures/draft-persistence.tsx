import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom';
import { useDraftPersistence } from '../../src/features/author-ide/useDraftPersistence';
import { getChapter } from '../../src/features/novels/novel-api';
import { apiClient } from '../../src/shared/api/api-client';
import { NovelReviews } from '../../src/features/reader/NovelReviews';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme, cssVariablesResolver } from '../../src/theme';
import '@mantine/core/styles.css';
import '../../src/theme/storycraft.css';
import '../../src/theme/color-mode.css';

const config = (window as any).testConfig;
apiClient.defaults.baseURL = config.base;
function Harness() {
  const [account, setAccount] = useState(config.accounts[0]);
  const [chapterId, setChapter] = useState(account.chapterIds[0]);
  const [value, setValue] = useState({ title: 'Draft', content: '', isVip: false, priceCoins: 0 });
  const [ready, setReady] = useState(false);
  const persistence = useDraftPersistence(account.userId, chapterId);
  const navigate = useNavigate();
  localStorage.setItem('ephurin_access_token', account.token);
  useEffect(() => {
    let cancelled = false; setReady(false);
    void getChapter(chapterId).then(chapter => {
      if (!cancelled) { setValue(persistence.initialize(chapter)); setReady(true); }
    }).catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [chapterId, account.userId]);
  (window as any).draft = {
    ...persistence,
    switchAccount: (index: number, sameChapter = false) => { setAccount(config.accounts[index]); if (!sameChapter) setChapter(config.accounts[index].chapterIds[0]); },
    select: setChapter,
    initialize: persistence.initialize,
    reload: async () => setValue(persistence.initialize(await getChapter(chapterId), true)),
    navigate: () => navigate('/next'),
    edit: (buffer: typeof value) => { setValue(buffer); persistence.queue(buffer); }
  };
  return <><textarea aria-label="Manuscript" value={value.content} disabled={!ready}
    onChange={event => { const next = { ...value, content: event.target.value }; setValue(next); persistence.queue(next); }} />
    <output data-testid="status">{persistence.status}</output><output data-testid="error">{persistence.error}</output>
    <output data-testid="ready">{String(ready)}</output><output data-testid="blocker">{persistence.blocker.state}</output>
    <output data-testid="recovery">{persistence.recovery?.value.content}</output>
    <div data-testid="reviews" style={{ margin: 24 }}><NovelReviews novelId={config.accounts[0].novelId} /></div></>;
}
function App() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [generation, setGeneration] = useState(0);
  useEffect(() => { document.documentElement.dataset.theme = mode; }, [mode]);
  (window as any).setTheme = setMode;
  (window as any).remount = () => setGeneration(value => value + 1);
  return <QueryClientProvider client={queryClient}><MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme={mode}>
    <RouterProvider key={generation} router={router} />
  </MantineProvider></QueryClientProvider>;
}
const router = createMemoryRouter([{ path: '*', element: <Harness /> }]);
const queryClient = new QueryClient();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

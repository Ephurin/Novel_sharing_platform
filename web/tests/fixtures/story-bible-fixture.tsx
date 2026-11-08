import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { AuthorStoryContextPage } from '../../src/features/story-context/AuthorStoryContextPage';
import '@mantine/core/styles.css';
import '../../src/theme/storycraft.css';

createRoot(document.getElementById('root')!).render(<MantineProvider><QueryClientProvider client={new QueryClient({
  defaultOptions: { queries: { retry: false } }
})}><MemoryRouter initialEntries={['/author/context/novel-bible']}><Routes>
  <Route path="/author/context/:novelId" element={<AuthorStoryContextPage />} />
</Routes></MemoryRouter></QueryClientProvider></MantineProvider>);

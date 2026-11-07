import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { SetupFoundationPanel } from '../../src/features/ai-copilot/SetupFoundationPanel';
createRoot(document.getElementById('root')!).render(<MantineProvider><SetupFoundationPanel novelId="10000000-0000-0000-0000-000000000001"/></MantineProvider>);

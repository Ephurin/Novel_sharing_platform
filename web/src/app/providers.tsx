import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { theme } from '../theme';
import '@mantine/core/styles.css';

const queryClient = new QueryClient();

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider defaultColorScheme="light" forceColorScheme="light" theme={theme}>
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}

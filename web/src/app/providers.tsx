import { useLayoutEffect } from 'react';
import { colorSchemeManager } from '../theme/color-scheme';
import '../theme/storycraft.css';
import { MantineProvider, useComputedColorScheme } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { theme, cssVariablesResolver } from '../theme';
import '@mantine/core/styles.css';

const queryClient = new QueryClient();

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider defaultColorScheme="auto" colorSchemeManager={colorSchemeManager} theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ThemeRootSync />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}

function ThemeRootSync() {
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  useLayoutEffect(() => { window.storycraftTheme.apply(); }, [scheme]);
  return null;
}

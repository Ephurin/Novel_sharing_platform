import { useLayoutEffect } from 'react';
import { colorSchemeManager } from '../theme/color-scheme';
import '../theme/storycraft.css';
import { MantineProvider, useComputedColorScheme } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { theme, cssVariablesResolver } from '../theme';
import '@mantine/core/styles.css';
import { ToastProvider } from '../shared/components/ToastProvider';
import { BackToTop } from '../shared/components/InteractionWidgets';

const queryClient = new QueryClient();

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider defaultColorScheme="auto" colorSchemeManager={colorSchemeManager} theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ThemeRootSync />
        <ToastProvider>{children}<BackToTop /></ToastProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}

function ThemeRootSync() {
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  useLayoutEffect(() => { window.storycraftTheme.apply(); }, [scheme]);
  return null;
}

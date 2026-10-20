import type { MantineColorScheme, MantineColorSchemeManager } from '@mantine/core';

declare global {
  interface Window {
    storycraftTheme: {
      read: () => MantineColorScheme;
      write: (value: MantineColorScheme) => void;
      apply: () => void;
    };
  }
}

// Share preference and storage fallback behavior with the pre-paint bootstrap.
let storageHandler: ((event: StorageEvent) => void) | undefined;
export const colorSchemeManager: MantineColorSchemeManager = {
  get: () => window.storycraftTheme.read(),
  set: value => window.storycraftTheme.write(value),
  clear: () => window.storycraftTheme.write('auto'),
  subscribe: onUpdate => {
    storageHandler = event => {
      if (event.key === 'storycraft-theme' || event.key === null) onUpdate(window.storycraftTheme.read());
    };
    window.addEventListener('storage', storageHandler);
  },
  unsubscribe: () => {
    if (storageHandler) window.removeEventListener('storage', storageHandler);
  }
};

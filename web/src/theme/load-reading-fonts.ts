import { useEffect } from 'react';

let readingFontsPromise: Promise<unknown> | null = null;

export function ensureReadingFontsLoaded(): Promise<unknown> {
  if (!readingFontsPromise) {
    readingFontsPromise = import('./reading-fonts').catch((err) => {
      readingFontsPromise = null;
      throw err;
    });
  }
  return readingFontsPromise;
}

export function useReadingFonts(): void {
  useEffect(() => {
    void ensureReadingFontsLoaded();
  }, []);
}

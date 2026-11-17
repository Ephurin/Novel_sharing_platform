import { useEffect } from 'react';

let readingFontLoaders: Record<string, () => Promise<unknown>> | undefined;
try {
  readingFontLoaders = import.meta.glob('./reading-fonts.ts');
} catch {
  readingFontLoaders = undefined;
}

let readingFontsPromise: Promise<unknown> | null = null;

export function ensureReadingFontsLoaded(): Promise<unknown> {
  if (!readingFontsPromise) {
    const loader = readingFontLoaders?.['./reading-fonts.ts'];
    readingFontsPromise = loader
      ? loader().catch((err) => {
          readingFontsPromise = null;
          throw err;
        })
      : Promise.resolve();
  }
  return readingFontsPromise;
}

export function useReadingFonts(): void {
  useEffect(() => {
    void ensureReadingFontsLoaded();
  }, []);
}

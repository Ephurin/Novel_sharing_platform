import { useEffect, useRef } from 'react';

// #137: same-window signal that approved memory (and so the Story Brain version) changed.
// Panels that hold a Brain version for CAS re-read it instead of failing their next submit.
const EVENT = 'ephurin:memory-changed';

export function notifyMemoryChanged(novelId: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { novelId } }));
}

/** Calls `onChange` after a memory change for this novel, and when the page regains focus (other tabs). */
export function useMemoryChanged(novelId: string, onChange: () => void) {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const onMemory = (e: Event) => {
      if ((e as CustomEvent<{ novelId?: string }>).detail?.novelId === novelId) latest.current();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') latest.current();
    };
    window.addEventListener(EVENT, onMemory);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(EVENT, onMemory);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [novelId]);
}

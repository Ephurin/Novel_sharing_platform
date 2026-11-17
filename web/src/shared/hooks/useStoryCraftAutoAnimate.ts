import { useEffect, type RefCallback } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { AutoAnimateOptions } from '@formkit/auto-animate';
import { useReducedMotion } from 'motion/react';

/** Subtle list transition hook that disables motion when prefers-reduced-motion is active. */
export function useStoryCraftAutoAnimate<T extends Element = HTMLDivElement>(
  options?: Partial<AutoAnimateOptions>,
  enabled = true
): RefCallback<T> {
  const reduceMotion = useReducedMotion();
  const [ref, setEnabled] = useAutoAnimate<T>({
    duration: 160,
    easing: 'ease-out',
    ...options
  });

  useEffect(() => {
    setEnabled(enabled && !reduceMotion);
  }, [enabled, reduceMotion, setEnabled]);

  return ref;
}

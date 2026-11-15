import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './action-feedback.css';

/** A fixed icon slot: feedback must never move the button label or nearby controls. */
export function FeedbackIcon({ icon, busy = false }: { icon: string; busy?: boolean }) {
  const reduce = useReducedMotion();
  return <span className="sc-feedback-icon" aria-hidden="true"><AnimatePresence initial={false} mode="wait">
    <motion.span key={icon} className={`material-symbols-outlined ${busy ? 'sc-saving-icon' : ''}`} initial={{ opacity: 0, scale: reduce ? 1 : .8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .12 }}>{icon}</motion.span>
  </AnimatePresence></span>;
}

export function FeedbackReveal({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  const reduce = useReducedMotion();
  return <motion.div className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : .18 }}>{children}</motion.div>;
}

export function CopyTextButton({ value, label = 'Sao chép', onError }: { value: string; label?: string; onError?: (message: string) => void }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const alive = useRef(true), locked = useRef(false), reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestValue = useRef(value); latestValue.current = value;
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(reset.current); }; }, []);
  useEffect(() => { setState('idle'); clearTimeout(reset.current); }, [value]);
  const copy = async () => {
    if (locked.current) return;
    locked.current = true; setState('pending'); clearTimeout(reset.current);
    try {
      await navigator.clipboard.writeText(value);
      if (alive.current && latestValue.current === value) { setState('done'); reset.current = setTimeout(() => setState('idle'), 1800); }
    } catch {
      if (alive.current && latestValue.current === value) { setState('error'); onError?.('Trình duyệt chưa cho phép sao chép. Hãy chọn văn bản và dùng Ctrl/Cmd + C.'); }
    } finally { locked.current = false; }
  };
  return <span className="sc-copy-feedback"><button type="button" className="sc-feedback-button" onClick={() => void copy()} disabled={state === 'pending'} aria-busy={state === 'pending'}>
    <FeedbackIcon icon={state === 'done' ? 'check' : state === 'error' ? 'error_outline' : state === 'pending' ? 'sync' : 'content_copy'} busy={state === 'pending'} />{label}
  </button><span className="sc-motion-sr-only" role="status">{state === 'done' ? 'Đã sao chép' : state === 'error' ? 'Không sao chép được. Dùng Ctrl/Cmd + C.' : ''}</span></span>;
}

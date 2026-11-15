import { useEffect, useState, type ButtonHTMLAttributes } from 'react';
import { Button, type ButtonProps } from '@mantine/core';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './animated-feedback.css';

export function AnimatedSaveButton({ saved = false, loading = false, children, ...props }: ButtonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonProps> & { saved?: boolean }) {
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!saved || loading) { setShowSaved(false); return; }
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved, loading]);
  return <Button type="button" {...props} loading={loading} aria-busy={loading}
    aria-label={props['aria-label'] ?? (showSaved ? 'Đã lưu' : typeof children === 'string' ? children : undefined)}
    leftSection={<span className="sc-save-button-icon material-symbols-outlined" aria-hidden="true">{showSaved ? 'check_circle' : 'save'}</span>}>
    <span className="sc-save-button-label">
      <span aria-hidden="true" className="sc-save-button-reserve">{children}</span>
      <span aria-hidden="true" className="sc-save-button-reserve">Đã lưu</span>
      <span>{showSaved ? 'Đã lưu' : children}</span>
    </span>
  </Button>;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export function SaveStatus({ status, dirty = false, savedAt, className = '' }: { status: SaveState; dirty?: boolean; savedAt?: string; className?: string }) {
  const reduce = useReducedMotion();
  const current = status === 'error' ? 'error' : status === 'saving' ? 'saving' : dirty ? 'idle' : status;
  const text = current === 'error' ? 'Lỗi lưu đám mây' : current === 'saving' ? 'Đang lưu…' : current === 'saved' ? 'Đã lưu' : 'Chưa lưu';
  return <span className={`sc-save-status ${className}`} data-status={current} role="status" aria-live="polite" aria-atomic="true">
    <AnimatePresence initial={false} mode="wait">
      <motion.span key={current} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.1 }}>
        <span className={`material-symbols-outlined ${current === 'saving' ? 'sc-saving-icon' : ''}`} aria-hidden="true">{current === 'error' ? 'cloud_off' : current === 'saving' ? 'sync' : current === 'saved' ? 'cloud_done' : 'edit_note'}</span>
        <span>{text}{current === 'saved' && savedAt ? <span className="sc-save-time"> · {savedAt}</span> : null}</span>
      </motion.span>
    </AnimatePresence>
  </span>;
}

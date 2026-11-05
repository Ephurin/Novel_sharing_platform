import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Button } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { AnimatedModal } from './AnimatedModal';
import './interaction-widgets.css';

export function ResponsiveFilters({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  const mobile = useMediaQuery('(max-width: 767px)');
  const [opened, setOpened] = useState(false);
  useEffect(() => { if (!mobile) setOpened(false); }, [mobile]);
  if (!mobile) return <div className={className}>{children}</div>;
  return <div className="sc-responsive-filters">
    <Button variant="default" onClick={() => setOpened(true)} leftSection={<span className="material-symbols-outlined" aria-hidden="true">filter_list</span>}>Bộ lọc</Button>
    <AnimatedModal side="right" opened={opened} onClose={() => setOpened(false)} title="Bộ lọc">
      <div className="sc-mobile-filters">{children}</div>
      <Button mt="md" fullWidth onClick={() => setOpened(false)}>Xem kết quả</Button>
    </AnimatedModal>
  </div>;
}

export function ImageLightbox({ src, alt, children, className = '' }: PropsWithChildren<{ src: string; alt: string; className?: string }>) {
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); setOpened(false); }, [src]);
  return <>
    <button type="button" className={`sc-image-preview-trigger ${className}`} aria-label={`Phóng to ${alt}`} onClick={() => setOpened(true)}>{children}</button>
    <AnimatedModal opened={opened} onClose={() => setOpened(false)} title={alt} size="xl" centered>
      {failed ? <p role="alert">Không tải được ảnh.</p> : <img src={src} alt={alt} className="sc-lightbox-image" onError={() => setFailed(true)} />}
    </AnimatedModal>
  </>;
}

export function ReactionIcon({ icon, active = false, successVersion = 0 }: { icon: string; active?: boolean; successVersion?: number }) {
  const animation = useAnimationControls();
  const reduce = useReducedMotion();
  const previous = useRef({ active, successVersion });
  useEffect(() => {
    if (!reduce && (active && !previous.current.active || successVersion > previous.current.successVersion)) {
      void animation.start({ scale: [1, 1.25, 1], transition: { duration: 0.25 } });
    }
    if (reduce) { animation.stop(); animation.set({ scale: 1 }); }
    previous.current = { active, successVersion };
  }, [active, successVersion, reduce, animation]);
  return <motion.span className="material-symbols-outlined sc-reaction-icon" aria-hidden="true" animate={animation} data-active={active || undefined}>{icon}</motion.span>;
}

export function SelectionToolbar({ count, onClear, children }: PropsWithChildren<{ count: number; onClear: () => void }>) {
  const reduce = useReducedMotion();
  return <AnimatePresence initial={false}>{count > 0 && <motion.div className="sc-selection-toolbar" role="region" aria-label="Thao tác với mục đã chọn"
    initial={{ opacity: 0, height: reduce ? 'auto' : 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: reduce ? 'auto' : 0 }} transition={{ duration: 0.15 }}>
    <span role="status">Đã chọn {count} mục</span><div>{children}<Button variant="subtle" size="compact-sm" onClick={onClear}>Bỏ chọn</Button></div>
  </motion.div>}</AnimatePresence>;
}

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 500);
    window.addEventListener('scroll', update, { passive: true }); update();
    return () => window.removeEventListener('scroll', update);
  }, []);
  return <AnimatePresence>{visible && <motion.button type="button" className="sc-back-to-top" aria-label="Về đầu trang" title="Về đầu trang"
    initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
    onClick={() => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })}>
    <span className="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
  </motion.button>}</AnimatePresence>;
}

/** Flash only added/changed records after the first successful list load. */
export function useUpdatedItems(entries: ReadonlyArray<{ id: string; version: string }> | undefined, scope = '') {
  const previous = useRef<Map<string, string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [updated, setUpdated] = useState(new Set<string>());
  const previousScope = useRef(scope);
  const signature = JSON.stringify([scope, entries]);
  useEffect(() => {
    if (!entries) return;
    const next = new Map(entries.map(item => [item.id, item.version]));
    if (previousScope.current !== scope) {
      previous.current = null; previousScope.current = scope;
      clearTimeout(timer.current); setUpdated(new Set());
    }
    if (previous.current) {
      const changes = entries.filter(item => previous.current?.get(item.id) !== item.version).map(item => item.id);
      if (changes.length) {
        clearTimeout(timer.current); setUpdated(new Set(changes));
        timer.current = setTimeout(() => setUpdated(new Set()), 1600);
      }
    }
    previous.current = next;
  }, [signature]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return updated;
}

export function EvidencePreview({ url, label = 'Ảnh chứng từ' }: { url: string; label?: string }) {
  if (!/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(url)) return null;
  return <ImageLightbox src={url} alt={label}><span className="sc-button sc-button-ghost">Xem ảnh</span></ImageLightbox>;
}

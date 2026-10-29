import { forwardRef, useEffect, useId, useRef, useState, type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, animate, motion, useAnimationControls, useIsPresent, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from 'motion/react';
import { EmptyState } from './PageStates';
import { RetainedHeight } from './RetainedHeight';
import './author-admin-motion.css';

/** Opt-in helpers: callers are author/admin screens, not global providers. */
export function ResultsSurface({ identity, retain = false, busy = false, children }: PropsWithChildren<{ identity: string; retain?: boolean; busy?: boolean }>) {
  const animation = useAnimationControls();
  const reduce = useReducedMotion();
  const previous = useRef(identity);
  useEffect(() => {
    if (previous.current !== identity && !reduce) void animation.start({ opacity: [0.75, 1], transition: { duration: 0.16 } });
    previous.current = identity;
  }, [identity, reduce, animation]);
  return <RetainedHeight retain={retain || busy}><motion.div className="sc-results-surface" aria-busy={busy} animate={animation}>{children}</motion.div></RetainedHeight>;
}

export function ProjectLayout({ children }: PropsWithChildren) {
  const id = useId();
  return <LayoutGroup id={id}><AnimatePresence initial={false} mode="popLayout">{children}</AnimatePresence></LayoutGroup>;
}

export const AnimatedCollection = forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(function AnimatedCollection({ children, ...props }, ref) {
  const present = useIsPresent();
  return <motion.div {...props} ref={ref} aria-hidden={!present || undefined} inert={!present}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>{children}</motion.div>;
});

export function ProjectMotionCard({ id, as = 'article', className, children }: PropsWithChildren<{ id: string; as?: 'article' | 'div'; className?: string }>) {
  const reduce = useReducedMotion();
  const Component = as === 'article' ? motion.article : motion.div;
  return <Component layoutId={reduce ? undefined : id} layout={reduce ? false : 'position'} transition={{ duration: 0.22 }} className={`sc-motion-project ${className ?? ''}`}>{children}</Component>;
}

export type ActiveFilter = { id: string; label: string; onRemove: () => void };
export function ActiveFilterChips({ items }: { items: ActiveFilter[] }) {
  const reduce = useReducedMotion();
  return <div className="sc-filter-chips" role="list" aria-label="Bộ lọc đang áp dụng">
    <AnimatePresence initial={false}>{items.map(item => <motion.div key={item.id} role="listitem" layout={reduce ? false : 'position'}
      initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }} transition={{ duration: 0.12 }}>
      <button type="button" onClick={item.onRemove} aria-label={`Bỏ bộ lọc ${item.label}`}>{item.label}<span aria-hidden="true">×</span></button>
    </motion.div>)}</AnimatePresence>
  </div>;
}

export function LoadedImage({ src, alt = '', className = '', onLoad, onError, ...props }: HTMLMotionProps<'img'>) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const image = useRef<HTMLImageElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    setState(image.current?.complete && image.current.naturalWidth > 0 ? 'loaded' : 'loading');
  }, [src]);
  return <span className="sc-loaded-image" data-state={state}>
    {state === 'loading' && <span className="sc-image-placeholder" aria-hidden="true" />}
    <motion.img {...props} ref={image} src={src} alt={alt} className={className} aria-hidden={state === 'error' || undefined}
      initial={{ opacity: 0 }} animate={{ opacity: state === 'loaded' ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.18 }}
      onLoad={event => { setState('loaded'); onLoad?.(event); }} onError={event => { setState('error'); onError?.(event); }} />
    {state === 'error' && <span className="sc-image-fallback" role="img" aria-label={alt || 'Không tải được ảnh'}><span className="material-symbols-outlined" aria-hidden="true">image_not_supported</span></span>}
  </span>;
}

const localNumber = (value: number) => value.toLocaleString('vi-VN');
export function AnimatedNumber({ value, format = localNumber, ready = true }: { value: number; format?: (value: number) => string; ready?: boolean }) {
  const valid = Number.isFinite(value);
  const actual = valid ? value : 0;
  const number = useMotionValue(actual);
  const display = useTransform(number, latest => format(Math.round(latest)));
  const previousReady = useRef(ready);
  const reduce = useReducedMotion();
  useEffect(() => {
    const immediately = reduce || !ready || !previousReady.current;
    previousReady.current = ready;
    if (immediately) { number.set(actual); return; }
    const playback = animate(number, actual, { duration: 0.32, ease: 'easeOut' });
    return () => playback.stop();
  }, [actual, ready, reduce, number]);
  if (!valid) return <span>—</span>;
  return <span className="sc-animated-number"><span className="sc-number-reserve" aria-hidden="true">{format(actual)}</span><motion.span aria-hidden="true">{display}</motion.span><span className="sc-motion-sr-only">{format(actual)}</span></span>;
}

export function AnimatedEmptyState(props: ComponentProps<typeof EmptyState>) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.16 }}><EmptyState {...props} /></motion.div>;
}

export function SuggestionReveal({ children, index = 0 }: PropsWithChildren<{ index?: number }>) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.16, delay: reduce ? 0 : Math.min(index, 5) * 0.04 }}>{children}</motion.div>;
}

export function AnimatedStepper({ current, onChange, steps }: { current: number; onChange: (step: number) => void; steps: ReadonlyArray<{ title: string; description: ReactNode; completed?: boolean }> }) {
  const group = useId();
  const reduce = useReducedMotion();
  return <LayoutGroup id={group}><nav className="sc-import-stepper" aria-label="Các bước nhập bản thảo">
    {steps.map((step, index) => <button key={index} type="button" onClick={() => onChange(index + 1)} aria-current={current === index + 1 ? 'step' : undefined}>
      {current === index + 1 && <motion.span layoutId="active-import-step" className="sc-import-step-highlight" transition={{ duration: reduce ? 0 : 0.2 }} />}
      <span className="sc-import-step-number" aria-hidden="true">{step.completed ? '✓' : index + 1}</span>
      <span className="sc-import-step-text"><strong>{step.title}</strong><span>{step.description}</span></span>
    </button>)}
  </nav></LayoutGroup>;
}

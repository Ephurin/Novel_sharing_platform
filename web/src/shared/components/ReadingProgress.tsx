import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import './animated-feedback.css';

/** Measure manuscript content only, excluding controls and the comment thread. */
export function ReadingProgress({ children }: PropsWithChildren) {
  const content = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      setValue(distance <= 0 ? (rect.bottom <= window.innerHeight ? 100 : 0) : Math.max(0, Math.min(100, -rect.top / distance * 100)));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);
  return <>
    <div className="sc-reading-progress" role="progressbar" aria-label="Tiến độ đọc chương" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div style={{ transform: `scaleX(${value / 100})` }} />
    </div>
    <div ref={content}>{children}</div>
  </>;
}

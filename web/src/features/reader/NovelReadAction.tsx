import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** A single contextual action appears on mobile after its original leaves the viewport. */
export function NovelReadAction({ to, label }: { to: string; label: string }) {
  const anchor = useRef<HTMLAnchorElement>(null);
  const [floating, setFloating] = useState(false);
  const location = useLocation();
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = anchor.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setFloating(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, [to]);
  return <>
    <Link ref={anchor} to={to} className="sc-button sc-button-primary" data-testid="novel-main-read"><span className="material-symbols-outlined" aria-hidden="true">menu_book</span>{label}</Link>
    <AnimatePresence>{floating && <motion.div key={location.pathname} className="sc-novel-floating-read" initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 12 }} transition={{ duration: reduce ? 0 : .16 }}>
      <Link to={to} className="sc-button sc-button-primary" data-testid="novel-floating-read">{label}<span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span></Link>
    </motion.div>}</AnimatePresence>
  </>;
}

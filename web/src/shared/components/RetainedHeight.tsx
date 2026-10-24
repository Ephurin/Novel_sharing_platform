import { useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';

// Keep the unfiltered space so filtering does not collapse the page or clamp scroll.
// Observe the inner content, not the reserved space, to avoid resize feedback.
export function RetainedHeight({ retain, children }: PropsWithChildren<{ retain: boolean }>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const bounds = content.getBoundingClientRect();
      const sameWidth = Math.abs(bounds.width - widthRef.current) < 1;
      widthRef.current = bounds.width;
      setHeight(previous => retain && sameWidth ? Math.max(previous, bounds.height) : bounds.height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [retain]);

  return (
    <div style={{ minHeight: retain && height > 0 ? height : undefined }}>
      <div ref={contentRef} className="flow-root">{children}</div>
    </div>
  );
}

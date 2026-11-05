import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { Collapsible } from '@animate-ui/react/primitives/radix-ui/collapsible';
import './animated-disclosure.css';

export function AnimatedDisclosure({ summary, children, className = '', summaryClassName = '' }: PropsWithChildren<{
  summary: ReactNode;
  className?: string;
  summaryClassName?: string;
}>) {
  const [open, setOpen] = useState(false);
  return <Collapsible.Root open={open} onOpenChange={setOpen} className={`sc-disclosure ${className}`}>
    <Collapsible.Trigger className={`sc-disclosure-trigger ${summaryClassName}`}>
      {summary}
    </Collapsible.Trigger>
    {/* Keep form values and child state when collapsed, as native details did. */}
    <Collapsible.Content forceMount className="sc-disclosure-content" aria-hidden={!open}
      transition={{ duration: 0.22, ease: 'easeOut' }}>
      <div inert={!open}>{children}</div>
    </Collapsible.Content>
  </Collapsible.Root>;
}

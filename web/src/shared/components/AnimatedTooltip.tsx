import type { ReactElement, ReactNode } from 'react';
import { Tooltip } from '@animate-ui/react/primitives/radix-ui/tooltip';
import './animated-tooltip.css';

/** Animate UI pilot: keep styling independent of shadcn and Tailwind versions. */
export function AnimatedTooltip({ children, label }: { children: ReactElement; label: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="sc-animated-tooltip" side="top" sideOffset={6} collisionPadding={12}>
            {label}
            <Tooltip.Arrow className="sc-animated-tooltip-arrow" width={10} height={5} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

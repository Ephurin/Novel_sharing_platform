import type { ComponentProps } from 'react';
import { Checkbox } from '@mantine/core';

export function AnimatedCheckIcon({ indeterminate, className }: { indeterminate: boolean | undefined; className: string }) {
  return <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <path className="sc-checkbox-stroke" pathLength="1" d={indeterminate ? 'M3 8h10' : 'M3 8l3 3 7-7'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function AnimatedCheckbox(props: ComponentProps<typeof Checkbox>) {
  return <Checkbox {...props} />;
}

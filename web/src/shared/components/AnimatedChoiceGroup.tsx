import type { ReactNode } from 'react';
import { ToggleGroup } from '@animate-ui/react/primitives/radix-ui/toggle-group';
import './animated-choice-group.css';

type Choice<T extends string> = { value: T; label: ReactNode };

/** A required single choice: selecting the active item must not clear a filter. */
export function AnimatedChoiceGroup<T extends string>({ value, onChange, options, label, controls, className = '' }: {
  value: T;
  onChange: (value: T) => void;
  options: readonly Choice<T>[];
  label: string;
  controls?: string;
  className?: string;
}) {
  return <ToggleGroup.Root type="single" value={value} aria-label={label} className={`sc-choice-group ${className}`}
    onValueChange={next => {
      const choice = options.find(option => option.value === next);
      if (choice) onChange(choice.value);
    }}>
    {options.map(option => <ToggleGroup.Item key={option.value} value={option.value} aria-controls={controls} className="sc-choice-item">
      {option.label}
    </ToggleGroup.Item>)}
  </ToggleGroup.Root>;
}

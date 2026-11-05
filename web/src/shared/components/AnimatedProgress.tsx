import { Progress } from '@animate-ui/react/primitives/radix-ui/progress';
import './animated-feedback.css';

export function AnimatedProgress({ value, label }: { value: number | null; label: string }) {
  const percent = value === null || !Number.isFinite(value) ? null : Math.min(100, Math.max(0, value));
  return <div className="sc-task-progress">
    <div className="sc-task-progress-label"><span>{label}</span>{percent !== null && <span aria-hidden="true">{Math.round(percent)}%</span>}</div>
    <Progress.Root value={percent} className="sc-task-progress-track" aria-label={label}>
      <Progress.Indicator className="sc-task-progress-indicator" style={percent === null ? undefined : { transform: `translateX(-${100 - percent}%)` }} />
    </Progress.Root>
  </div>;
}

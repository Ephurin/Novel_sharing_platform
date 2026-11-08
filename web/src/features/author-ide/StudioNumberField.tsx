import { useEffect, useState } from 'react';

/** Keep partial typing local; Enter or blur commits a value within the supported range. */
export function StudioNumberField({ value, onChange, min, max, step, label }: {
  value: number; onChange: (value: number) => void; min: number; max: number; step: number; label: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    const next = !draft.trim() || !Number.isFinite(parsed) ? value : Math.max(min, Math.min(max, step === 1 ? Math.round(parsed) : parsed));
    setDraft(String(next)); onChange(next);
  };
  return <input className="sc-studio-number-field" type="number" aria-label={label} title={label} min={min} max={max} step={step} value={draft}
    onFocus={event => event.currentTarget.select()}
    onChange={event => setDraft(event.currentTarget.value)}
    onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(String(value)); } }} />;
}

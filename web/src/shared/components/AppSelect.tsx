import { useEffect, useRef, useState } from 'react';

type AppSelectOption<T extends string> = { value: T; label: string };

export function AppSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  icon
}: {
  value: T;
  options: Array<AppSelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`w-full sm:w-auto sm:min-w-[180px] inline-flex items-center gap-1.5 py-1.5 pl-2.5 pr-2 rounded-lg bg-[#f9f8f4] border text-xs text-stone-800 transition-colors cursor-pointer ${
          open ? 'border-primary-300 ring-1 ring-primary-200 bg-white' : 'border-stone-200 hover:border-stone-300'
        }`}
      >
        {icon ? <span className="material-symbols-outlined text-[16px] text-stone-400">{icon}</span> : null}
        <span className="flex-1 text-left truncate">{selected?.label}</span>
        <span
          className={`material-symbols-outlined text-[16px] text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 z-30 mt-1.5 w-full min-w-[200px] py-1 rounded-lg bg-white border border-stone-200 shadow-[0_8px_24px_rgba(28,25,23,0.08)]"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                    isSelected ? 'text-primary-700 bg-primary-50 font-medium' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <span>{option.label}</span>
                  {isSelected ? <span className="material-symbols-outlined text-[15px] text-primary-600">check</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

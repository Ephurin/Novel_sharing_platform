import type { ReactNode } from 'react';

export function PageTitle({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <h1 className="font-headline-sm text-[24px] leading-snug text-stone-900 font-bold tracking-tight">{title}</h1>
        <p className="text-[13px] text-stone-500 mt-0.5">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
    </div>
  );
}

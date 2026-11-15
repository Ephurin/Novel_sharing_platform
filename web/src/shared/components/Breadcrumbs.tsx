import { Link } from 'react-router-dom';
import './breadcrumbs.css';

export type BreadcrumbItem = { label: string; to?: string };

/** Only show a trail when the current page has an actual parent destination. */
export function Breadcrumbs({ items, className = '' }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length < 2) return null;
  return <nav aria-label="Breadcrumb" className={`sc-breadcrumbs ${className}`}><ol>
    {items.map((item, index) => <li key={`${item.to ?? ''}-${index}`}>
      {index > 0 && <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>}
      {index < items.length - 1 && item.to
        ? <Link to={item.to} title={item.label}>{item.label}</Link>
        : <span aria-current={index === items.length - 1 ? 'page' : undefined} title={item.label}>{item.label}</span>}
    </li>)}
  </ol></nav>;
}

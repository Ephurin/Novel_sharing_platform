import { NavLink, Outlet } from 'react-router-dom';

export const readerCollections = [
  { to: '/reader/library', label: 'Thư viện của tôi', icon: 'local_library' },
  { to: '/reader/bookmarks', label: 'Đoạn đã đánh dấu', icon: 'bookmarks' },
  { to: '/reader/history', label: 'Lịch sử đọc', icon: 'history' }
] as const;

export function ReaderCollectionsLayout() {
  return <div className="sc-reader-collections">
    <nav className="sc-reader-collections-nav" aria-label="Mục đọc của tôi">
      {readerCollections.map(item => <NavLink key={item.to} to={item.to} end>
        <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </NavLink>)}
    </nav>
    <div className="sc-reader-collections-content"><Outlet /></div>
  </div>;
}

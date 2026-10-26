import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button, Menu } from '@mantine/core';
import { useAuthStore } from '../auth/useAuthStore';
import { NotificationBell } from '../notifications/NotificationBell';
import { ThemeControl } from '../../shared/components/ThemeControl';
import './admin.css';

const navigation = [
  ['/admin', 'grid_view', 'Tổng quan'],
  ['/admin/users', 'group', 'Người dùng'],
  ['/admin/novels', 'menu_book', 'Danh sách truyện'],
  ['/admin/taxonomy', 'sell', 'Thể loại & Tag'],
  ['/admin/moderation', 'fact_check', 'Kiểm duyệt'],
  ['/admin/reports', 'flag', 'Báo cáo người dùng'],
  ['/admin/withdraws', 'payments', 'Yêu cầu rút tiền']
] as const;

export function AdminIcon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

export function AdminShell({ onLogout }: { onLogout: () => void }) {
  const user = useAuthStore(state => state.user);
  const location = useLocation();
  const [opened, setOpened] = useState(false);
  const title = [...navigation].reverse().find(([path]) => location.pathname === path || (path !== '/admin' && location.pathname.startsWith(`${path}/`)))?.[2] ?? 'Bảng quản trị';
  return <div className="admin-shell">
    <aside className={`admin-sidebar ${opened ? 'is-open' : ''}`} aria-label="Điều hướng quản trị">
      <Link className="admin-brand" to="/admin"><AdminIcon name="auto_stories" /><strong>StoryCraft</strong><span>Quản trị</span></Link>
      <p className="admin-nav-label">Quản lý hệ thống</p>
      <nav>{navigation.map(([path, icon, label]) => <NavLink key={path} to={path} end={path === '/admin'} onClick={() => setOpened(false)}><AdminIcon name={icon} />{label}</NavLink>)}</nav>
      <div className="admin-sidebar-footer"><Link to="/author"><AdminIcon name="open_in_new" />Xem trang tác giả<AdminIcon name="arrow_forward" /></Link></div>
    </aside>
    {opened && <button className="admin-nav-overlay" aria-label="Đóng điều hướng" onClick={() => setOpened(false)} />}
    <header className="admin-topbar">
      <div className="admin-breadcrumb"><button className="admin-mobile-toggle" aria-label="Mở điều hướng" aria-expanded={opened} onClick={() => setOpened(!opened)}><AdminIcon name="menu" /></button><AdminIcon name="shield_person" /><span>Bảng quản trị</span><span>/</span><strong>{title}</strong></div>
      <div className="admin-account"><ThemeControl /><NotificationBell /><Menu position="bottom-end"><Menu.Target><Button variant="subtle" className="admin-account-button"><AdminIcon name="account_circle" /><span>{user?.displayName || user?.username}<small>Quản trị viên</small></span><AdminIcon name="expand_more" /></Button></Menu.Target><Menu.Dropdown><Menu.Item component={Link} to="/profile/me">Hồ sơ của tôi</Menu.Item><Menu.Item color="red" onClick={onLogout} data-testid="shell-logout-btn">Đăng xuất</Menu.Item></Menu.Dropdown></Menu></div>
    </header>
    <main className="admin-main"><Outlet /><footer className="admin-footer"><AdminIcon name="auto_stories" />StoryCraft Publishing CMS <span>• Dành riêng cho Quản trị viên</span></footer></main>
  </div>;
}

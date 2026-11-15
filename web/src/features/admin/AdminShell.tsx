import { SessionMarker } from '../../shared/components/AuthorTheme';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@mantine/core';
import { AnimatedMenu as Menu } from '../../shared/components/AnimatedMenu';
import { useAuthStore } from '../auth/useAuthStore';
import { Navigate } from 'react-router-dom';
import { useAdminAccess, scopeLabels, type Permission } from './admin-operations-api';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';
import { NotificationBell } from '../notifications/NotificationBell';
import { ThemeControl } from '../../shared/components/ThemeControl';
import { WorkspaceCommands } from '../../shared/components/WorkspaceCommands';
import './admin.css';

const navigation = [
  ['/admin', 'grid_view', 'Tổng quan'],
  ['/admin/users', 'group', 'Người dùng'],
  ['/admin/novels', 'menu_book', 'Danh sách truyện'],
  ['/admin/taxonomy', 'sell', 'Thể loại & Tag'],
  ['/admin/moderation', 'fact_check', 'Kiểm duyệt'],
  ['/admin/reports', 'flag', 'Báo cáo người dùng'],
  ['/admin/withdraws', 'payments', 'Yêu cầu rút tiền'],
  ['/admin/appeals', 'forum', 'Khiếu nại'],
  ['/admin/audit', 'history', 'Nhật ký quản trị']
] as const;

export function AdminIcon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      {name}
    </span>
  );
}

export function AdminShell({ onLogout }: { onLogout: () => void }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const [opened, setOpened] = useState(false);
  const access = useAdminAccess();
  const can = (path: string) => {
    const permissions = access.data?.permissions || [];
    const permission: Permission | undefined =
      path === '/admin'
        ? 'audit'
        : path.startsWith('/admin/users')
          ? 'users'
          : path.startsWith('/admin/withdraws')
            ? 'finance'
            : /^\/admin\/(novels|taxonomy|moderation|reports)/.test(path)
              ? 'content'
              : undefined;
    if (path.startsWith('/admin/appeals'))
      return permissions.includes('content') || permissions.includes('users');
    return !permission || permissions.includes(permission);
  };
  const home = access.data?.permissions.includes('audit')
    ? '/admin'
    : access.data?.permissions.includes('content')
      ? '/admin/moderation'
      : access.data?.permissions.includes('users')
        ? '/admin/users'
        : '/admin/withdraws';
  const title =
    [...navigation]
      .reverse()
      .find(
        ([path]) =>
          location.pathname === path ||
          (path !== '/admin' && location.pathname.startsWith(`${path}/`))
      )?.[2] ?? 'Bảng quản trị';
  return (
    <div className="admin-shell">
      {user && <SessionMarker role={user.role} username={user.username} />}
      <aside
        className={`admin-sidebar ${opened ? 'is-open' : ''}`}
        aria-label="Điều hướng quản trị"
      >
        <Link className="admin-brand" to="/admin">
          <AdminIcon name="auto_stories" />
          <strong>StoryCraft</strong>
          <span>Quản trị</span>
        </Link>
        <p className="admin-nav-label">Quản lý hệ thống</p>
        <nav>
          {navigation
            .filter(([path]) => can(path))
            .map(([path, icon, label]) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/admin'}
                onClick={() => setOpened(false)}
              >
                <AdminIcon name={icon} />
                {label}
              </NavLink>
            ))}
        </nav>
        {access.data?.permissions.includes('content') && <div className="admin-sidebar-footer">
          <Link to="/author">
            <AdminIcon name="open_in_new" />
            Xem trang tác giả
            <AdminIcon name="arrow_forward" />
          </Link>
        </div>}
      </aside>
      {opened && (
        <button
          className="admin-nav-overlay"
          aria-label="Đóng điều hướng"
          onClick={() => setOpened(false)}
        />
      )}
      <header className="admin-topbar">
        <div className="admin-breadcrumb">
          <button
            className="admin-mobile-toggle"
            aria-label="Mở điều hướng"
            aria-expanded={opened}
            onClick={() => setOpened(!opened)}
          >
            <AdminIcon name="menu" />
          </button>
          <AdminIcon name="shield_person" />
          <span>Bảng quản trị</span>
          <span>/</span>
          <strong>{title}</strong>
        </div>
        <div className="admin-account">
          <WorkspaceCommands commands={access.data ? navigation.filter(([path]) => can(path)).map(([to, icon, label]) => ({ to, icon, label })) : []} />
          <ThemeControl />
          <NotificationBell />
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="subtle" className="admin-account-button">
                <AdminIcon name="account_circle" />
                <span>
                  {user?.displayName || user?.username}
                  <small>{scopeLabels[access.data?.scope || ''] || 'Quản trị viên'}</small>
                </span>
                <AdminIcon name="expand_more" />
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={Link} to="/profile/me">
                Hồ sơ của tôi
              </Menu.Item>
              <Menu.Item color="red" onClick={onLogout} data-testid="shell-logout-btn">
                Đăng xuất
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </header>
      <main className="admin-main">
        {access.isLoading ? (
          <LoadingState label="Đang kiểm tra quyền quản trị..." />
        ) : access.isError ? (
          <ErrorState error={access.error} onRetry={() => void access.refetch()} />
        ) : can(location.pathname) ? (
          <Outlet />
        ) : (
          <Navigate to={home} replace />
        )}
        <footer className="admin-footer">
          <AdminIcon name="auto_stories" />
          StoryCraft Publishing CMS <span>• Dành riêng cho Quản trị viên</span>
        </footer>
      </main>
    </div>
  );
}

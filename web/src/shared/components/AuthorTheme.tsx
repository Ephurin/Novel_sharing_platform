import { NotificationBell } from '../../features/notifications/NotificationBell';
import { ThemeControl } from './ThemeControl';
import { WorkspaceCommands } from './WorkspaceCommands';
import { FocusTrap, useComputedColorScheme } from '@mantine/core';
import { AnimatedMenu as Menu } from './AnimatedMenu';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { logout } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { readAuthorContext } from '../../features/author-ide/author-context';
import '../../theme/storycraft.css';

export function AuthorTheme({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  return <div className={`sc-author-theme ${className}`} data-sc-color-scheme={colorScheme}>{children}</div>;
}

export function AuthorDialog({ children, onClose }: PropsWithChildren<{ onClose: () => void }>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const previousFocus = useRef(document.activeElement);
  closeRef.current = onClose;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      // Responsive utilities hide controls through CSS, so use rendered visibility
      // when cycling focus instead of relying on inline display styles.
      if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]') ?? [])
          .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
        const current = controls.findIndex((element) => element === document.activeElement);
        const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        event.preventDefault();
        event.stopPropagation();
        (controls[next] ?? dialogRef.current)?.focus();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus({ preventScroll: true });
    };
  }, []);
  return <FocusTrap active innerRef={dialogRef}><div role="dialog" aria-modal="true" aria-label="Hộp thoại StoryCraft" className="sc-dialog" tabIndex={-1}><FocusTrap.InitialFocus />{children}</div></FocusTrap>;
}

/**
 * Stable, non-visual hook for the signed-in session. Browser tests read the role and username from
 * here instead of parsing shell text, so they keep working across shell redesigns.
 */
export function SessionMarker({ role, username }: { role: string; username: string }) {
  return <span hidden data-testid="shell-session" data-user-role={role} data-username={username} />;
}

export function AuthorNavbar() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const novelId = params.novelId || searchParams.get('novelId') || readAuthorContext(user?.userId ?? '').novelId;
  const writingUrl = novelId ? `/author/ide?novelId=${encodeURIComponent(novelId)}` : '/author';
  const name = user?.displayName || user?.username || 'Tài khoản';
  // Readers and guests share this navbar so every StoryCraft page has one header; only authors and
  // admins get the writing workspace links.
  const isWriter = user?.role === 'AUTHOR' || user?.role === 'ADMIN';
  const path = location.pathname;
  const readerLink = (active: boolean) => (active ? 'sc-nav-link is-active' : 'sc-nav-link');

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearSession();
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="sc-navbar">
      <div className="sc-navbar-inner">
        <Link to={isWriter ? '/author' : user ? '/reader' : '/public'} className="sc-brand" aria-label={isWriter ? 'StoryCraft — Bàn làm việc' : 'StoryCraft — Khám phá truyện'}>
          <span className="material-symbols-outlined">menu_book</span>
          <span>StoryCraft</span><span className="sc-brand-edition">Văn Hoa</span>
        </Link>
        {isWriter ? (
          <nav className="sc-global-nav" aria-label="Điều hướng chính">
            <NavLink to="/author/projects" className={(path === '/author' || path.startsWith('/author/')) && path !== '/author/profile' ? 'sc-nav-link is-active' : 'sc-nav-link'}>Tác phẩm</NavLink>
            <NavLink to="/reader" end className="sc-nav-link">Đọc truyện</NavLink>
            <NavLink to="/wallet" className="sc-nav-link">Ví &amp; doanh thu</NavLink>
            <NavLink to="/author/profile" className="sc-nav-link">Trang tác giả</NavLink>
          </nav>
        ) : user ? (
          <nav className="sc-global-nav" aria-label="Điều hướng chính">
            <Link to="/reader" className={readerLink(path === '/reader' || path.startsWith('/reader/novels') || path.startsWith('/reader/chapters') || path.startsWith('/authors/'))}>Khám phá</Link>
            <Link to="/reader/library" className={readerLink(path.startsWith('/reader/library'))}>Thư viện</Link>
            <Link to="/reader/history" className={readerLink(path.startsWith('/reader/history'))}>Lịch sử đọc</Link>
            <Link to="/wallet" className={readerLink(path.startsWith('/wallet'))}>Ví xu</Link>
          </nav>
        ) : (
          <nav className="sc-global-nav" aria-label="Điều hướng chính">
            <Link to="/public" className={readerLink(path.startsWith('/public'))}>Thư viện công khai</Link>
          </nav>
        )}
        <div className="sc-navbar-actions">
          {isWriter && <WorkspaceCommands author commands={[
            { label: 'Tác phẩm của tôi', to: '/author/projects', icon: 'menu_book' },
            { label: 'Viết tiếp', to: writingUrl, icon: 'edit_note' },
            ...(novelId ? [{ label: 'Quản lý tác phẩm đang viết', to: `/author/novels/${novelId}` }, { label: 'Nhập bản thảo', to: `/author/import/${novelId}` }, { label: 'Cẩm nang tác phẩm', to: `/author/context/${novelId}` }] : []),
            { label: 'Ví và doanh thu', to: '/wallet', icon: 'payments' },
            { label: 'Trang tác giả', to: '/author/profile', icon: 'person' },
            { label: 'Hồ sơ và cài đặt', to: '/profile/me' }
          ]} />}
          <ThemeControl />
          {isWriter && location.pathname !== '/author/ide' && <Link to={writingUrl} className="sc-button sc-button-primary sc-continue"><span className="material-symbols-outlined">edit_note</span><span>Viết tiếp</span></Link>}
          {!user && <Link to="/login" className="sc-button sc-button-primary"><span className="material-symbols-outlined">login</span><span>Đăng nhập</span></Link>}
          {user && <NotificationBell />}
          {user && <SessionMarker role={user.role} username={user.username} />}
          {user && <Menu position="bottom-end" withinPortal={false}>
            <Menu.Target>
              <button type="button" className="sc-avatar" aria-label={`Tài khoản ${name}`} data-testid="shell-avatar-btn">
                {user?.avatarUrl ? <img src={user.avatarUrl} alt={name} /> : name.slice(0, 1).toUpperCase()}
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{name}</Menu.Label>
              <Menu.Item component={Link} to="/appeals">Quyết định &amp; khiếu nại</Menu.Item>
              <Menu.Item component={Link} to="/profile/me">Hồ sơ &amp; cài đặt</Menu.Item>
              {isWriter ? <>
                <Menu.Item component={Link} to="/author/profile">Trang tác giả</Menu.Item>
                <Menu.Item component={Link} to="/reader/library">Thư viện của tôi</Menu.Item>
                <Menu.Item component={Link} to="/reader/history">Lịch sử đọc</Menu.Item>
              </> : <Menu.Item component={Link} to="/notifications">Thông báo</Menu.Item>}
              <Menu.Divider />
              <Menu.Item onClick={() => void handleLogout()} data-testid="shell-logout-btn">Đăng xuất</Menu.Item>
            </Menu.Dropdown>
          </Menu>}
        </div>
      </div>
    </header>
  );
}

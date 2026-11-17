import { NotificationBell } from '../../features/notifications/NotificationBell';
import { ThemeControl } from './ThemeControl';
import { WorkspaceCommands } from './WorkspaceCommands';
import { FocusTrap, useComputedColorScheme } from '@mantine/core';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { AnimatedMenu as Menu } from './AnimatedMenu';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { logout } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { readAuthorContext } from '../../features/author-ide/author-context';
import '../../theme/storycraft.css';
import { navigationLabels } from './navigation';

export function AuthorTheme({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  return <div className={`sc-author-theme ${className}`} data-sc-color-scheme={colorScheme}>{children}</div>;
}

export function AuthorDialog({ children, onClose }: PropsWithChildren<{ onClose: () => void }>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const previousFocus = useRef(document.activeElement);
  const reduce = useReducedMotion();
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
  return (
    <FocusTrap active innerRef={dialogRef}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Hộp thoại StoryCraft"
        className="sc-dialog"
        tabIndex={-1}
        initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <FocusTrap.InitialFocus />
        {children}
      </motion.div>
    </FocusTrap>
  );
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
  const [navbarHidden, setNavbarHidden] = useState(false);
  const navbarRef = useRef<HTMLElement>(null);
  const autoHide = !isWriter;
  useEffect(() => {
    setNavbarHidden(false);
    if (!autoHide) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const nextY = Math.max(0, window.scrollY);
      if (nextY <= 64) {
        setNavbarHidden(false);
        lastY = nextY;
      } else if (Math.abs(nextY - lastY) >= 6) {
        const focused = document.activeElement;
        const interacting = navbarRef.current?.querySelector('[aria-expanded="true"]') ||
          (focused?.matches(':focus-visible') && navbarRef.current?.contains(focused));
        setNavbarHidden(nextY > lastY && !interacting);
        lastY = nextY;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [autoHide, path]);
  const reduce = useReducedMotion();
  const readerLink = (active: boolean) => (active ? 'sc-nav-link is-active' : 'sc-nav-link');
  const navPill = <motion.span layoutId="sc-global-nav-pill" className="sc-nav-pill" aria-hidden="true" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }} />;

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
    <header ref={navbarRef} className={`sc-navbar${navbarHidden ? ' sc-navbar-hidden' : ''}`} inert={navbarHidden} onFocusCapture={() => setNavbarHidden(false)}>
      <div className="sc-navbar-inner">
        <Link to="/" className="sc-brand" aria-label={`StoryCraft — ${navigationLabels.home}`}>
          <span className="material-symbols-outlined">menu_book</span>
          <span>StoryCraft</span><span className="sc-brand-edition">Văn Hoa</span>
        </Link>
        <LayoutGroup id="sc-global-nav">
          {isWriter ? (
            <nav className="sc-global-nav" aria-label="Điều hướng chính">
              {(() => {
                const authorActive = (path === '/author' || path.startsWith('/author/')) && path !== '/author/profile';
                const readerActive = path === '/reader';
                const walletActive = path.startsWith('/wallet');
                const profileActive = path === '/author/profile';
                return (
                  <>
                    <NavLink to="/author/projects" className={authorActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
                      {authorActive && navPill}
                      <span>{navigationLabels.authorHome}</span>
                    </NavLink>
                    <NavLink to="/reader" end className={readerActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
                      {readerActive && navPill}
                      <span>{navigationLabels.readerHome}</span>
                    </NavLink>
                    <NavLink to="/wallet" className={walletActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
                      {walletActive && navPill}
                      <span>{navigationLabels.authorWallet}</span>
                    </NavLink>
                    <NavLink to="/author/profile" className={profileActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
                      {profileActive && navPill}
                      <span>{navigationLabels.authorProfile}</span>
                    </NavLink>
                  </>
                );
              })()}
            </nav>
          ) : user ? (
            <nav className="sc-global-nav" aria-label="Điều hướng chính">
              {[
                { to: '/', label: navigationLabels.home, active: path === '/' },
                { to: '/reader', label: navigationLabels.readerHome, active: path === '/reader' || path.startsWith('/reader/novels') || path.startsWith('/reader/chapters') || path.startsWith('/authors/') },
                { to: '/reader/library', label: 'Thư viện của tôi', active: path.startsWith('/reader/library') },
                { to: '/reader/bookmarks', label: 'Bookmark', active: path.startsWith('/reader/bookmarks') },
                { to: '/reader/history', label: 'Lịch sử đọc', active: path.startsWith('/reader/history') },
                { to: '/wallet', label: navigationLabels.readerWallet, active: path.startsWith('/wallet') },
              ].map((item) => (
                <Link key={item.to} to={item.to} className={readerLink(item.active)}>
                  {item.active && navPill}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          ) : (
            <nav className="sc-global-nav" aria-label="Điều hướng chính">
              {[
                { to: '/', label: navigationLabels.home, active: path === '/' },
                { to: '/public', label: navigationLabels.readerHome, active: path.startsWith('/public') && !path.startsWith('/public/bookmarks') },
                { to: '/public/bookmarks', label: 'Bookmark', active: path.startsWith('/public/bookmarks') },
              ].map((item) => (
                <Link key={item.to} to={item.to} className={readerLink(item.active)}>
                  {item.active && navPill}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          )}
        </LayoutGroup>
        <div className="sc-navbar-actions">
          {isWriter && <WorkspaceCommands author commands={[
            { label: navigationLabels.authorHome, to: '/author/projects', icon: 'menu_book' },
            { label: 'Viết tiếp', to: writingUrl, icon: 'edit_note' },
            ...(novelId ? [{ label: 'Quản lý tác phẩm đang viết', to: `/author/novels/${novelId}` }, { label: 'Nhập bản thảo', to: `/author/import/${novelId}` }, { label: 'Cẩm nang tác phẩm', to: `/author/context/${novelId}` }] : []),
            { label: navigationLabels.authorWallet, to: '/wallet', icon: 'payments' },
            { label: navigationLabels.authorProfile, to: '/author/profile', icon: 'person' },
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
              <Menu.Item component={Link} to="/reader/bookmarks">Bookmark</Menu.Item>
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

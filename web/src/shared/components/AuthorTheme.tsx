import { hasAuthorCapability } from '../../features/auth/auth-types';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { readerCollections } from '../../features/reader/ReaderCollectionsLayout';
import { GlobalSearchDropdown } from './GlobalSearchDropdown';
import { ThemeControl } from './ThemeControl';
import { WorkspaceCommands } from './WorkspaceCommands';
import { FocusTrap, useComputedColorScheme } from '@mantine/core';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { AnimatedMenu as Menu } from './AnimatedMenu';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { logout } from '../../features/auth/auth-api';
import { useResourceId } from '../../app/ResourceRoute';
import { canonicalStaticPath, routes, staticRouteTargets, navigationHref, profileHref } from '../routes';
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
  const writingUrl = navigationHref(novelId ? `/author/ide?novelId=${encodeURIComponent(novelId)}` : '/author');
  const ownProfileHref = user?.publicKey ? profileHref('author', user.userId, user.publicKey) : '/author/profile';
  const name = user?.displayName || user?.username || 'Tài khoản';
  // Readers and guests share this navbar so every StoryCraft page has one header; only authors and
  // admins get the writing workspace links.
  const isWriter = hasAuthorCapability(user?.role);
  const path = canonicalStaticPath(location.pathname);
  const discussionPath = staticRouteTargets['/discussions'];
  const discussionsActive = path === discussionPath || path.startsWith(discussionPath + '/');
  const isCatalog = path === routes.catalog || path.startsWith('/truyen/');
  const viewedAuthorId = useResourceId('authorId');
  const ownAuthorProfile = Boolean(user && viewedAuthorId === user.userId);
  const catalogPath: '/reader' | '/public' = user ? '/reader' : '/public';
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
      navigate(navigationHref('/login'), { replace: true });
    }
  }

  return (
    <header ref={navbarRef} className={`sc-navbar${discussionsActive ? ' sc-navbar-discussions' : ''}${navbarHidden ? ' sc-navbar-hidden' : ''}`} inert={navbarHidden} onFocusCapture={() => setNavbarHidden(false)}>
      <div className="sc-navbar-inner">
        <Link to="/" className="sc-brand" aria-label={`StoryCraft — ${navigationLabels.home}`}>
          <span className="material-symbols-outlined">menu_book</span>
          <span>StoryCraft</span>
        </Link>
        <LayoutGroup id="sc-global-nav">
          {isWriter ? (
            <nav className="sc-global-nav" aria-label="Điều hướng chính">
              {(() => {
                const authorActive = path === staticRouteTargets['/author'] || path.startsWith(staticRouteTargets['/author'] + '/');
                const readerActive = path === routes.catalog;
                const profileActive = ownAuthorProfile;
                const moderatorActive = path.startsWith(staticRouteTargets['/moderator/reviews']);
                const moderatorHistoryActive = path.startsWith(staticRouteTargets['/moderator/history']);
                return (
                  <>
                    <NavLink to={navigationHref("/author/projects")} className={authorActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
                      {authorActive && navPill}
                      <span>{navigationLabels.authorHome}</span>
                    </NavLink>
                    {user?.role === 'MODERATOR' && (
                      <NavLink to={navigationHref("/moderator/reviews")} className={moderatorActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
                        {moderatorActive && navPill}
                        <span>Hồ sơ điều hành</span>
                      </NavLink>
                    )}
                    {user?.role === 'MODERATOR' && (
                      <NavLink to={navigationHref("/moderator/history")} className={moderatorHistoryActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
                        {moderatorHistoryActive && navPill}
                        <span>Lịch sử thao tác</span>
                      </NavLink>
                    )}
                    <NavLink to={navigationHref("/reader")} end className={readerActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
                      {readerActive && navPill}
                      <span>{navigationLabels.readerHome}</span>
                    </NavLink>
                    <NavLink to={navigationHref("/discussions")} className={readerLink(discussionsActive)}>
                      {discussionsActive && navPill}
                      <span>Thảo luận</span>
                    </NavLink>
                    <NavLink to={ownProfileHref} className={profileActive ? 'sc-nav-link is-active' : 'sc-nav-link'}>
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
                { to: navigationHref('/reader'), label: navigationLabels.readerHome, active: isCatalog || path.startsWith('/tac-gia/') },
                { to: navigationHref('/discussions'), label: 'Thảo luận', active: discussionsActive },
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
                { to: navigationHref('/public'), label: navigationLabels.readerHome, active: isCatalog },
                { to: navigationHref('/discussions'), label: 'Thảo luận', active: discussionsActive },
              ].map((item) => (
                <Link key={item.to} to={item.to} className={readerLink(item.active)}>
                  {item.active && navPill}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          )}
        </LayoutGroup>
        {path !== staticRouteTargets['/author/ide'] && <GlobalSearchDropdown catalogPath={catalogPath} />}
        <div className="sc-navbar-actions">
          {isWriter && <WorkspaceCommands author commands={[
            { label: navigationLabels.authorHome, to: navigationHref('/author/projects'), icon: 'menu_book' },
            { label: 'Viết tiếp', to: writingUrl, icon: 'edit_note' },
            ...(novelId ? [{ label: 'Quản lý tác phẩm đang viết', to: navigationHref(`/author/novels/${novelId}`) }, { label: 'Nhập bản thảo', to: navigationHref(`/author/import/${novelId}`) }, { label: 'Cẩm nang tác phẩm', to: navigationHref(`/author/context/${novelId}`) }] : []),
            { label: navigationLabels.authorWallet, to: navigationHref('/wallet'), icon: 'payments' },
            { label: navigationLabels.authorProfile, to: ownProfileHref, icon: 'person' },
            { label: 'Hồ sơ và cài đặt', to: navigationHref('/profile/me') }
          ]} />}
          <ThemeControl />
          {isWriter && path !== staticRouteTargets['/author/ide'] && <Link to={writingUrl} className="sc-button sc-button-primary sc-continue"><span className="material-symbols-outlined">edit_note</span><span>Viết tiếp</span></Link>}
          {!user && <Link to={navigationHref("/login")} className="sc-button sc-button-primary"><span className="material-symbols-outlined">login</span><span>Đăng nhập</span></Link>}
          {user && <NotificationBell />}
          {user && <SessionMarker role={user.role} username={user.username} />}
          {user && <Menu position="bottom-end" withinPortal={false}>
            <Menu.Target>
              <button type="button" className="sc-avatar" aria-label={`Tài khoản ${name}`} data-testid="shell-avatar-btn">
                {user?.avatarUrl ? <img src={user.avatarUrl} alt={name} /> : name.slice(0, 1).toUpperCase()}
              </button>
            </Menu.Target>
            <Menu.Dropdown className="sc-account-menu">
              <div className="sc-account-menu-user">
                <strong>{name}</strong>
                {user.displayName && user.displayName !== user.username && <span>@{user.username}</span>}
              </div>
              <Menu.Divider />
              <Menu.Label>Tài khoản</Menu.Label>
              <Menu.Item
                component={Link}
                to={navigationHref("/profile/me")}
                className={path === staticRouteTargets['/profile/me'] ? 'is-active' : ''}
                aria-current={path === staticRouteTargets['/profile/me'] ? 'page' : undefined}
                leftSection={<span className="material-symbols-outlined" aria-hidden="true">person</span>}
              >
                Hồ sơ &amp; cài đặt
              </Menu.Item>
              <Menu.Item
                component={Link}
                to={navigationHref("/wallet")}
                className={(path === staticRouteTargets['/wallet'] || path.startsWith(staticRouteTargets['/wallet'] + '/')) ? 'is-active' : ''}
                aria-current={(path === staticRouteTargets['/wallet'] || path.startsWith(staticRouteTargets['/wallet'] + '/')) ? 'page' : undefined}
                leftSection={<span className="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>}
              >
                Ví xu
              </Menu.Item>
              {isWriter && (
                <Menu.Item
                  component={Link}
                  to={ownProfileHref}
                  className={ownAuthorProfile ? 'is-active' : ''}
                  aria-current={ownAuthorProfile ? 'page' : undefined}
                  leftSection={<span className="material-symbols-outlined" aria-hidden="true">edit_square</span>}
                >
                  Trang tác giả
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Label>Đọc truyện</Menu.Label>
              {readerCollections.map((item) => {
                const active = path === canonicalStaticPath(item.to);
                return (
                  <Menu.Item
                    key={item.to}
                    component={Link}
                    to={item.to}
                    className={active ? 'is-active' : ''}
                    aria-current={active ? 'page' : undefined}
                    leftSection={<span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>}
                  >
                    {item.label}
                  </Menu.Item>
                );
              })}
              <Menu.Divider />
              <Menu.Label>Khác</Menu.Label>
              <Menu.Item
                component={Link}
                to={navigationHref("/reader/connections")}
                className={path === staticRouteTargets['/reader/connections'] ? 'is-active' : ''}
                aria-current={path === staticRouteTargets['/reader/connections'] ? 'page' : undefined}
                leftSection={<span className="material-symbols-outlined" aria-hidden="true">group</span>}
              >
                Bạn bè
              </Menu.Item>
              <Menu.Item
                component={Link}
                to={navigationHref("/notifications")}
                className={path === staticRouteTargets['/notifications'] ? 'is-active' : ''}
                aria-current={path === staticRouteTargets['/notifications'] ? 'page' : undefined}
                leftSection={<span className="material-symbols-outlined" aria-hidden="true">notifications</span>}
              >
                Thông báo
              </Menu.Item>
              <Menu.Item
                component={Link}
                to={navigationHref("/appeals")}
                className={path === staticRouteTargets['/appeals'] ? 'is-active' : ''}
                aria-current={path === staticRouteTargets['/appeals'] ? 'page' : undefined}
                leftSection={<span className="material-symbols-outlined" aria-hidden="true">gavel</span>}
              >
                Quyết định &amp; khiếu nại
              </Menu.Item>
              <Menu.Item
                component={Link}
                to={navigationHref("/reader/feedback")}
                className={path === staticRouteTargets['/reader/feedback'] ? 'is-active' : ''}
                aria-current={path === staticRouteTargets['/reader/feedback'] ? 'page' : undefined}
                leftSection={<span className="material-symbols-outlined" aria-hidden="true">feedback</span>}
              >
                Góp ý đã gửi
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                onClick={() => void handleLogout()}
                data-testid="shell-logout-btn"
                leftSection={<span className="material-symbols-outlined" aria-hidden="true">logout</span>}
              >
                Đăng xuất
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>}
        </div>
      </div>
    </header>
  );
}

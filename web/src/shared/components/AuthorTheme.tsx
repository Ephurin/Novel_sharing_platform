import { FocusTrap, MantineProvider, createTheme, Menu } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { logout } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';
import '../../theme/storycraft.css';

const authorTheme = createTheme({
  primaryColor: 'orange',
  fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
  defaultRadius: 'md',
  headings: {
    fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
    sizes: {
      h1: { fontSize: '24px', lineHeight: '32px', fontWeight: '700' },
      h2: { fontSize: '18px', lineHeight: '26px', fontWeight: '600' },
      h3: { fontSize: '16px', lineHeight: '24px', fontWeight: '600' }
    }
  }
});

export function AuthorTheme({ children }: PropsWithChildren) {
  return <MantineProvider theme={authorTheme} forceColorScheme="light"><div className="sc-author-theme">{children}</div></MantineProvider>;
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

export function AuthorNavbar() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const novelId = params.novelId || searchParams.get('novelId') || localStorage.getItem('ephurin_author_novel_id');
  const writingUrl = novelId ? `/author/ide?novelId=${encodeURIComponent(novelId)}` : '/author';
  const name = user?.displayName || user?.username || 'Tài khoản';

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
        <Link to="/author" className="sc-brand" aria-label="StoryCraft — Bàn làm việc">
          <span className="material-symbols-outlined">menu_book</span>
          <span>StoryCraft</span><span className="sc-brand-edition">Văn Hoa</span>
        </Link>
        <nav className="sc-global-nav" aria-label="Điều hướng chính">
          <NavLink to="/author/projects" className={location.pathname.startsWith('/author') && location.pathname !== '/author/profile' ? 'sc-nav-link is-active' : 'sc-nav-link'}>Tác phẩm</NavLink>
          <NavLink to="/wallet" className="sc-nav-link">Ví &amp; doanh thu</NavLink>
          <NavLink to="/author/profile" className="sc-nav-link">Trang tác giả</NavLink>
        </nav>
        <div className="sc-navbar-actions">
          {location.pathname !== '/author/ide' && <Link to={writingUrl} className="sc-button sc-button-primary sc-continue"><span className="material-symbols-outlined">edit_note</span><span>Viết tiếp</span></Link>}
          <Link to="/notifications" className="sc-icon-button" aria-label="Thông báo"><span className="material-symbols-outlined">notifications</span></Link>
          <Menu position="bottom-end" withinPortal={false}>
            <Menu.Target>
              <button type="button" className="sc-avatar" aria-label={`Tài khoản ${name}`}>
                {user?.avatarUrl ? <img src={user.avatarUrl} alt={name} /> : name.slice(0, 1).toUpperCase()}
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{name}</Menu.Label>
              <Menu.Item component={Link} to="/profile/me">Hồ sơ &amp; cài đặt</Menu.Item>
              <Menu.Item component={Link} to="/author/profile">Trang tác giả</Menu.Item>
              <Menu.Item component={Link} to="/reader/library">Thư viện của tôi</Menu.Item>
              <Menu.Item component={Link} to="/reader/history">Lịch sử đọc</Menu.Item>
              <Menu.Divider />
              <Menu.Item onClick={() => void handleLogout()}>Đăng xuất</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
    </header>
  );
}

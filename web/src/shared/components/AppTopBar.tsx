import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../../features/auth/auth-api';
import type { UserRole } from '../../features/auth/auth-types';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { listNotifications } from '../../features/notifications/notification-api';
import { getWallet } from '../../features/wallet/wallet-api';

type NavItem = { key: string; label: string; to: string; autoActive?: boolean };

const navByRole: Record<UserRole, NavItem[]> = {
  AUTHOR: [
    { key: 'works', label: 'Tác phẩm', to: '/author' },
    { key: 'reading', label: 'Đọc truyện', to: '/reader' },
    { key: 'wallet', label: 'Ví & doanh thu', to: '/wallet' }
  ],
  READER: [
    { key: 'reader-home', label: 'Khám phá', to: '/reader' },
    { key: 'library', label: 'Thư viện', to: '/reader/library' },
    { key: 'history', label: 'Lịch sử đọc', to: '/reader/history' }
  ],
  ADMIN: [
    { key: 'admin', label: 'Tổng quan', to: '/admin' },
    { key: 'admin-novels', label: 'Truyện', to: '/admin/novels' },
    { key: 'admin-users', label: 'Người dùng', to: '/admin/users' },
    { key: 'admin-taxonomy', label: 'Danh mục', to: '/admin/taxonomy' },
    { key: 'admin-moderation', label: 'Kiểm duyệt', to: '/admin/moderation' },
    { key: 'admin-reports', label: 'Báo cáo', to: '/admin/reports' },
    { key: 'admin-withdraws', label: 'Rút tiền', to: '/admin/withdraws' }
  ]
};

const roleLabels: Record<UserRole, string> = { AUTHOR: 'Tác giả', READER: 'Độc giả', ADMIN: 'Quản trị' };

type MenuItem = { label: string; to: string; icon: string };

// Top bar = pages used every session for the role. Avatar menu = account pages and secondary shortcuts.
function getMenuItems(role: UserRole | undefined, userId: string | undefined): MenuItem[] {
  const items: MenuItem[] = [{ label: 'Hồ sơ & cài đặt', to: '/profile/me', icon: 'account_circle' }];
  if (role === 'AUTHOR' && userId) {
    items.push({ label: 'Trang tác giả công khai', to: `/authors/${userId}`, icon: 'badge' });
  }
  if (role === 'AUTHOR') {
    items.push(
      { label: 'Thư viện của tôi', to: '/reader/library', icon: 'collections_bookmark' },
      { label: 'Lịch sử đọc', to: '/reader/history', icon: 'history' }
    );
  }
  if (role === 'READER') items.push({ label: 'Ví xu', to: '/wallet', icon: 'account_balance_wallet' });
  return items;
}

function findActiveKey(items: NavItem[], pathname: string) {
  const matches = items.filter(
    (item) => item.autoActive !== false && (pathname === item.to || pathname.startsWith(`${item.to}/`))
  );
  matches.sort((left, right) => right.to.length - left.to.length);
  return matches[0]?.key;
}

export function AppTopBar({ active, onWrite }: { active?: string; onWrite?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = user ? navByRole[user.role] : [];
  const activeKey = active ?? findActiveKey(navItems, location.pathname);
  const canWrite = Boolean(onWrite) || user?.role === 'AUTHOR';
  const displayName = user?.displayName || user?.username || 'Tài khoản';
  const initial = (user?.username ?? 'A').charAt(0).toUpperCase();

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'UNREAD'],
    queryFn: () => listNotifications('UNREAD'),
    enabled: Boolean(user)
  });
  const hasUnread = (unreadQuery.data?.length ?? 0) > 0;

  // Readers spend coins on VIP chapters, so their balance stays visible; authors reach the wallet from the nav.
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet, enabled: user?.role === 'READER' });

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const continueWriting = () => {
    if (onWrite) {
      onWrite();
      return;
    }
    const novelId = localStorage.getItem('ephurin_author_novel_id');
    if (!novelId) {
      navigate('/author/ide');
      return;
    }
    const params = new URLSearchParams({ novelId });
    const chapterId = localStorage.getItem('ephurin_author_chapter_id');
    if (chapterId) params.set('chapterId', chapterId);
    navigate(`/author/ide?${params.toString()}`);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-[#faf9f6]/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-stone-200/80 font-body-md">
      <div className="h-14 max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4 lg:gap-6 min-w-0">
          <Link to="/" className="flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-outlined text-primary-600 text-[26px]">menu_book</span>
            <span className="font-headline-sm text-[17px] text-primary-600 tracking-tight font-bold">Ephurin</span>
            <span className="font-label-sm text-[11px] uppercase tracking-wider text-stone-500 bg-stone-100 border border-stone-200/80 px-1.5 py-0.5 rounded font-semibold">
              Reading
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 ml-2 min-w-0 overflow-x-auto">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={`px-3 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-colors ${
                  item.key === activeKey
                    ? 'text-primary-600 font-semibold bg-stone-100/90 border border-stone-200/60'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canWrite ? (
            <button
              onClick={continueWriting}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white font-label-md text-label-md hover:bg-primary-700 transition-colors font-medium cursor-pointer"
              data-path="viet-tiep"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">edit_note</span>
              <span>Viết tiếp</span>
            </button>
          ) : null}
          {user?.role === 'READER' ? (
            <Link
              to="/wallet"
              title="Ví xu"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-semibold hover:bg-amber-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px] text-amber-600">toll</span>
              <span>{(walletQuery.data?.coinsBalance ?? 0).toLocaleString('vi-VN')} xu</span>
            </Link>
          ) : null}
          <Link
            to="/notifications"
            aria-label="Thông báo"
            className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors relative"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            {hasUnread ? <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span> : null}
          </Link>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Menu tài khoản"
              data-testid="shell-avatar-btn"
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-shadow ${
                menuOpen ? 'ring-2 ring-primary-200' : 'hover:ring-2 hover:ring-stone-200'
              }`}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-semibold">
                  {initial}
                </span>
              )}
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 py-1.5 rounded-xl bg-white border border-stone-200 shadow-[0_12px_32px_rgba(28,25,23,0.10)]"
              >
                <div className="px-3.5 py-2.5 border-b border-stone-100 mb-1">
                  <p className="text-[13px] font-semibold text-stone-900 truncate">{displayName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-medium text-primary-700 bg-primary-50 border border-primary-200/70 px-1.5 py-px rounded-full">
                      {user ? roleLabels[user.role] : 'Khách'}
                    </span>
                    <span className="text-[12px] text-stone-500 truncate">{user?.email}</span>
                  </div>
                </div>
                {getMenuItems(user?.role, user?.userId).map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    role="menuitem"
                    className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[17px] text-stone-400">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
                <div className="my-1 border-t border-stone-100"></div>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="shell-logout-btn"
                  onClick={() => void handleLogout()}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">logout</span>
                  <span>Đăng xuất</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

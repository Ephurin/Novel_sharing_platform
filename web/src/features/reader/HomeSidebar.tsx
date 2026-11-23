import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import {
  listNotifications,
  notificationHref,
  notificationTypeLabel,
  type AppNotification,
} from '../notifications/notification-api';
import {
  listHistoryPage,
  listLibraryPage,
  listReadingBookmarkEntries,
  type ReaderNovel,
} from './reader-api';
import { HomeNovelCover } from './HomeNovelCover';

const count = (value = 0) => value.toLocaleString('vi-VN');

function relativeTime(date?: string | null) {
  if (!date) return '';
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (!Number.isFinite(elapsed)) return '';
  const format = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  if (elapsed < 60) return 'Vừa xong';
  if (elapsed < 3600) return format.format(-Math.floor(elapsed / 60), 'minute');
  if (elapsed < 86400) return format.format(-Math.floor(elapsed / 3600), 'hour');
  return format.format(-Math.floor(elapsed / 86400), 'day');
}

function activityIconName(type: string) {
  const upper = (type || '').toUpperCase();
  if (upper.includes('CHAPTER')) return 'menu_book';
  if (upper.includes('COMMENT') || upper.includes('REPLY')) return 'forum';
  if (upper.includes('FOLLOW') || upper.includes('DONATION') || upper.includes('LIKE')) return 'favorite';
  return 'notifications';
}

type RankTab = 'views' | 'recent' | 'likes';

export function HomeSidebar({
  catalogPath,
  viewsNovels,
  latestNovels,
  likesNovels,
  rankingLoading,
}: {
  catalogPath: string;
  viewsNovels: ReaderNovel[];
  latestNovels: ReaderNovel[];
  likesNovels: ReaderNovel[];
  rankingLoading: boolean;
}) {
  const user = useAuthStore(state => state.user);
  const [rankTab, setRankTab] = useState<RankTab>('views');
  const [avatarFailed, setAvatarFailed] = useState(false);

  const isReaderSide = Boolean(user && user.role !== 'ADMIN' && user.status === 'ACTIVE');
  const displayName = user?.displayName || user?.username || 'Bạn đọc';

  const libraryQuery = useQuery({
    queryKey: ['reader-home-sidebar-library', user?.userId],
    queryFn: () => listLibraryPage(1, 1),
    enabled: isReaderSide,
    staleTime: 30_000,
    retry: false,
  });

  const bookmarksQuery = useQuery({
    queryKey: ['reader-home-sidebar-bookmarks', user?.userId],
    queryFn: () => listReadingBookmarkEntries(undefined, 1),
    enabled: isReaderSide,
    staleTime: 30_000,
    retry: false,
  });

  const historyQuery = useQuery({
    queryKey: ['reader-home-history', user?.userId],
    queryFn: () => listHistoryPage(1, 10),
    enabled: isReaderSide,
    staleTime: 30_000,
    retry: false,
  });

  const notificationsQuery = useQuery({
    queryKey: ['reader-home-notifications', user?.userId],
    queryFn: () => listNotifications(undefined, 1),
    enabled: Boolean(user && user.status === 'ACTIVE'),
    staleTime: 30_000,
    retry: false,
  });

  const rawRankItems =
    rankTab === 'views'
      ? viewsNovels
      : rankTab === 'recent'
        ? latestNovels
        : likesNovels;

  const rankItems: ReaderNovel[] = [];
  const seenRankIds = new Set<string>();
  for (const novel of rawRankItems) {
    if (seenRankIds.has(novel.novelId)) continue;
    seenRankIds.add(novel.novelId);
    rankItems.push(novel);
    if (rankItems.length >= 7) break;
  }

  const notifications: AppNotification[] = (() => {
    const raw = notificationsQuery.data?.data ?? [];
    const seen = new Set<string>();
    const deduped: AppNotification[] = [];
    for (const item of raw) {
      if (seen.has(item.notificationId)) continue;
      seen.add(item.notificationId);
      deduped.push(item);
    }
    return deduped
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 6);
  })();

  return (
    <aside className="sc-home-rail" aria-label="Thông tin và bảng xếp hạng">
      {user ? (
        <section className="sc-home-panel sc-home-profile-card" aria-label="Hồ sơ cá nhân">
          <div className="sc-home-profile-banner" aria-hidden="true">
            <svg className="sc-home-profile-pattern" viewBox="0 0 280 88" fill="none">
              <circle cx="46" cy="26" r="5" stroke="currentColor" strokeWidth="1.5" opacity=".55" />
              <path d="M110 18l2.2 6.8L119 27l-6.8 2.2L110 36l-2.2-6.8L101 27l6.8-2.2L110 18Z" stroke="currentColor" strokeWidth="1.4" opacity=".5" />
              <path d="M174 21c-2.2-2.2-5.4-1.4-7 1-1.6-2.4-4.8-3.2-7-1-3.8 3.8.8 8.2 7 13 6.2-4.8 10.8-9.2 7-13Z" stroke="currentColor" strokeWidth="1.4" opacity=".48" />
              <circle cx="234" cy="28" r="6" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
            </svg>
          </div>
          <Link to="/profile/me" className="sc-home-profile-avatar" aria-label={`Hồ sơ của ${displayName}`}>
            {user.avatarUrl && !avatarFailed ? (
              <img src={user.avatarUrl} alt={displayName} onError={() => setAvatarFailed(true)} />
            ) : (
              <span className="material-symbols-outlined" aria-hidden="true">person</span>
            )}
          </Link>
          <p className="sc-home-profile-welcome">Chào mừng trở lại,</p>
          <h3 className="sc-home-profile-name">
            <Link to="/profile/me">{displayName}</Link>
            <svg className="sc-home-profile-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="m12 2 2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1L12 2Z" />
            </svg>
          </h3>

          {isReaderSide ? (
            <div className="sc-home-profile-stats">
              <Link to="/reader/library" className="sc-home-profile-stat">
                <strong>{libraryQuery.isPending ? '–' : count(libraryQuery.data?.totalItems ?? 0)}</strong>
                <span>Đang theo dõi</span>
              </Link>
              <Link to="/reader/bookmarks" className="sc-home-profile-stat">
                <strong>{bookmarksQuery.isPending ? '–' : count(bookmarksQuery.data?.totalItems ?? 0)}</strong>
                <span>Bookmark</span>
              </Link>
              <Link to="/reader/history" className="sc-home-profile-stat">
                <strong>{historyQuery.isPending ? '–' : count(historyQuery.data?.totalItems ?? 0)}</strong>
                <span>Lịch sử đọc</span>
              </Link>
            </div>
          ) : (
            <div className="sc-home-profile-admin-foot">
              <Link to="/admin" className="sc-home-sec-link">Mở trang quản trị →</Link>
            </div>
          )}
        </section>
      ) : (
        <section className="sc-home-panel sc-home-guest-card" aria-label="Chào mừng khách đọc">
          <div className="sc-home-guest-icon" aria-hidden="true">
            <span className="material-symbols-outlined">menu_book</span>
          </div>
          <h3>Chào mừng đến StoryCraft</h3>
          <p>Đọc truyện công khai, khám phá tác giả và tìm câu chuyện dành cho bạn.</p>
          <Link to="/login" className="sc-home-pill-btn sc-home-pill-primary">
            Đăng nhập / Tạo tài khoản
          </Link>
        </section>
      )}

      <section className="sc-home-panel sc-home-rail-section" aria-label="Bảng xếp hạng truyện">
        <div className="sc-home-sec-head">
          <div className="sc-home-sec-left">
            <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">emoji_events</span>
            <h2>Bảng xếp hạng truyện</h2>
          </div>
        </div>
        <div className="sc-home-rank-tabs" role="tablist" aria-label="Tiêu chí xếp hạng">
          {([
            ['views', 'Truyện hot'],
            ['recent', 'Mới cập nhật'],
            ['likes', 'Yêu thích'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={rankTab === key}
              className={`sc-home-tab${rankTab === key ? ' is-active' : ''}`}
              onClick={() => setRankTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {rankingLoading && rankItems.length === 0 ? (
          <div className="sc-home-rank-list" aria-busy="true" aria-label="Đang tải bảng xếp hạng">
            {Array.from({ length: 7 }, (_, idx) => (
              <div key={idx} className="sc-home-rank-row is-skeleton" aria-hidden="true">
                <span className="sc-skeleton-block" style={{ width: 16, height: 16 }} />
                <span className="sc-skeleton-block sc-home-rank-thumb" />
                <div className="sc-home-rank-copy">
                  <span className="sc-skeleton-block" style={{ width: '85%', height: 12 }} />
                  <span className="sc-skeleton-block" style={{ width: '60%', height: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ) : rankItems.length === 0 ? (
          <p className="sc-home-rail-empty">Chưa có truyện trong bảng xếp hạng.</p>
        ) : (
          <ol className="sc-home-rank-list">
            {rankItems.map((novel, index) => (
              <li key={novel.novelId}>
                <Link className="sc-home-rank-row" to={`${catalogPath}/novels/${novel.novelId}`}>
                  <span className={`sc-home-rank-num${index < 3 ? ` is-top-${index + 1}` : ''}`}>
                    {index + 1}
                  </span>
                  <span className="sc-home-rank-thumb">
                    <HomeNovelCover novel={novel} size="thumb" />
                  </span>
                  <span className="sc-home-rank-copy">
                    <strong title={novel.title}>{novel.title}</strong>
                    <small>
                      {rankTab === 'likes' && (novel.likesCount ?? 0) > 0
                        ? `${count(novel.likesCount)} lượt thích · ${count(novel.chaptersCount)} chương`
                        : `${count(novel.viewsCount)} lượt đọc · ${count(novel.chaptersCount)} chương`}
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {user && (
        <section className="sc-home-panel sc-home-rail-section" aria-label="Hoạt động gần đây">
          <div className="sc-home-sec-head">
            <div className="sc-home-sec-left">
              <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">notifications</span>
              <h2>Hoạt động gần đây</h2>
            </div>
            <Link className="sc-home-sec-link" to="/notifications">Tất cả →</Link>
          </div>

          {notificationsQuery.isPending ? (
            <div className="sc-home-activity-list" aria-busy="true">
              {Array.from({ length: 4 }, (_, idx) => (
                <div key={idx} className="sc-home-activity-row is-skeleton" aria-hidden="true">
                  <span className="sc-skeleton-block sc-home-activity-icon" />
                  <div className="sc-home-activity-copy">
                    <span className="sc-skeleton-block" style={{ width: '90%', height: 12 }} />
                    <span className="sc-skeleton-block" style={{ width: '55%', height: 10 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : notificationsQuery.isError ? (
            <div className="sc-home-inline-notice">
              <span>Chưa tải được hoạt động gần đây.</span>
              <button type="button" onClick={() => void notificationsQuery.refetch()}>Thử lại</button>
            </div>
          ) : notifications.length === 0 ? (
            <p className="sc-home-rail-empty">Chưa có hoạt động mới gần đây.</p>
          ) : (
            <div className="sc-home-activity-list">
              {notifications.map(item => {
                const target = notificationHref(item, user.role === 'READER') ?? '/notifications';
                const meta = [notificationTypeLabel(item.type), relativeTime(item.createdAt)].filter(Boolean).join(' · ');
                return (
                  <Link key={item.notificationId} className="sc-home-activity-row" to={target}>
                    <span className="sc-home-activity-icon" aria-hidden="true">
                      <span className="material-symbols-outlined">{activityIconName(item.type)}</span>
                    </span>
                    <span className="sc-home-activity-copy">
                      <strong>{item.title}</strong>
                      {item.content && <span className="sc-home-activity-desc">{item.content}</span>}
                      <small>{meta}</small>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
    </aside>
  );
}

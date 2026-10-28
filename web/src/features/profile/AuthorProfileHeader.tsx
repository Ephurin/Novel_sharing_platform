import { Avatar } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { AuthorProfile } from './profile-api';

type AuthorProfileHeaderProps = {
  author: AuthorProfile;
  isOwnProfile: boolean;
  isGuest: boolean;
  canInteract: boolean;
  followingPending: boolean;
  onFollow: () => void;
  onSupport: () => void;
  onShare: () => void;
};

// Reader-facing author identity: banner, overlapping avatar, actions and one stats strip.
export function AuthorProfileHeader({ author, isOwnProfile, isGuest, canInteract, followingPending, onFollow, onSupport, onShare }: AuthorProfileHeaderProps) {
  const name = author.displayName || author.username;
  const publishedChapters = author.novels.reduce((total, novel) => total + (novel.chaptersCount ?? 0), 0);
  const stats = [
    { label: 'Người theo dõi', value: author.followersCount },
    { label: 'Tổng lượt đọc', value: author.totalViews },
    { label: 'Tác phẩm công khai', value: author.novels.length },
    { label: 'Từ đã xuất bản', value: author.totalWords }
  ];

  return (
    <section className="sc-profile-hero bg-surface-container-lowest rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden" aria-label="Hồ sơ tác giả">
      <div className="sc-profile-banner">
        {author.bannerUrl && (
          <img
            src={author.bannerUrl}
            alt="Ảnh bìa tác giả"
            onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
            onLoad={(event) => { event.currentTarget.style.visibility = 'visible'; }}
          />
        )}
      </div>

      <div className="px-5 sm:px-6 pb-5">
        <div className="sc-profile-heading">
          <Avatar className="sc-profile-avatar" src={author.avatarUrl} alt={name} size={112} radius="50%">
            {name.slice(0, 1).toUpperCase()}
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-page-title text-stone-900 break-words">{name}</h1>
            <p className="text-meta text-stone-500">@{author.username}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isOwnProfile ? (
              <Link to="/profile/me" className="sc-button sc-button-primary">
                <span className="material-symbols-outlined" aria-hidden="true">edit</span>Chỉnh sửa hồ sơ
              </Link>
            ) : isGuest ? (
              <Link to="/login" className="sc-button sc-button-primary" data-testid="author-profile-login-cta">
                <span className="material-symbols-outlined" aria-hidden="true">login</span>Đăng nhập để theo dõi
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onFollow}
                  disabled={!canInteract || followingPending}
                  aria-pressed={author.isFollowing}
                  aria-busy={followingPending}
                  className={`sc-button ${author.isFollowing ? 'sc-button-soft' : 'sc-button-primary'}`}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">{author.isFollowing ? 'check' : 'add'}</span>
                  {author.isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
                </button>
                <button type="button" onClick={onSupport} disabled={!canInteract} className="sc-button sc-button-support">
                  <span className="material-symbols-outlined" aria-hidden="true">volunteer_activism</span>Ủng hộ tác giả
                </button>
              </>
            )}
            <button type="button" onClick={onShare} className="sc-button sc-button-icon" aria-label="Chia sẻ hồ sơ" title="Chia sẻ hồ sơ">
              <span className="material-symbols-outlined" aria-hidden="true">share</span>
            </button>
          </div>
        </div>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-meta text-stone-500" aria-label="Thông tin tác giả">
          {author.joinedAt && (
            <li className="inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">calendar_today</span>
              Tham gia{' '}
              <time dateTime={author.joinedAt} title={new Date(author.joinedAt).toLocaleDateString('vi-VN')}>
                {new Date(author.joinedAt).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' })}
              </time>
            </li>
          )}
          <li className="inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">library_books</span>
            {publishedChapters.toLocaleString('vi-VN')} chương đã xuất bản
          </li>
        </ul>

        <dl className="sc-profile-stats" aria-label="Thống kê tác giả">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value.toLocaleString('vi-VN')}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

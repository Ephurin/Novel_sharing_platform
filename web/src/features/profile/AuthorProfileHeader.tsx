import { Avatar } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { AuthorProfile } from './profile-api';

type AuthorProfileHeaderProps = {
  author: AuthorProfile;
  isOwnProfile: boolean;
  canInteract: boolean;
  followingPending: boolean;
  onFollow: () => void;
  onSupport: () => void;
  onShare: () => void;
};

export function AuthorProfileHeader({ author, isOwnProfile, canInteract, followingPending, onFollow, onSupport, onShare }: AuthorProfileHeaderProps) {
  const name = author.displayName || author.username;
  return (
    <section className="sc-author-profile-card" aria-label="Hồ sơ tác giả">
      <div className={`sc-author-profile-banner ${author.bannerUrl ? 'has-image' : ''}`}>
        {author.bannerUrl && <img src={author.bannerUrl} alt="Ảnh bìa tác giả" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} onLoad={event => { event.currentTarget.style.visibility = 'visible'; }} />}
      </div>
      <div className="sc-author-profile-body">
        <div className="sc-author-profile-heading">
          <Avatar className="sc-author-profile-avatar" src={author.avatarUrl} alt={name} size={104} radius="50%">{name.slice(0,1).toUpperCase()}</Avatar>
          <div className="sc-author-profile-identity">
            <h1 className="text-page-title">{name}</h1>
            <p className="text-meta sc-author-profile-handle">
              <span>@{author.username}</span>
              {author.joinedAt && <span>Tham gia <time dateTime={author.joinedAt} title={new Date(author.joinedAt).toLocaleDateString('vi-VN')}>{new Date(author.joinedAt).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' })}</time></span>}
            </p>
          </div>
          <div className="sc-author-profile-actions">
            {isOwnProfile ? (
              <Link to="/profile/me" className="sc-button sc-button-primary"><span className="material-symbols-outlined" aria-hidden="true">edit</span>Chỉnh sửa hồ sơ</Link>
            ) : (
              <>
                <button type="button" onClick={onFollow} disabled={!canInteract || followingPending} aria-pressed={author.isFollowing} aria-busy={followingPending}
                  className={`sc-button ${author.isFollowing ? 'sc-author-profile-following' : 'sc-button-primary'}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">{author.isFollowing ? 'check' : 'add'}</span>
                  {author.isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
                </button>
                <button type="button" onClick={onSupport} disabled={!canInteract} className="sc-button sc-author-profile-support">
                  <span className="material-symbols-outlined" aria-hidden="true">volunteer_activism</span>Ủng hộ tác giả
                </button>
              </>
            )}
            <button type="button" onClick={onShare} className="sc-icon-button sc-author-profile-share" aria-label="Chia sẻ hồ sơ" title="Chia sẻ hồ sơ">
              <span className="material-symbols-outlined" aria-hidden="true">share</span>
            </button>
          </div>
        </div>
        {author.bio && <p className="text-body sc-author-profile-bio">{author.bio}</p>}
        {author.publishingSchedule && <p className="text-meta sc-author-profile-schedule"><span className="material-symbols-outlined" aria-hidden="true">calendar_month</span><span>Lịch đăng dự kiến: {author.publishingSchedule}</span></p>}
        <ul className="sc-author-profile-stats text-body" aria-label="Thống kê tác giả">
          <li><strong>{author.followersCount.toLocaleString('vi-VN')}</strong> người theo dõi</li>
          <li><strong>{author.totalViews.toLocaleString('vi-VN')}</strong> lượt đọc</li>
          <li><strong>{author.novels.length.toLocaleString('vi-VN')}</strong> tác phẩm</li>
          <li><strong>{author.totalWords.toLocaleString('vi-VN')}</strong> từ đã xuất bản</li>
        </ul>
      </div>
    </section>
  );
}

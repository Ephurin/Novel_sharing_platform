import { ImageLightbox } from '../../shared/components/InteractionWidgets';
import { LoadedImage } from '../../shared/components/AuthorAdminMotion';
import { AnimatedDisclosure } from '../../shared/components/AnimatedDisclosure';
import { useToast } from '../../shared/components/ToastProvider';
import { AnimatedSaveButton } from '../../shared/components/SaveFeedback';
import { Switch } from '@mantine/core';
import { AuthorProfileHeader } from './AuthorProfileHeader';
import { ImageUpload } from '../../shared/components/ImageUpload';
import { becomeAuthor } from '../auth/auth-api';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import NumberFlow from '@number-flow/react';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import React, { useEffect, useId, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthorProfile, getMyProfile, getMySettings, updateMyProfile, updateMySettings } from './profile-api';
import { useAuthStore } from '../auth/useAuthStore';
import { getWallet, donateToAuthor } from '../wallet/wallet-api';
import { followAuthor, unfollowAuthor } from '../reader/reader-api';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';
import type { AuthorProfile } from './profile-api';

type WorkSort = 'views' | 'likes' | 'chapters';
const workSortOptions: Array<{ value: WorkSort; label: string }> = [
  { value: 'views', label: 'Phổ biến nhất' },
  { value: 'likes', label: 'Yêu thích nhất' },
  { value: 'chapters', label: 'Nhiều chương' }
];
const serialStatusLabels: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: 'Hoàn thành', className: 'bg-emerald-50 text-emerald-700' },
  HIATUS: { label: 'Tạm ngưng', className: 'bg-amber-50 text-amber-700' },
  ONGOING: { label: 'Đang ra', className: 'bg-primary-50 text-primary-700' }
};

const BIO_CLAMP_LENGTH = 240;

function AuthorWorkCard({ novel, publicMode }: { novel: AuthorProfile['novels'][number]; publicMode: boolean }) {
  const status = serialStatusLabels[novel.serialStatus ?? ''] ?? serialStatusLabels.ONGOING;
  const detailPath = `${publicMode ? '/public' : '/reader'}/novels/${novel.novelId}`;
  return (
    <article className="sc-novel-card relative bg-surface-container-lowest rounded-xl border border-stone-200/90 hover:border-primary-600/40 transition-all flex flex-col justify-between gap-3 group">
      <div className="flex gap-3 items-start">
        <div className="sc-cover-hover relative w-[76px] shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-cover-fallback border border-stone-200/70">
          {novel.coverImageUrl ? (
            <LoadedImage alt={novel.title} src={novel.coverImageUrl} className="w-full h-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center p-2 text-center text-meta text-white">{novel.title}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-meta font-medium text-stone-500 truncate">{novel.genre || 'Chưa phân loại'}</span>
            <span className={`shrink-0 inline-flex items-center rounded-full ${status.className}`}>{status.label}</span>
          </div>
          <Link to={detailPath} className="text-body font-bold text-stone-900 line-clamp-2 leading-snug group-hover:text-primary-600 transition-colors after:absolute after:inset-0 after:rounded-xl" title={novel.title}>
            {novel.title}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-stone-500">
            <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[15px] text-primary-600" aria-hidden="true">menu_book</span><strong className="text-stone-800">{(novel.chaptersCount ?? 0).toLocaleString('vi-VN')}</strong> chương</span>
            <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[15px]" aria-hidden="true">visibility</span><strong className="text-stone-800">{(novel.viewsCount ?? 0).toLocaleString('vi-VN')}</strong></span>
            <span className="inline-flex items-center gap-1 text-red-700"><span className="material-symbols-outlined text-[15px]" aria-hidden="true">favorite</span><strong>{(novel.likesCount ?? 0).toLocaleString('vi-VN')}</strong></span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function AuthorProfilePage() {
  const { authorId = '' } = useParams();
  const currentUser = useAuthStore((state) => state.user);
  const targetAuthorId = authorId || currentUser?.userId || '';

  const authorQuery = useQuery({
    queryKey: ['author-profile', targetAuthorId, currentUser?.userId ?? 'guest'],
    queryFn: () => getAuthorProfile(targetAuthorId),
    enabled: Boolean(targetAuthorId)
  });

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWallet,
    enabled: Boolean(currentUser)
  });

  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportAmount, setSupportAmount] = useState(20);
  const [supportMessage, setSupportMessage] = useState('');
  const [bioExpanded, setBioExpanded] = useState(false);
  const { showToast: notify } = useToast();
  const [workSort, setWorkSort] = useState<WorkSort>('views');
  const reduce = useReducedMotion();
  const sortGroupId = useId();
  const supportGroupId = useId();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBioExpanded(false);
  }, [targetAuthorId]);

  const showToast = (msg: string, isError = false) => notify(msg, isError ? 'error' : 'success');

  const followMutation = useMutation({
    mutationFn: () => (authorQuery.data?.isFollowing ? unfollowAuthor(targetAuthorId) : followAuthor(targetAuthorId)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['author-profile', targetAuthorId] });
    },
    onError: (error) => showToast(getApiErrorMessage(error), true)
  });
  const supportMutation = useMutation({
    mutationFn: () => donateToAuthor(targetAuthorId, supportAmount, supportMessage.trim() || undefined),
    onSuccess: async () => {
      setSupportModalOpen(false);
      setSupportMessage('');
      await queryClient.invalidateQueries({ queryKey: ['wallet'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-earnings'] });
      showToast('Ủng hộ tác giả thành công.');
    },
    onError: (error) => showToast(getApiErrorMessage(error), true)
  });

  const author = authorQuery.data;
  const authorName = author?.displayName || author?.username || '';
  const authorUsername = author?.username || '';
  const authorAvatar = author?.avatarUrl;
  const availableCoins = walletQuery.data?.coinsBalance ?? 0;
  const displayNovels = author?.novels ?? [];
  const sortedNovels = [...displayNovels].sort((left, right) => {
    if (workSort === 'likes') return (right.likesCount ?? 0) - (left.likesCount ?? 0);
    if (workSort === 'chapters') return (right.chaptersCount ?? 0) - (left.chaptersCount ?? 0);
    return (right.viewsCount ?? 0) - (left.viewsCount ?? 0);
  });
  const authorGenres = [...new Set(displayNovels.map((novel) => novel.genre).filter((genre): genre is string => Boolean(genre)))];
  const isOwnProfile = Boolean(currentUser?.userId && currentUser.userId === targetAuthorId);
  const isGuest = !currentUser;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(new URL(`/authors/${targetAuthorId}`, window.location.origin).href);
      showToast(`Đã sao chép liên kết hồ sơ tác giả ${authorName}!`);
    } catch {
      showToast('Không sao chép được liên kết. Vui lòng thử lại.', true);
    }
  };

  if (!targetAuthorId) return <ErrorState error={new Error('Cần đăng nhập hoặc chọn tác giả để xem hồ sơ.')} />;
  if (authorQuery.isLoading) return <LoadingState label="Đang tải hồ sơ tác giả..." />;
  if (authorQuery.isError) return <ErrorState error={authorQuery.error} onRetry={() => void authorQuery.refetch()} />;
  if (!author) return <LoadingState label="Đang tải hồ sơ tác giả…" />;

  const bioText = author.bio?.trim() ?? '';
  const isBioLong = bioText.length > BIO_CLAMP_LENGTH;
  const displayedBio = !isBioLong || bioExpanded ? bioText : `${bioText.slice(0, BIO_CLAMP_LENGTH).trimEnd()}…`;
  const hasSchedule = Boolean(author.publishingSchedule?.trim());

  return (
    <div className="min-h-screen flex flex-col bg-surface text-stone-800 antialiased selection:bg-primary-100 selection:text-primary-900">
      <AuthorNavbar />

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-6 flex-1">
        <AuthorProfileHeader
          author={author}
          isOwnProfile={isOwnProfile}
          isGuest={isGuest}
          canInteract={currentUser?.status === 'ACTIVE'}
          followingPending={followMutation.isPending}
          onFollow={() => followMutation.mutate()}
          onSupport={() => setSupportModalOpen(true)}
          onShare={() => void handleShare()}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
          {/* Works */}
          <section className="bg-surface-container-lowest rounded-xl border border-stone-200/80 shadow-2xs p-4 sm:p-5" aria-labelledby="author-works-heading">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 id="author-works-heading" className="text-section-title text-stone-900">
                Tác phẩm của {authorName}
              </h2>
              {displayNovels.length > 1 && (
                <LayoutGroup id={sortGroupId}>
                  <div className="sc-filter-tabs flex items-center bg-stone-100 p-0.5 rounded-lg text-meta font-medium" role="group" aria-label="Sắp xếp tác phẩm">
                    {workSortOptions.map((option) => {
                      const active = workSort === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setWorkSort(option.value)}
                          aria-pressed={active}
                          className={`relative z-10 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                            active ? 'text-on-primary font-semibold' : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="author-profile-work-sort-pill"
                              aria-hidden="true"
                              className="absolute inset-0 -z-10 rounded-md bg-primary-600 shadow-xs"
                              transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                            />
                          )}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </LayoutGroup>
              )}
            </div>

            {displayNovels.length === 0 ? (
              <p className="text-body text-stone-500 py-8 text-center">Tác giả chưa có tác phẩm đã xuất bản.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                {sortedNovels.map((novel) => (
                  <AuthorWorkCard key={novel.novelId} novel={novel} publicMode={isGuest} />
                ))}
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="flex flex-col gap-4">
            <section className="bg-surface-container-lowest rounded-xl border border-stone-200/80 shadow-2xs p-4 sm:p-5" aria-labelledby="author-about-heading">
              <h2 id="author-about-heading" className="text-card-title text-stone-900 flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary-600" aria-hidden="true">badge</span>Về tác giả
              </h2>
              {bioText ? (
                <div>
                  <p id="author-profile-bio-text" className="text-body text-stone-600 whitespace-pre-wrap break-words">
                    {displayedBio}
                  </p>
                  {isBioLong && (
                    <button
                      type="button"
                      aria-expanded={bioExpanded}
                      aria-controls="author-profile-bio-text"
                      onClick={() => setBioExpanded((prev) => !prev)}
                      className="mt-1.5 text-meta font-semibold text-primary-600 hover:underline cursor-pointer"
                    >
                      {bioExpanded ? 'Thu gọn' : 'Xem thêm'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-body text-stone-500">Tác giả chưa viết lời giới thiệu.</p>
              )}
              {authorGenres.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-meta font-semibold text-stone-500 mb-2">Thể loại sáng tác</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {authorGenres.map((genre) => (
                      <span key={genre} className="sc-genre-tag">{genre}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {hasSchedule && (
              <section className="bg-surface-container-lowest rounded-xl border border-stone-200/80 shadow-2xs p-4 sm:p-5" aria-labelledby="author-schedule-heading">
                <h2 id="author-schedule-heading" className="text-card-title text-stone-900 flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary-600" aria-hidden="true">calendar_month</span>Lịch ra chương dự kiến
                </h2>
                <p className="rounded-lg bg-primary-50 px-3 py-2.5 text-body font-semibold text-stone-800 whitespace-pre-wrap break-words">
                  {author.publishingSchedule}
                </p>
                <p className="text-meta text-stone-500 mt-2">
                  Lịch có thể thay đổi tùy tiến độ của tác giả.
                </p>
              </section>
            )}
          </aside>
        </div>
      </main>

      <footer className="sc-author-profile-footer text-meta">
        <span>© {new Date().getFullYear()} StoryCraft Văn Hoa</span>
        <Link to={isGuest ? '/public' : '/reader'}>Khám phá tác phẩm</Link>
      </footer>

      {/* Support Author Modal */}
      <AnimatedModal
        opened={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
        title={`Ủng hộ tác giả ${authorName}`}
        size="md"
        centered
      >
        <div className="flex items-center gap-3 my-3 p-2.5 rounded-xl bg-stone-50 border border-stone-200/70">
          {authorAvatar ? (
            <img alt={authorName} src={authorAvatar} className="w-9 h-9 rounded-full object-cover border border-[var(--sc-surface)] shadow-xs" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center font-bold">
              {authorName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="text-meta">
            <span className="font-bold text-stone-900 block">{authorName}</span>
            <span className="text-stone-500 text-meta">@{authorUsername}</span>
          </div>
        </div>

        <div className="space-y-3 text-meta">
          <span id="support-preset-label" className="font-semibold text-stone-700 block">
            Chọn mức ủng hộ (Xu Văn Hoa):
          </span>
          <LayoutGroup id={supportGroupId}>
            <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="support-preset-label">
              {[10, 20, 50, 100].map((amt) => {
                const active = supportAmount === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSupportAmount(amt)}
                    className={`relative z-10 py-1.5 rounded-lg border font-semibold text-center transition-colors ${
                      active
                        ? 'border-transparent font-bold text-primary-600'
                        : 'border-stone-200 hover:border-primary-600 hover:text-primary-600 bg-surface-container-lowest'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="author-support-amount-pill"
                        aria-hidden="true"
                        className="absolute inset-0 -z-10 rounded-lg border border-primary-600 bg-primary-50/80"
                        transition={reduce ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                    {amt} Xu
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          <div>
            <label htmlFor="support-custom-amount" className="text-meta text-stone-500 block mb-1">
              Hoặc số lượng tùy chỉnh:
            </label>
            <div className="relative">
              <input
                id="support-custom-amount"
                type="number"
                min={1}
                max={availableCoins}
                value={supportAmount}
                onChange={(e) => setSupportAmount(Number(e.target.value) || 0)}
                className="w-full text-meta font-semibold rounded-lg border border-stone-200 focus:border-primary-600 focus:ring-1 focus:ring-primary-600 py-1.5 px-3 pr-10 text-stone-800 outline-none"
              />
              <span className="absolute right-3 top-2 text-meta font-semibold text-stone-400">Xu</span>
            </div>
          </div>

          <div>
            <label htmlFor="support-message" className="text-meta text-stone-500 block mb-1">
              Lời nhắn gửi đến {authorName} (không bắt buộc):
            </label>
            <textarea
              id="support-message"
              rows={2}
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder={`Cảm ơn tác giả ${authorName} vì những trang viết đẹp!`}
              className="w-full text-meta rounded-lg border border-stone-200 focus:border-primary-600 focus:ring-1 focus:ring-primary-600 py-1.5 px-3 placeholder-stone-400 text-stone-800 outline-none"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60 text-meta text-stone-600">
            <div className="flex flex-col gap-0.5">
              <span>
                Số dư khả dụng:{' '}
                <strong>
                  {walletQuery.isLoading
                    ? 'Đang tải...'
                    : walletQuery.isError
                      ? 'Không tải được'
                      : `${availableCoins.toLocaleString('vi-VN')} Xu`}
                </strong>
              </span>
              {!walletQuery.isLoading && !walletQuery.isError && (
                <span className="text-stone-500">
                  Dự kiến sau ủng hộ:{' '}
                  <strong className="text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <NumberFlow
                      value={Math.max(0, availableCoins - (Number.isFinite(supportAmount) ? supportAmount : 0))}
                      locales="vi-VN"
                      animated={!reduce}
                    />{' '}
                    Xu
                  </strong>
                </span>
              )}
            </div>
            <Link to="/wallet" className="text-primary-600 font-semibold hover:underline">
              Nạp Xu
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-stone-100 text-meta">
          <button
            type="button"
            onClick={() => setSupportModalOpen(false)}
            className="px-3.5 py-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 font-medium transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={walletQuery.isLoading || walletQuery.isError || supportAmount <= 0 || supportAmount > availableCoins || supportMutation.isPending}
            onClick={() => supportMutation.mutate()}
            className="px-4 py-1.5 rounded-lg bg-primary-600 text-on-primary hover:bg-primary-700 font-semibold shadow-xs transition-all disabled:opacity-50"
          >
            {supportMutation.isPending ? 'Đang gửi...' : 'Xác nhận ủng hộ'}
          </button>
        </div>
      </AnimatedModal>
    </div>
  );
}

// -------------------------------------------------------------
// My Profile Page (Manage account & settings)
// -------------------------------------------------------------
export function MyProfilePage() {
  const navigate = useNavigate();
  const account = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const queryClient = useQueryClient();
  const onboarding = useMutation({
    mutationFn: becomeAuthor,
    onSuccess: (session) => {
      setSession(session);
      queryClient.clear();
      navigate('/author/projects');
    }
  });
  const profileQuery = useQuery({ queryKey: ['profile', 'me'], queryFn: getMyProfile });
  const settingsQuery = useQuery({ queryKey: ['settings', 'me'], queryFn: getMySettings });

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [publishingSchedule, setPublishingSchedule] = useState('');
  const [language, setLanguage] = useState('vi');
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const { showToast } = useToast();
  const isAuthorOrAdmin = account?.role === 'AUTHOR' || account?.role === 'ADMIN';

  React.useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName ?? '');
      setAvatarUrl(profileQuery.data.avatarUrl ?? '');
      setBio(profileQuery.data.bio ?? '');
      setBannerUrl(profileQuery.data.bannerUrl ?? '');
      setPublishingSchedule(profileQuery.data.publishingSchedule ?? '');
    }
  }, [profileQuery.data]);

  React.useEffect(() => {
    if (settingsQuery.data) {
      setLanguage('vi');
      setNotificationEnabled(settingsQuery.data.notificationEnabled);
    }
  }, [settingsQuery.data]);

  const profileMutation = useMutation({
    mutationFn: () =>
      updateMyProfile({
        displayName: displayName || undefined,
        avatarUrl: avatarUrl || null,
        bio: bio || null,
        bannerUrl: bannerUrl.trim() || null,
        publishingSchedule: publishingSchedule.trim() || null
      }),
    onSuccess: (profile) => {
      if (account) useAuthStore.getState().setUser({ ...account, displayName: profile.displayName, avatarUrl: profile.avatarUrl });
      void queryClient.invalidateQueries({ queryKey: ['author-profile'] });
      showToast('Đã lưu hồ sơ thành công!', 'success');
      void queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
    onError: (error) => showToast(getApiErrorMessage(error), 'error')
  });

  const settingsMutation = useMutation({
    mutationFn: () => updateMySettings({ language, notificationEnabled }),
    onSuccess: () => {
      showToast('Đã cập nhật cài đặt thành công!', 'success');
      void queryClient.invalidateQueries({ queryKey: ['settings', 'me'] });
    },
    onError: (error) => showToast(getApiErrorMessage(error), 'error')
  });

  if (profileQuery.isLoading || settingsQuery.isLoading) return <LoadingState label="Đang tải thông tin cá nhân..." />;
  if (profileQuery.isError) return <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />;

  const inputClassName =
    'w-full text-body rounded-lg border border-[var(--sc-control-border)] bg-[var(--sc-surface-subtle)] text-[var(--sc-text)] focus:border-primary-600 focus:ring-1 focus:ring-primary-600 py-2 px-3 outline-none';

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6 text-on-surface">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-page-title font-bold text-on-surface">Hồ sơ của tôi</h1>
        {isAuthorOrAdmin && (
          <Link
            to="/author/profile"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-meta font-semibold bg-primary-600 text-on-primary hover:bg-primary-700 transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">visibility</span>
            <span>Xem trang tác giả</span>
          </Link>
        )}
      </div>

      {account?.role === 'READER' && (
        <div className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface)] p-5 space-y-2">
          <h2 className="text-section-title text-on-surface">Bắt đầu sáng tác</h2>
          <p className="text-body text-on-surface-variant">Tạo tác phẩm và quản lý bản thảo trong không gian tác giả.</p>
          <button
            type="button"
            className="sc-button sc-button-primary"
            disabled={onboarding.isPending}
            onClick={() => onboarding.mutate()}
          >
            {onboarding.isPending ? 'Đang đăng ký…' : 'Trở thành tác giả'}
          </button>
          {onboarding.isError && <p role="alert" className="text-body text-danger">{getApiErrorMessage(onboarding.error)}</p>}
        </div>
      )}

      {/* Profile Card & Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        {/* Card 1: Thông tin hiển thị */}
        <div className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface)] p-5 shadow-xs space-y-4">
          <h2 className="font-serif font-bold text-card-title text-on-surface pb-2 border-b border-[var(--sc-border)] flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-600 text-[18px]" aria-hidden="true">person</span>
            Thông tin hiển thị
          </h2>

          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full border-2 border-primary-100 bg-primary-50 overflow-hidden flex items-center justify-center shrink-0">
              {avatarUrl ? (
                <ImageLightbox src={avatarUrl} alt="Ảnh đại diện" className="sc-image-preview-fill">
                  {isAuthorOrAdmin ? (
                    <LoadedImage src={avatarUrl} alt="Ảnh đại diện" className="w-full h-full object-cover" />
                  ) : (
                    <img src={avatarUrl} alt="Ảnh đại diện" className="w-full h-full object-cover" />
                  )}
                </ImageLightbox>
              ) : (
                <span className="font-bold text-primary-600 text-body">
                  {(displayName || profileQuery.data?.username || 'A').substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="text-meta min-w-0">
              <p className="font-bold text-on-surface truncate">{profileQuery.data?.username}</p>
              {profileQuery.data?.userId && (
                <AnimatedDisclosure summary="Mã tài khoản" className="text-meta text-on-surface-variant mt-0.5">
                  <p className="break-all mt-1 text-on-surface-variant">{profileQuery.data.userId}</p>
                </AnimatedDisclosure>
              )}
            </div>
          </div>

          <div className="space-y-3 text-meta">
            <div>
              <label htmlFor="profile-display-name" className="text-form-label text-on-surface block mb-1">
                Tên hiển thị / Bút danh
              </label>
              <input
                id="profile-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <ImageUpload onUpload={setAvatarUrl} label="Tải ảnh đại diện" />
                {isAuthorOrAdmin && <ImageUpload onUpload={setBannerUrl} label="Tải ảnh bìa tác giả" />}
              </div>

              {isAuthorOrAdmin && bannerUrl && (
                <ImageLightbox src={bannerUrl} alt="Ảnh bìa tác giả" className="sc-image-preview-fill">
                  <img className="sc-author-banner mt-1 rounded-lg border border-[var(--sc-border)]" src={bannerUrl} alt="Xem trước ảnh bìa tác giả" />
                </ImageLightbox>
              )}

              <AnimatedDisclosure summary="Nhập URL ảnh thủ công" className="text-meta text-on-surface-variant pt-1">
                <div className="space-y-3 pt-2">
                  <div>
                    <label htmlFor="profile-avatar-url" className="text-form-label text-on-surface block mb-1">
                      Đường dẫn ảnh đại diện (URL)
                    </label>
                    <input
                      id="profile-avatar-url"
                      type="url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://…"
                      className={inputClassName}
                    />
                  </div>
                  {isAuthorOrAdmin && (
                    <div>
                      <label htmlFor="author-banner" className="text-form-label text-on-surface block mb-1">
                        Ảnh bìa tác giả (URL)
                      </label>
                      <input
                        id="author-banner"
                        type="url"
                        value={bannerUrl}
                        onChange={(event) => setBannerUrl(event.target.value)}
                        placeholder="https://…"
                        className={inputClassName}
                      />
                    </div>
                  )}
                </div>
              </AnimatedDisclosure>
            </div>

            {isAuthorOrAdmin && (
              <div>
                <label htmlFor="author-publishing-schedule" className="text-form-label text-on-surface block mb-1">
                  Lịch đăng dự kiến
                </label>
                <textarea
                  id="author-publishing-schedule"
                  rows={3}
                  maxLength={500}
                  value={publishingSchedule}
                  onChange={(event) => setPublishingSchedule(event.target.value)}
                  placeholder="Ví dụ: Thứ Tư và thứ Bảy, lúc 20:00"
                  className={inputClassName}
                />
              </div>
            )}

            <div>
              <label htmlFor="profile-bio" className="text-form-label text-on-surface block mb-1">
                Tiểu sử ngắn
              </label>
              <textarea
                id="profile-bio"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className={inputClassName}
              />
            </div>

            <AnimatedSaveButton
              type="button"
              loading={profileMutation.isPending}
              saved={profileMutation.isSuccess}
              onClick={() => profileMutation.mutate()}
              className="w-full py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-on-primary font-semibold text-meta transition-colors shadow-xs disabled:opacity-50"
            >
              Lưu hồ sơ
            </AnimatedSaveButton>
            {profileMutation.isError && <p role="alert" className="text-body text-danger">{getApiErrorMessage(profileMutation.error)}</p>}
          </div>
        </div>

        {/* Card 2: Thiết lập tài khoản */}
        <div className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface)] p-5 shadow-xs space-y-4">
          <h2 className="font-serif font-bold text-card-title text-on-surface pb-2 border-b border-[var(--sc-border)] flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-600 text-[18px]" aria-hidden="true">settings</span>
            Thiết lập tài khoản
          </h2>

          <div className="space-y-4 text-meta">
            <div>
              <label htmlFor="profile-language" className="text-form-label text-on-surface block mb-1">
                Ngôn ngữ hiển thị
              </label>
              <select
                id="profile-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className={inputClassName}
              >
                <option value="vi">Tiếng Việt</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--sc-surface-subtle)] border border-[var(--sc-border)]">
              <div>
                <span className="font-semibold text-on-surface block text-meta">Thông báo hoạt động</span>
                <span className="text-meta text-on-surface-variant">Nhận thông báo khi có người theo dõi hoặc ủng hộ</span>
              </div>
              <Switch
                aria-label="Nhận thông báo"
                checked={notificationEnabled}
                onChange={(e) => setNotificationEnabled(e.currentTarget.checked)}
                className="shrink-0"
              />
            </div>

            <AnimatedSaveButton
              type="button"
              loading={settingsMutation.isPending}
              saved={settingsMutation.isSuccess}
              onClick={() => settingsMutation.mutate()}
              className="w-full py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-on-primary font-semibold text-meta transition-colors shadow-xs disabled:opacity-50"
            >
              Lưu cài đặt
            </AnimatedSaveButton>
            {settingsMutation.isError && <p role="alert" className="text-body text-danger">{getApiErrorMessage(settingsMutation.error)}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

import { AuthorDialog, AuthorNavbar } from '../../shared/components/AuthorTheme';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getAuthorProfile, getMyProfile, getMySettings, updateMyProfile, updateMySettings } from './profile-api';
import { useAuthStore } from '../auth/useAuthStore';
import { getWallet } from '../wallet/wallet-api';
import { donateToAuthor } from '../wallet/wallet-api';
import { followAuthor, unfollowAuthor } from '../reader/reader-api';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';

export function AuthorProfilePage() {
  const { authorId = '' } = useParams();
  const currentUser = useAuthStore((state: any) => state.user);

  // Author query (if authorId exists)
  const authorQuery = useQuery({
    queryKey: ['author-profile', authorId || currentUser?.userId],
    queryFn: () => getAuthorProfile(authorId || currentUser?.userId || ''),
    enabled: Boolean(authorId || currentUser?.userId)
  });

  // Wallet query for support modal
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWallet,
    enabled: Boolean(currentUser)
  });

  // Interactive States
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportAmount, setSupportAmount] = useState(20);
  const [supportMessage, setSupportMessage] = useState('');
  const [toastMessage, setToastMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const queryClient = useQueryClient();
  const targetAuthorId = authorId || currentUser?.userId || '';

  const followMutation = useMutation({
    mutationFn: () => authorQuery.data?.isFollowing ? unfollowAuthor(targetAuthorId) : followAuthor(targetAuthorId),
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
      showToast('Ủng hộ tác giả thành công.');
    },
    onError: (error) => showToast(getApiErrorMessage(error), true)
  });

  const showToast = (msg: string, isError = false) => {
    setToastMessage({ text: msg, isError });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const author = authorQuery.data;
  const authorName = author?.displayName || author?.username || '';
  const authorUsername = author?.username || '';
  const authorAvatar = author?.avatarUrl;
  const displayFollowers = author?.followersCount ?? 0;
  const availableCoins = walletQuery.data?.coinsBalance ?? 0;
  const displayNovels = author?.novels ?? [];
  const totalReads = displayNovels.reduce((sum, novel) => sum + (novel.viewsCount ?? 0), 0);
  const isOwnProfile = Boolean(currentUser?.userId && currentUser.userId === targetAuthorId);

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
    showToast(`Đã sao chép liên kết hồ sơ tác giả ${authorName}!`);
  };

  if (!targetAuthorId) return <ErrorState error={new Error('Cần đăng nhập hoặc chọn tác giả để xem hồ sơ.')} />;
  if (authorQuery.isLoading) return <LoadingState label="Đang tải hồ sơ tác giả..." />;
  if (authorQuery.isError) return <ErrorState error={authorQuery.error} onRetry={() => void authorQuery.refetch()} />;

  return (
    <div className="min-h-screen flex flex-col bg-surface text-stone-800 antialiased selection:bg-primary-100 selection:text-primary-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-stone-900 text-white px-4 py-3 rounded-xl shadow-sm text-meta font-medium border border-stone-800 animate-in fade-in  duration-300">
          <span className={`material-symbols-outlined text-[18px] ${toastMessage.isError ? 'text-red-400' : 'text-emerald-400'}`}>{toastMessage.isError ? 'error' : 'check_circle'}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* 1. Global Top Navbar */}
      <AuthorNavbar />

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-6 flex-1">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-meta text-stone-500">
          <Link to="/author/projects" className="hover:text-stone-900 transition-colors">
            Trang chủ
          </Link>
          <span className="text-stone-300">/</span>
          <span className="text-stone-500">Tác giả</span>
          <span className="text-stone-300">/</span>
          <span className="font-semibold text-stone-800">{authorName}</span>
        </nav>

        {/* 2. Minimalist Author Profile Header */}
        <section className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
          {/* Profile Info Bar Overlapping Banner */}
          <div className="p-5 sm:p-6 relative">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              {/* Left: Avatar & Identity */}
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3.5">
                <div className="relative shrink-0">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white bg-primary-50 shadow-sm overflow-hidden flex items-center justify-center">
                    {authorAvatar ? <img alt={authorName} className="w-full h-full object-cover" src={authorAvatar} /> : <span className="text-2xl font-bold text-primary-700">{authorName.slice(0, 1).toUpperCase()}</span>}
                  </div>
                </div>

                <div className="space-y-1 sm:mb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                      {authorName}
                    </h1>
                  </div>
                  <p className="text-meta font-medium text-stone-500">@{authorUsername}</p>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-start md:self-end">
                {/* Follow Button */}
                <button
                  onClick={() => followMutation.mutate()}
                  disabled={!currentUser || isOwnProfile || followMutation.isPending}
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-meta font-semibold shadow-xs  transition-all ${
                    author?.isFollowing
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {author?.isFollowing ? 'check' : 'add'}
                  </span>
                  <span>{author?.isFollowing ? 'Đang theo dõi' : 'Theo dõi'}</span>
                </button>

                {/* Support Author Button */}
                <button
                  type="button"
                  onClick={() => setSupportModalOpen(true)}
                  disabled={!currentUser || isOwnProfile}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-meta font-semibold bg-amber-50 text-warning hover:bg-amber-100 border border-amber-300/80 shadow-xs  transition-all"
                >
                  <span className="material-symbols-outlined text-[15px] text-warning">volunteer_activism</span>
                  <span>Ủng hộ tác giả</span>
                </button>

                {/* Share Button */}
                <button
                  type="button"
                  onClick={handleShare}
                  className="p-1.5 rounded-xl border border-stone-200 text-stone-500 hover:text-stone-800 hover:bg-stone-50 transition-colors shadow-2xs"
                  title="Chia sẻ hồ sơ"
                >
                  <span className="material-symbols-outlined text-[18px]">share</span>
                </button>
              </div>
            </div>

            {/* Short Bio */}
            <div className="mt-3.5 pt-2.5 border-t border-stone-100">
              {author?.bio && <details className="text-body text-stone-700"><summary className="cursor-pointer">Giới thiệu tác giả</summary><p className="mt-2 whitespace-pre-wrap">{author.bio}</p></details>}
            </div>

            {/* Public Inline Stats */}
            <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center gap-3 text-meta text-stone-600">
              <span className="font-medium">
                <strong className="font-bold text-stone-900">{displayFollowers.toLocaleString('vi-VN')}</strong> người theo dõi
              </span>
              <span className="text-stone-300">•</span>
              <span className="font-medium">
                <strong className="font-bold text-stone-900">{totalReads.toLocaleString('vi-VN')}</strong> lượt đọc
              </span>
              <span className="text-stone-300">•</span>
              <span className="font-medium">
                <strong className="font-bold text-stone-900">{displayNovels.length}</strong> tác phẩm
              </span>
            </div>
          </div>
        </section>

        {/* 3. Book Collection (Authentic 3D Book Covers) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/70">
            <div>
              <h2 className="font-serif font-bold text-base sm:text-lg text-stone-900">Tác phẩm đã xuất bản</h2>
            </div>
          </div>

          {/* 4-Column Authentic Book Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {displayNovels.length === 0 && <p className="col-span-full text-body text-stone-500">Tác giả chưa có tác phẩm đã xuất bản.</p>}
            {displayNovels.map((novel) => (
              <Link key={novel.novelId} to={`/reader/novels/${novel.novelId}`} className="group flex flex-col">
                <div
                  className="block relative aspect-[2/3] w-full rounded-r-xl rounded-l-xs overflow-hidden transition-all duration-300  bg-stone-900 shadow-none group-hover:shadow-none"
                >
                  {/* Book Art Image */}
                  {novel.coverImageUrl ? <img alt={novel.title} src={novel.coverImageUrl} className="w-full h-full object-cover  transition-transform duration-500 brightness-[0.92] contrast-[1.05]" /> : <div className="w-full h-full flex items-center justify-center text-white text-center p-4 font-serif">{novel.title}</div>}

                </div>

                {/* Book Details Footer */}
                <div className="mt-2.5 space-y-1">
                  <h3
                    className="block font-serif font-bold text-body text-stone-900 group-hover:text-primary-600 transition-colors leading-snug line-clamp-2"
                    title={novel.title}
                  >
                    {novel.title}
                  </h3>
                  <p className="text-meta text-stone-500 font-medium">{novel.genre || 'Chưa phân loại'}</p>
                  <p className="text-meta text-stone-400 pt-0.5">
                    {novel.chaptersCount ?? 0} chương • {(novel.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {author?.joinedAt && <p className="text-meta text-stone-500">Tham gia {new Date(author.joinedAt).toLocaleDateString('vi-VN')}</p>}
      </main>

      {/* 5. Compact Literary Footer */}
      <footer className="mt-8 border-t border-stone-200 bg-white/80 py-6 px-4 sm:px-8 text-meta text-stone-500">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-stone-800">StoryCraft Văn Hoa</span>
            <span className="text-stone-300">•</span>
            <span>© 2025 Nền tảng Xuất bản &amp; Sáng tác Văn học Trực tuyến</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-stone-500 text-meta">
            <a href="#" className="hover:text-primary-600 transition-colors">
              Chính sách xuất bản
            </a>
            <a href="#" className="hover:text-primary-600 transition-colors">
              Bản quyền &amp; Sở hữu trí tuệ
            </a>
            <a href="#" className="hover:text-primary-600 transition-colors">
              Tiêu chuẩn cộng đồng
            </a>
            <a href="#" className="hover:text-primary-600 transition-colors">
              Trung tâm trợ giúp độc giả
            </a>
          </div>
        </div>
      </footer>

      {/* 6. Support Author Modal */}
      {supportModalOpen && (
        <AuthorDialog onClose={() => setSupportModalOpen(false)}><div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 w-full max-w-md p-5 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-warning flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
                </div>
                <div>
                  <h3 className="font-serif font-bold text-body text-stone-900">Ủng hộ tác giả {authorName}</h3>
                  <p className="text-meta text-stone-500">Gửi tặng năng lượng sáng tác</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSupportModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Author Target Card */}
            <div className="flex items-center gap-3 my-3 p-2.5 rounded-xl bg-stone-50 border border-stone-200/70">
              {authorAvatar ? <img alt={authorName} src={authorAvatar} className="w-9 h-9 rounded-full object-cover border border-white shadow-xs" /> : <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center font-bold">{authorName.slice(0, 1).toUpperCase()}</div>}
              <div className="text-meta">
                <span className="font-bold text-stone-900 block">{authorName} (@{authorUsername})</span>
                <span className="text-stone-500 text-meta">{displayNovels.length} tác phẩm đã xuất bản</span>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3 text-meta">
              <label className="font-semibold text-stone-700 block">Chọn mức ủng hộ (Xu Văn Hoa):</label>
              <div className="grid grid-cols-4 gap-2">
                {[10, 20, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSupportAmount(amt)}
                    className={`py-1.5 rounded-lg border font-semibold text-center transition-all ${
                      supportAmount === amt
                        ? 'border-primary-600 bg-primary-50/80 font-bold text-primary-600'
                        : 'border-stone-200 hover:border-primary-600 hover:text-primary-600 bg-white'
                    }`}
                  >
                    {amt} Xu
                  </button>
                ))}
              </div>

              <div>
                <label className="text-meta text-stone-500 block mb-1">Hoặc số lượng tùy chỉnh:</label>
                <div className="relative">
                  <input
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
                <label className="text-meta text-stone-500 block mb-1">
                  Lời nhắn gửi đến {authorName} (không bắt buộc):
                </label>
                <textarea
                  rows={2}
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder={`Cảm ơn tác giả ${authorName} vì những trang viết đẹp!`}
                  className="w-full text-meta rounded-lg border border-stone-200 focus:border-primary-600 focus:ring-1 focus:ring-primary-600 py-1.5 px-3 placeholder-stone-400 text-stone-800 outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50/60 border border-amber-200/60 text-meta text-stone-600">
                <span>
                  Số dư khả dụng: <strong>{walletQuery.isLoading ? 'Đang tải...' : walletQuery.isError ? 'Không tải được' : `${availableCoins.toLocaleString('vi-VN')} Xu`}</strong>
                </span>
                <Link to="/wallet" className="text-primary-600 font-semibold hover:underline">
                  Nạp Xu
                </Link>
              </div>
            </div>

            {/* Actions */}
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
                className="px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-semibold shadow-xs  transition-all disabled:opacity-50"
              >
                {supportMutation.isPending ? 'Đang gửi...' : 'Xác nhận ủng hộ'}
              </button>
            </div>
          </div>
        </div></AuthorDialog>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// My Profile Page (Manage account & settings)
// -------------------------------------------------------------
export function MyProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile', 'me'], queryFn: getMyProfile });
  const settingsQuery = useQuery({ queryKey: ['settings', 'me'], queryFn: getMySettings });

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [language, setLanguage] = useState('vi');
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName ?? '');
      setAvatarUrl(profileQuery.data.avatarUrl ?? '');
      setBio(profileQuery.data.bio ?? '');
    }
  }, [profileQuery.data]);

  React.useEffect(() => {
    if (settingsQuery.data) {
      setLanguage(settingsQuery.data.language);
      setNotificationEnabled(settingsQuery.data.notificationEnabled);
    }
  }, [settingsQuery.data]);

  const profileMutation = useMutation({
    mutationFn: () =>
      updateMyProfile({
        displayName: displayName || undefined,
        avatarUrl: avatarUrl || null,
        bio: bio || null
      }),
    onSuccess: () => {
      setToastMessage('Đã lưu hồ sơ thành công!');
      setTimeout(() => setToastMessage(null), 3000);
      void queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: () => updateMySettings({ language, notificationEnabled }),
    onSuccess: () => {
      setToastMessage('Đã cập nhật cài đặt thành công!');
      setTimeout(() => setToastMessage(null), 3000);
      void queryClient.invalidateQueries({ queryKey: ['settings', 'me'] });
    }
  });

  if (profileQuery.isLoading || settingsQuery.isLoading) return <LoadingState label="Đang tải thông tin cá nhân..." />;
  if (profileQuery.isError) return <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />;

  return (
    <div className="min-h-screen bg-surface py-8 px-4 sm:px-6 lg:px-8 text-stone-800">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-stone-900 text-white px-4 py-2.5 rounded-xl text-meta font-medium shadow-sm">
          <span className="material-symbols-outlined text-emerald-400 text-[18px]">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold text-stone-900">Hồ Sơ Của Tôi</h1>
          </div>
          <Link
            to="/author/profile"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-meta font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            <span>Xem trang tác giả</span>
          </Link>
        </div>

        {/* Profile Card & Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Thông tin hiển thị */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <h2 className="font-serif font-bold text-body text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-600 text-[18px]">person</span>
              Thông tin hiển thị
            </h2>

            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-full border-2 border-primary-100 bg-primary-50 overflow-hidden flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-primary-600 text-body">
                    {(displayName || profileQuery.data?.username || 'A').substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-meta">
                <p className="font-bold text-stone-900">{profileQuery.data?.username}</p>
                <details className="text-meta text-stone-500"><summary className="cursor-pointer">Mã tài khoản</summary><p className="break-all mt-1">{profileQuery.data?.userId}</p></details>
              </div>
            </div>

            <div className="space-y-3 text-meta">
              <div>
                <label className="font-medium text-stone-700 block mb-1">Tên hiển thị / Bút danh</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full text-meta rounded-lg border border-stone-200 focus:border-primary-600 focus:ring-1 focus:ring-primary-600 py-2 px-3 text-stone-800 outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Đường dẫn ảnh đại diện (URL)</label>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full text-meta rounded-lg border border-stone-200 focus:border-primary-600 focus:ring-1 focus:ring-primary-600 py-2 px-3 text-stone-800 outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Tiểu sử ngắn (Bio)</label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full text-meta rounded-lg border border-stone-200 focus:border-primary-600 focus:ring-1 focus:ring-primary-600 py-2 px-3 text-stone-800 outline-none"
                />
              </div>

              <button
                type="button"
                disabled={profileMutation.isPending}
                onClick={() => profileMutation.mutate()}
                className="w-full py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-semibold text-meta transition-colors shadow-xs disabled:opacity-50"
              >
                {profileMutation.isPending ? 'Đang lưu...' : 'Lưu hồ sơ'}
              </button>
            </div>
          </div>

          {/* Card 2: Thiết lập hệ thống */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <h2 className="font-serif font-bold text-body text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-600 text-[18px]">settings</span>
              Thiết lập tài khoản
            </h2>

            <div className="space-y-4 text-meta">
              <div>
                <label className="font-medium text-stone-700 block mb-1">Ngôn ngữ hiển thị</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full text-meta rounded-lg border border-stone-200 focus:border-primary-600 focus:ring-1 focus:ring-primary-600 py-2 px-3 text-stone-800 outline-none"
                >
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                <div>
                  <span className="font-semibold text-stone-800 block text-meta">Thông báo hoạt động</span>
                  <span className="text-meta text-stone-500">Nhận thông báo khi có người theo dõi hoặc ủng hộ</span>
                </div>
                <input
                  type="checkbox"
                  checked={notificationEnabled}
                  onChange={(e) => setNotificationEnabled(e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded border-stone-300 focus:ring-primary-600"
                />
              </div>

              <button
                type="button"
                disabled={settingsMutation.isPending}
                onClick={() => settingsMutation.mutate()}
                className="w-full py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white font-semibold text-meta transition-colors shadow-xs disabled:opacity-50"
              >
                {settingsMutation.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

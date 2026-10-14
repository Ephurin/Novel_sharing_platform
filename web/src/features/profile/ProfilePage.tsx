import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getAuthorProfile, getMyProfile, getMySettings, updateMyProfile, updateMySettings } from './profile-api';
import { useAuthStore } from '../auth/useAuthStore';
import { getWallet } from '../wallet/wallet-api';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';

// Default mock books matching the literary prototype for full visual splendor
const DEFAULT_NOVELS = [
  {
    novelId: 'novel-1',
    title: 'Gió Thoảng Qua Phố Cổ',
    category: 'Hiện đại / Lãng mạn',
    tag: 'TIỂU THUYẾT',
    edition: 'TẬP 1',
    chaptersCount: 48,
    readsText: '142.8K',
    series: 'StoryCraft Classics',
    coverUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBGdh_3bDkbyj5H0cwbHvHB8ZCDYKnTeC9nUQdt4ROHKGqvojof1wJwUlEAFnFx7o2wk5qENGs2ezlmvy5LwBBzaurioNv1NS4emkUNbIsDm3La23geKnhR02ci1HGQL-RXTuPL_Ugghg2L-HzEDQv4Aqm0JuYagyY317Vkyi90fd677qF1opL_B4Ap3i92-F-OVpP2AvPgswotI7GgC7aWrsHfbyRr1EZxhUjDxVfoXOF_ciIRTVbR5w'
  },
  {
    novelId: 'novel-2',
    title: 'Đêm Mưa Trên Phố Cũ',
    category: 'Trinh thám / Kịch tính',
    tag: 'TRINH THÁM',
    edition: 'BẢN ĐỘC QUYỀN',
    chaptersCount: 36,
    readsText: '68.2K',
    series: 'StoryCraft Mystery',
    coverUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDfe3W50B79cXMZgqZpjpy_NJEQDbLpcPquG6qWz1K7rJlt97yDOrJUCi5dS_oIh0zN2selXroqybUnQLmJPTpfoha861f1rTSsKja9Rvb42qJf-qVhYK24cUhyD3eH8BF2lzdbbndYH41lC_8G99CMn7eD6CMuZ_GRW4Qtu7hjxfhY_wfMJgua95kPTUKu05SIQnC3a7TyAI0y2YDRXTGhEkd8zAHHEVLfPozJ_oyatZZdZ8W6PbANJw'
  },
  {
    novelId: 'novel-3',
    title: 'Dấu Chân Trong Sương',
    category: 'Huyền bí / Đô thị',
    tag: 'HUYỀN BÍ',
    edition: 'HOÀN TẤT',
    chaptersCount: 28,
    readsText: '34.5K',
    series: 'StoryCraft Series',
    coverUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuChqyHfwmoRoC9r386VHbSOSMPdP-B4z4Um5Zhtkd04nAzXcoIDaGs3ed330pJuQEZqTjjm2fOvJhIQpInBFJ0UHT6L7RbmjjXCvRgUxk7dzf-a5fOYt7pRTQlgM_ArVVj_UGPjKifkS8DaxmeQwatvgJ4q8cpozyOdp_mmkqcQ_BG0XPQ_LYlkawsALE55fr-7KJxsmM8r-kZsCJ6d3LT5dANKDCmJwrAeQnXZ8HJnKLg5CW5uD-W1Nw'
  },
  {
    novelId: 'novel-4',
    title: 'Mùa Hạ Không Tên',
    category: 'Thanh xuân / Tuổi trẻ',
    tag: 'THANH XUÂN',
    edition: 'BÁN CHẠY',
    chaptersCount: 24,
    readsText: '29.1K',
    series: 'StoryCraft Romance',
    coverUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCDKesCeJZ4SqUCCVFXyFv4F-0OyUX4_QLZz7Ijmho7Tlziou0YPmhAMOi44QLrGTnh5znUG980wtnKzuuAr1GLAaFB_r93RoYtwgXVwRgZ0F76rkXbqadKXGyqOcZunjU_6cpLpaW9Yw71xcGxed4zFtOpYx0b5ATKeVVcIfGDqKHrAwdUD5xzS1i4D0nZMHaOTuzhUhUB8dXfIWGSbixHcYunXuLqUpcA2k0cjAyEMB_77y-ywGtq9g'
  }
];

export function AuthorProfilePage() {
  const { authorId = '' } = useParams();
  const currentUser = useAuthStore((state: any) => state.user);

  // Author query (if authorId exists)
  const authorQuery = useQuery({
    queryKey: ['author-profile', authorId || currentUser?.userId || 'default'],
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
  const [isFollowing, setIsFollowing] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportAmount, setSupportAmount] = useState(20);
  const [supportMessage, setSupportMessage] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const author = authorQuery.data;
  const authorName = author?.displayName || author?.username || currentUser?.displayName || 'Mai Linh';
  const authorUsername = author?.username || currentUser?.username || 'moclan';
  const authorAvatar =
    author?.avatarUrl ||
    currentUser?.avatarUrl ||
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAbAnbYz6GnLB9OsWGGaWQpEDg2Uz8HSeIMvRdL1QnvfEY35c4CdN4ozi0Am-GO_CuQTME66tf1eMj5EKCygM0VWmpt1gs2G7379q8h3P4qyeVrGcCSWC73k4d-yBGPZgXN66vtKSyl53uA18UWjT-iXxl3Ccg-AlYq2SXx60cck5PZG9T0uTUMlUzeOpauNHOAxI1hgXwjsi4JdTG80ZqLEK4N77hTmTe_7icJ0KQLdEeg_1qqOHPckA';

  const baseFollowers = author?.followersCount ?? 14250;
  const displayFollowers = isFollowing ? baseFollowers + 1 : baseFollowers;
  const availableCoins = walletQuery.data?.coinsBalance ?? 125000;

  // Merge real author novels or default sample novels
  const displayNovels = (author?.novels && author.novels.length > 0)
    ? author.novels.map((n, idx) => ({
        novelId: n.novelId,
        title: n.title,
        category: idx % 2 === 0 ? 'Hiện đại / Lãng mạn' : 'Trinh thám / Kịch tính',
        tag: 'TIỂU THUYẾT',
        edition: `TẬP ${idx + 1}`,
        chaptersCount: n.chaptersCount ?? 30,
        readsText: `${((n.likesCount ?? 10) * 12).toLocaleString('vi-VN')}`,
        series: 'StoryCraft Classics',
        coverUrl: DEFAULT_NOVELS[idx % DEFAULT_NOVELS.length].coverUrl
      }))
    : DEFAULT_NOVELS;

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
    showToast(`Đã sao chép liên kết hồ sơ tác giả ${authorName}!`);
  };

  const handleConfirmSupport = () => {
    setSupportModalOpen(false);
    showToast(`Bạn đã gửi tặng ${supportAmount.toLocaleString('vi-VN')} Xu thành công tới tác giả ${authorName}!`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9ff] text-stone-800 antialiased selection:bg-indigo-100 selection:text-indigo-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-stone-900 text-white px-4 py-3 rounded-xl shadow-xl text-xs font-medium border border-stone-800 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <span className="material-symbols-outlined text-emerald-400 text-[18px]">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Global Top Navbar */}
      <header className="h-14 border-b border-[#eaedff] bg-white/95 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 flex items-center justify-between shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-6 lg:gap-8">
          {/* Brand Logo */}
          <Link to="/author/projects" className="flex items-center gap-2 group shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#4f46e5] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[18px]">auto_stories</span>
            </div>
            <div>
              <span className="font-serif font-bold text-sm sm:text-base text-stone-900 tracking-tight leading-none block">
                StoryCraft
              </span>
              <span className="text-[9px] uppercase tracking-widest text-[#4f46e5] font-bold block mt-0.5">
                Văn Hoa Studio
              </span>
            </div>
          </Link>

          {/* Global Nav Links */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium text-stone-600">
            <Link to="/author/projects" className="px-3 py-1.5 rounded-lg hover:text-stone-900 hover:bg-stone-100/70 transition-colors">
              Tổng quan
            </Link>
            <Link to="/author/projects" className="px-3 py-1.5 rounded-lg hover:text-stone-900 hover:bg-stone-100/70 transition-colors">
              Tác phẩm
            </Link>
            <Link to="/wallet" className="px-3 py-1.5 rounded-lg hover:text-stone-900 hover:bg-stone-100/70 transition-colors">
              Ví &amp; doanh thu
            </Link>
            <Link
              to="/author/profile"
              className="px-3 py-1.5 rounded-lg text-primary font-semibold bg-indigo-50/90 border border-indigo-200/60 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[15px] text-[#4f46e5]">account_circle</span>
              Trang tác giả
            </Link>
          </nav>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2.5">
          <Link
            to="/author/projects"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#4f46e5] text-white hover:bg-indigo-700 shadow-xs active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[15px]">edit_square</span>
            <span className="hidden sm:inline">Viết chương mới</span>
          </Link>

          <button
            aria-label="Thông báo"
            type="button"
            className="w-8 h-8 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 flex items-center justify-center relative transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">notifications</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#4f46e5] absolute top-2 right-2 ring-2 ring-white"></span>
          </button>

          {/* Avatar User Pill */}
          <div className="flex items-center gap-2 pl-1 cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-indigo-100 border border-indigo-200 overflow-hidden flex items-center justify-center text-primary font-bold text-xs">
              {authorName.substring(0, 2).toUpperCase()}
            </div>
            <div className="hidden xl:block text-left leading-none">
              <span className="text-xs font-semibold text-stone-800 block">{authorName}</span>
              <span className="text-[10px] text-stone-400">@{authorUsername}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-6 flex-1">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-stone-500">
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
          {/* Literary Gradient Banner (~130px) */}
          <div className="h-[130px] w-full bg-gradient-to-r from-[#f5f3ff] via-[#ede9fe] to-[#e0e7ff] relative flex items-start justify-end p-4 sm:p-5 overflow-hidden border-b border-indigo-100/60">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/5 via-transparent to-amber-900/5 pointer-events-none"></div>
            <div className="relative text-right select-none opacity-60 hidden sm:block">
              <p className="font-serif italic text-xs text-indigo-950 font-light">
                “Chữ nghĩa là bóng hình của năm tháng đọng lại trên trang giấy.”
              </p>
              <p className="text-[10px] text-stone-500 font-medium mt-0.5 tracking-wider">— StoryCraft Văn Hoa</p>
            </div>
          </div>

          {/* Profile Info Bar Overlapping Banner */}
          <div className="px-5 sm:px-6 pb-5 pt-0 relative">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-10 sm:-mt-12">
              {/* Left: Avatar & Identity */}
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3.5">
                <div className="relative shrink-0">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white bg-indigo-50 shadow-md overflow-hidden flex items-center justify-center">
                    <img alt={authorName} className="w-full h-full object-cover" src={authorAvatar} />
                  </div>
                  <span
                    className="absolute bottom-1 right-1.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"
                    title="Đang hoạt động"
                  ></span>
                </div>

                <div className="space-y-1 sm:mb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                      {authorName}
                    </h1>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200/70 text-[#4f46e5] text-[11px] font-medium">
                      <span className="material-symbols-outlined text-[13px] text-[#4f46e5]">verified</span>
                      Tác giả xác thực
                    </span>
                  </div>
                  <p className="text-xs font-medium text-stone-500">@{authorUsername}</p>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-start md:self-end">
                {/* Follow Button */}
                <button
                  onClick={() => {
                    const next = !isFollowing;
                    setIsFollowing(next);
                    showToast(next ? `Bạn đã theo dõi tác giả ${authorName}!` : `Đã hủy theo dõi tác giả.`);
                  }}
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs active:scale-95 transition-all ${
                    isFollowing
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                      : 'bg-[#4f46e5] text-white hover:bg-indigo-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {isFollowing ? 'check' : 'add'}
                  </span>
                  <span>{isFollowing ? 'Đang theo dõi' : 'Theo dõi'}</span>
                </button>

                {/* Support Author Button */}
                <button
                  type="button"
                  onClick={() => setSupportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-[#d97706] hover:bg-amber-100 border border-amber-300/80 shadow-xs active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[15px] text-[#d97706]">volunteer_activism</span>
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
              <p className="text-xs sm:text-sm text-stone-700 font-serif italic leading-relaxed">
                “{author?.bio || 'Viết những câu chuyện về ký ức, con người và những góc phố cũ. Yêu văn chương, Hà Nội và những ngày mưa.'}”
              </p>
            </div>

            {/* Public Inline Stats */}
            <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center gap-3 text-xs text-stone-600">
              <span className="font-medium">
                <strong className="font-bold text-stone-900">{displayFollowers.toLocaleString('vi-VN')}</strong> người theo dõi
              </span>
              <span className="text-stone-300">•</span>
              <span className="font-medium">
                <strong className="font-bold text-stone-900">285.4K</strong> lượt đọc
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
              <p className="text-xs text-stone-500 mt-0.5">Tủ sách sáng tác chính thức của tác giả {authorName} tại Văn Hoa Studio</p>
            </div>
            <span className="text-xs text-stone-500 font-medium bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200/60">
              {displayNovels.length} cuốn tiểu thuyết
            </span>
          </div>

          {/* 4-Column Authentic Book Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {displayNovels.map((novel) => (
              <div key={novel.novelId} className="group flex flex-col">
                <Link
                  to={`/reader/novels/${novel.novelId}`}
                  title={`Đọc ${novel.title}`}
                  className="block relative aspect-[2/3] w-full rounded-r-xl rounded-l-xs overflow-hidden transition-all duration-300 group-hover:-translate-y-2 bg-stone-900 shadow-[0_12px_24px_-4px_rgba(0,0,0,0.18),0_4px_8px_-2px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.2)] group-hover:shadow-[0_22px_36px_-6px_rgba(79,70,229,0.28)]"
                >
                  {/* Book Art Image */}
                  <img
                    alt={novel.title}
                    src={novel.coverUrl}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-[0.92] contrast-[1.05]"
                  />

                  {/* 3D Book Spine Groove & Hinge Line */}
                  <div className="absolute inset-y-0 left-0 w-3.5 bg-gradient-to-r from-black/55 via-white/15 to-transparent z-20 pointer-events-none"></div>
                  <div className="absolute inset-y-0 left-3 w-[1px] bg-black/30 z-20 pointer-events-none"></div>

                  {/* Top Publisher Ribbon Badge */}
                  <div className="absolute top-2.5 left-4 right-2.5 flex items-center justify-between z-20 pointer-events-none">
                    <span className="text-[8px] font-bold tracking-widest uppercase text-amber-200 font-serif bg-black/60 backdrop-blur-xs px-1.5 py-0.5 rounded border border-amber-300/30">
                      {novel.tag}
                    </span>
                    <span className="text-[8px] tracking-wider text-white/80 font-mono bg-black/50 px-1 py-0.5 rounded">
                      {novel.edition}
                    </span>
                  </div>

                  {/* Bottom Scrim with Cover Typography */}
                  <div className="absolute inset-x-0 bottom-0 pt-12 pb-2.5 px-3.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent z-20 pointer-events-none flex flex-col justify-end">
                    <span className="text-[8px] uppercase tracking-widest text-amber-200/90 font-serif font-semibold">
                      Tác giả {authorName}
                    </span>
                    <h3 className="font-serif font-bold text-xs sm:text-sm text-white tracking-tight leading-snug drop-shadow-md line-clamp-2 mt-0.5">
                      {novel.title}
                    </h3>
                    <div className="mt-1.5 pt-1.5 border-t border-white/20 flex items-center justify-between text-[8px] text-white/70">
                      <span>{novel.series}</span>
                      <span className="material-symbols-outlined text-[11px] text-amber-300">auto_stories</span>
                    </div>
                  </div>

                  {/* Hover Read Action Overlay */}
                  <div className="absolute inset-0 bg-[#4f46e5]/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity z-30 flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#4f46e5] text-xs font-semibold shadow-md transform translate-y-2 group-hover:translate-y-0 transition-transform">
                      <span className="material-symbols-outlined text-[15px]">menu_book</span>
                      Đọc ngay
                    </span>
                  </div>
                </Link>

                {/* Book Details Footer */}
                <div className="mt-2.5 space-y-1">
                  <Link
                    to={`/reader/novels/${novel.novelId}`}
                    className="block font-serif font-bold text-sm text-stone-900 group-hover:text-[#4f46e5] transition-colors leading-snug line-clamp-1"
                    title={novel.title}
                  >
                    {novel.title}
                  </Link>
                  <p className="text-[11px] text-stone-500 font-medium">{novel.category}</p>
                  <p className="text-[11px] text-stone-400 pt-0.5">
                    {novel.chaptersCount} chương • {novel.readsText} lượt đọc
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Balanced 2-Column Author Intro & Writing Milestones (Eliminates Bottom Whitespace) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left: Giới thiệu văn phong & trích dẫn (7 Cột: ~60%) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-200/80 p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-[#4f46e5]">
                  <span className="material-symbols-outlined text-[17px]">auto_stories</span>
                </div>
                <h3 className="font-serif font-bold text-sm sm:text-base text-stone-900">Giới thiệu tác giả</h3>
              </div>

              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">
                {author?.bio ||
                  'Mai Linh bắt đầu sáng tác định kỳ trên nền tảng StoryCraft từ năm 2024. Với ngòi bút tinh tế, giàu chất thơ và đậm tính hoài niệm, các tác phẩm của cô thường khai thác những rung cảm bình dị, chiều sâu nội tâm của con người giữa không gian phố cổ Hà Nội qua từng thời kỳ chuyển mình của đô thị.'}
              </p>

              {/* Literary Quote Card */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-50/80 to-amber-50/40 border border-indigo-100/70 text-xs text-stone-700 font-serif italic">
                “Viết là cách lưu giữ những mảnh ký ức đẹp đẽ nhất của phố phường và con người trước dòng chảy vội vã của thời gian.”
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-stone-100 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-stone-500 text-[11px]">Mối quan tâm văn học:</span>
              <span className="text-stone-700 bg-stone-100 px-2.5 py-1 rounded-md text-[11px] font-medium border border-stone-200/50">
                Văn học hiện thực
              </span>
              <span className="text-stone-700 bg-stone-100 px-2.5 py-1 rounded-md text-[11px] font-medium border border-stone-200/50">
                Tùy bút Hà Nội
              </span>
              <span className="text-stone-700 bg-stone-100 px-2.5 py-1 rounded-md text-[11px] font-medium border border-stone-200/50">
                Tâm lý xã hội
              </span>
            </div>
          </div>

          {/* Right: Dấu ấn sáng tác & Lịch xuất bản (5 Cột: ~40%) */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-stone-200/80 p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/60 flex items-center justify-center text-[#d97706]">
                    <span className="material-symbols-outlined text-[17px]">award_star</span>
                  </div>
                  <h3 className="font-serif font-bold text-sm sm:text-base text-stone-900">Dấu ấn sáng tác</h3>
                </div>
                <span className="text-[10px] text-[#4f46e5] font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/60">
                  Độc quyền Văn Hoa
                </span>
              </div>

              {/* Milestones List */}
              <div className="space-y-2 pt-1 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-100">
                  <span className="text-stone-500 text-[11px]">Cột mốc gia nhập:</span>
                  <span className="font-semibold text-stone-800 text-[11px]">Tháng 03/2024</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-100">
                  <span className="text-stone-500 text-[11px]">Tổng dung lượng sáng tác:</span>
                  <span className="font-semibold text-stone-800 text-[11px]">520.000+ chữ</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-100">
                  <span className="text-stone-500 text-[11px]">Danh hiệu vinh danh:</span>
                  <span className="font-semibold text-[#4f46e5] text-[11px]">Cây bút triển vọng 2024</span>
                </div>
              </div>
            </div>

            {/* Schedule Banner */}
            <div className="pt-3 mt-3 border-t border-stone-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-stone-600">
                <span className="material-symbols-outlined text-[16px] text-emerald-600">schedule</span>
                <span className="text-[11px] font-medium">
                  Lịch ra chương mới: <strong>20:00 Thứ 4 &amp; Thứ 7</strong>
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Đang duy trì lịch viết"></span>
            </div>
          </div>
        </section>
      </main>

      {/* 5. Compact Literary Footer */}
      <footer className="mt-8 border-t border-stone-200 bg-white/80 py-6 px-4 sm:px-8 text-xs text-stone-500">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-stone-800">StoryCraft Văn Hoa</span>
            <span className="text-stone-300">•</span>
            <span>© 2025 Nền tảng Xuất bản &amp; Sáng tác Văn học Trực tuyến</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-stone-500 text-[11px]">
            <a href="#" className="hover:text-[#4f46e5] transition-colors">
              Chính sách xuất bản
            </a>
            <a href="#" className="hover:text-[#4f46e5] transition-colors">
              Bản quyền &amp; Sở hữu trí tuệ
            </a>
            <a href="#" className="hover:text-[#4f46e5] transition-colors">
              Tiêu chuẩn cộng đồng
            </a>
            <a href="#" className="hover:text-[#4f46e5] transition-colors">
              Trung tâm trợ giúp độc giả
            </a>
          </div>
        </div>
      </footer>

      {/* 6. Support Author Modal */}
      {supportModalOpen && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-md p-5 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-[#d97706] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
                </div>
                <div>
                  <h3 className="font-serif font-bold text-sm text-stone-900">Ủng hộ tác giả {authorName}</h3>
                  <p className="text-[11px] text-stone-500">Gửi tặng năng lượng sáng tác</p>
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
              <img
                alt={authorName}
                src={authorAvatar}
                className="w-9 h-9 rounded-full object-cover border border-white shadow-xs"
              />
              <div className="text-xs">
                <span className="font-bold text-stone-900 block">{authorName} (@{authorUsername})</span>
                <span className="text-stone-500 text-[11px]">Tác giả <em>Gió Thoảng Qua Phố Cổ</em></span>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3 text-xs">
              <label className="font-semibold text-stone-700 block">Chọn mức ủng hộ (Xu Văn Hoa):</label>
              <div className="grid grid-cols-4 gap-2">
                {[10, 20, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSupportAmount(amt)}
                    className={`py-1.5 rounded-lg border font-semibold text-center transition-all ${
                      supportAmount === amt
                        ? 'border-[#4f46e5] bg-indigo-50/80 font-bold text-[#4f46e5]'
                        : 'border-stone-200 hover:border-[#4f46e5] hover:text-[#4f46e5] bg-white'
                    }`}
                  >
                    {amt} Xu
                  </button>
                ))}
              </div>

              <div>
                <label className="text-[11px] text-stone-500 block mb-1">Hoặc số lượng tùy chỉnh:</label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={availableCoins}
                    value={supportAmount}
                    onChange={(e) => setSupportAmount(Number(e.target.value) || 0)}
                    className="w-full text-xs font-semibold rounded-lg border border-stone-200 focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] py-1.5 px-3 pr-10 text-stone-800 outline-none"
                  />
                  <span className="absolute right-3 top-2 text-xs font-semibold text-stone-400">Xu</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-stone-500 block mb-1">
                  Lời nhắn gửi đến {authorName} (không bắt buộc):
                </label>
                <textarea
                  rows={2}
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder={`Cảm ơn tác giả ${authorName} vì những trang viết đẹp!`}
                  className="w-full text-xs rounded-lg border border-stone-200 focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] py-1.5 px-3 placeholder-stone-400 text-stone-800 outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50/60 border border-amber-200/60 text-[11px] text-stone-600">
                <span>
                  Số dư khả dụng: <strong>{availableCoins.toLocaleString('vi-VN')} Xu</strong>
                </span>
                <Link to="/wallet" className="text-[#4f46e5] font-semibold hover:underline">
                  Nạp Xu
                </Link>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-stone-100 text-xs">
              <button
                type="button"
                onClick={() => setSupportModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 font-medium transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={supportAmount <= 0 || supportAmount > availableCoins}
                onClick={handleConfirmSupport}
                className="px-4 py-1.5 rounded-lg bg-[#4f46e5] text-white hover:bg-indigo-700 font-semibold shadow-xs active:scale-95 transition-all disabled:opacity-50"
              >
                Xác nhận ủng hộ
              </button>
            </div>
          </div>
        </div>
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
    <div className="min-h-screen bg-[#faf9ff] py-8 px-4 sm:px-6 lg:px-8 text-stone-800">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-stone-900 text-white px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg">
          <span className="material-symbols-outlined text-emerald-400 text-[18px]">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold text-stone-900">Hồ Sơ Của Tôi</h1>
            <p className="text-xs text-stone-500 mt-0.5">Quản lý thông tin tác giả và thiết lập tài khoản cá nhân</p>
          </div>
          <Link
            to="/author/profile"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#4f46e5] text-white hover:bg-indigo-700 transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            <span>Xem trang tác giả</span>
          </Link>
        </div>

        {/* Profile Card & Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Thông tin hiển thị */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <h2 className="font-serif font-bold text-sm text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4f46e5] text-[18px]">person</span>
              Thông tin hiển thị
            </h2>

            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-full border-2 border-indigo-100 bg-indigo-50 overflow-hidden flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-[#4f46e5] text-sm">
                    {(displayName || profileQuery.data?.username || 'A').substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-xs">
                <p className="font-bold text-stone-900">{profileQuery.data?.username}</p>
                <p className="text-stone-400 font-mono text-[11px]">{profileQuery.data?.userId}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-stone-700 block mb-1">Tên hiển thị / Bút danh</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full text-xs rounded-lg border border-stone-200 focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] py-2 px-3 text-stone-800 outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Đường dẫn ảnh đại diện (URL)</label>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full text-xs rounded-lg border border-stone-200 focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] py-2 px-3 text-stone-800 outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Tiểu sử ngắn (Bio)</label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full text-xs rounded-lg border border-stone-200 focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] py-2 px-3 text-stone-800 outline-none"
                />
              </div>

              <button
                type="button"
                disabled={profileMutation.isPending}
                onClick={() => profileMutation.mutate()}
                className="w-full py-2 rounded-lg bg-[#4f46e5] text-white hover:bg-indigo-700 font-semibold text-xs transition-colors shadow-xs disabled:opacity-50"
              >
                {profileMutation.isPending ? 'Đang lưu...' : 'Lưu hồ sơ'}
              </button>
            </div>
          </div>

          {/* Card 2: Thiết lập hệ thống */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <h2 className="font-serif font-bold text-sm text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4f46e5] text-[18px]">settings</span>
              Thiết lập tài khoản
            </h2>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-medium text-stone-700 block mb-1">Ngôn ngữ hiển thị</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full text-xs rounded-lg border border-stone-200 focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] py-2 px-3 text-stone-800 outline-none"
                >
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                <div>
                  <span className="font-semibold text-stone-800 block text-xs">Thông báo hoạt động</span>
                  <span className="text-[11px] text-stone-500">Nhận thông báo khi có người theo dõi hoặc ủng hộ</span>
                </div>
                <input
                  type="checkbox"
                  checked={notificationEnabled}
                  onChange={(e) => setNotificationEnabled(e.target.checked)}
                  className="w-4 h-4 text-[#4f46e5] rounded border-stone-300 focus:ring-[#4f46e5]"
                />
              </div>

              <button
                type="button"
                disabled={settingsMutation.isPending}
                onClick={() => settingsMutation.mutate()}
                className="w-full py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white font-semibold text-xs transition-colors shadow-xs disabled:opacity-50"
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

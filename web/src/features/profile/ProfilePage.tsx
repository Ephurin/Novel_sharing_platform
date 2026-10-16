import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AppSelect } from '../../shared/components/AppSelect';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { PageTitle } from '../../shared/components/PageTitle';
import { card, fallbackCover, primaryButton, secondaryButton, textInput } from '../../shared/components/ui-classes';
import { getApiErrorMessage } from '../../shared/api/api-client';
import type { UserRole } from '../auth/auth-types';
import { getAuthorProfile, getMyProfile, getMySettings, updateMyProfile, updateMySettings } from './profile-api';

const roleLabels: Record<UserRole, string> = { AUTHOR: 'Tác giả', READER: 'Độc giả', ADMIN: 'Quản trị viên' };

const languageOptions = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' }
];

const novelStatusLabels: Record<string, string> = {
  PUBLISHED: 'Đã xuất bản',
  ONGOING: 'Đang ra',
  COMPLETED: 'Đã hoàn thành',
  HIATUS: 'Tạm ngưng'
};

export function MyProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile', 'me'], queryFn: getMyProfile });
  const settingsQuery = useQuery({ queryKey: ['settings', 'me'], queryFn: getMySettings });
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [language, setLanguage] = useState('vi');
  const [notificationEnabled, setNotificationEnabled] = useState(true);

  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName ?? '');
      setAvatarUrl(profileQuery.data.avatarUrl ?? '');
      setBio(profileQuery.data.bio ?? '');
    }
  }, [profileQuery.data]);

  useEffect(() => {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', 'me'] })
  });

  const settingsMutation = useMutation({
    mutationFn: () => updateMySettings({ language, notificationEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'me'] })
  });

  if (profileQuery.isLoading || settingsQuery.isLoading) return <LoadingState label="Đang tải hồ sơ..." />;
  if (profileQuery.isError) return <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />;
  if (settingsQuery.isError) return <ErrorState error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />;

  const profile = profileQuery.data;
  const isAuthor = profile?.role === 'AUTHOR' || profile?.role === 'ADMIN';
  const languageChoices = languageOptions.some((option) => option.value === language)
    ? languageOptions
    : [...languageOptions, { value: language, label: language }];

  return (
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <PageTitle title="Hồ sơ & cài đặt" description="Quản lý thông tin hiển thị và tùy chọn tài khoản của bạn." />

      <section className={`${card} p-5 lg:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <div className="flex items-center gap-4 min-w-0">
          <ProfileAvatar url={avatarUrl} name={displayName || profile?.username || 'A'} size="lg" />
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold text-stone-900 truncate">{displayName || profile?.username}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[13px] text-stone-500">@{profile?.username}</span>
              {profile ? (
                <span className="text-[11px] font-medium text-primary-700 bg-primary-50 border border-primary-200/70 px-1.5 py-px rounded-full">
                  {roleLabels[profile.role]}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {isAuthor && profile ? (
          <Link to={`/authors/${profile.userId}`} className={secondaryButton}>
            <span className="material-symbols-outlined text-[16px] text-stone-400">badge</span>
            <span>Xem trang tác giả công khai</span>
          </Link>
        ) : null}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
        <section className={`${card} p-5 flex flex-col gap-4`}>
          <SectionHeading icon="person" title="Thông tin hồ sơ" />
          <Field label="Tên hiển thị">
            <input value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} className={textInput} />
          </Field>
          <Field label="Ảnh đại diện (URL)">
            <input
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.currentTarget.value)}
              className={textInput}
              placeholder="https://..."
            />
          </Field>
          <Field label="Giới thiệu">
            <textarea
              value={bio}
              onChange={(event) => setBio(event.currentTarget.value)}
              rows={5}
              className={`${textInput} leading-relaxed resize-y`}
              placeholder="Vài dòng về bạn..."
            />
          </Field>
          <SaveRow
            pending={profileMutation.isPending}
            success={profileMutation.isSuccess}
            error={profileMutation.isError ? getApiErrorMessage(profileMutation.error) : null}
            onSave={() => profileMutation.mutate()}
            label="Lưu hồ sơ"
          />
        </section>

        <section className={`${card} p-5 flex flex-col gap-4`}>
          <SectionHeading icon="settings" title="Cài đặt" />
          <Field label="Ngôn ngữ">
            <AppSelect value={language} options={languageChoices} onChange={setLanguage} ariaLabel="Ngôn ngữ" icon="translate" />
          </Field>
          <div className="flex items-center justify-between gap-3 py-1">
            <div>
              <p className="text-[13px] font-medium text-stone-800">Nhận thông báo</p>
              <p className="text-[12px] text-stone-500">Bình luận, kiểm duyệt và cập nhật ví.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notificationEnabled}
              aria-label="Nhận thông báo"
              onClick={() => setNotificationEnabled((current) => !current)}
              className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                notificationEnabled ? 'bg-primary-600' : 'bg-stone-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  notificationEnabled ? 'translate-x-4' : ''
                }`}
              ></span>
            </button>
          </div>
          <SaveRow
            pending={settingsMutation.isPending}
            success={settingsMutation.isSuccess}
            error={settingsMutation.isError ? getApiErrorMessage(settingsMutation.error) : null}
            onSave={() => settingsMutation.mutate()}
            label="Lưu cài đặt"
          />
        </section>
      </div>
    </div>
  );
}

export function AuthorProfilePage() {
  const { authorId = '' } = useParams();
  const authorQuery = useQuery({
    queryKey: ['author-profile', authorId],
    queryFn: () => getAuthorProfile(authorId),
    enabled: Boolean(authorId)
  });

  if (authorQuery.isLoading) return <LoadingState label="Đang tải trang tác giả..." />;
  if (authorQuery.isError) return <ErrorState error={authorQuery.error} onRetry={() => void authorQuery.refetch()} />;

  const author = authorQuery.data;
  const name = author?.displayName ?? author?.username ?? 'Tác giả';

  return (
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <nav className="flex items-center gap-1.5 text-xs text-stone-500">
        <Link to="/reader" className="hover:text-primary-700 transition-colors">
          <span className="material-symbols-outlined text-[14px] mr-0.5 align-[-2px]">arrow_back</span>
          Khám phá
        </Link>
        <span className="text-stone-300">/</span>
        <span className="text-stone-900 font-semibold">{name}</span>
      </nav>

      <section className={`${card} p-5 lg:p-6 flex flex-col sm:flex-row gap-5`}>
        <ProfileAvatar url={author?.avatarUrl ?? ''} name={name} size="xl" />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] uppercase tracking-wider font-bold text-primary-700 bg-primary-50 border border-primary-200/70 px-2 py-0.5 rounded">
            Tác giả
          </span>
          <h1 className="font-headline-sm text-[24px] leading-snug text-stone-900 font-bold tracking-tight mt-1.5">{name}</h1>
          <div className="flex items-center gap-4 text-[13px] text-stone-500 mt-1">
            <span>@{author?.username}</span>
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-stone-400">group</span>
              <strong className="text-stone-800 font-semibold">{(author?.followersCount ?? 0).toLocaleString('vi-VN')}</strong> người theo dõi
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-stone-400">library_books</span>
              <strong className="text-stone-800 font-semibold">{author?.novels.length ?? 0}</strong> tác phẩm
            </span>
          </div>
          <p className="text-[13px] text-stone-600 leading-relaxed mt-3 max-w-2xl">{author?.bio || 'Tác giả chưa có lời giới thiệu.'}</p>
        </div>
      </section>

      <h2 className="text-[16px] font-semibold text-stone-900 mt-2">Tác phẩm đã xuất bản</h2>
      {!author?.novels.length ? <EmptyState title="Chưa có tác phẩm" description="Tác giả này chưa xuất bản truyện nào." /> : null}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(author?.novels ?? []).map((novel) => (
          <div key={novel.novelId} className={`${card} p-4 flex gap-3.5 hover:border-stone-300 transition-colors`}>
            <Link
              to={`/reader/novels/${novel.novelId}`}
              className="w-14 aspect-[2/3] rounded-lg overflow-hidden bg-stone-900 shrink-0 border border-stone-200"
            >
              <img alt={novel.title} className="w-full h-full object-cover" src={fallbackCover} />
            </Link>
            <div className="min-w-0 flex-1 flex flex-col">
              <Link
                to={`/reader/novels/${novel.novelId}`}
                className="text-[15px] font-semibold text-stone-900 hover:text-primary-700 truncate transition-colors"
              >
                {novel.title}
              </Link>
              {novel.status ? <span className="text-[12px] text-stone-500">{novelStatusLabels[novel.status] ?? novel.status}</span> : null}
              <div className="flex items-center gap-3 text-[12px] text-stone-500 mt-1">
                <span>
                  <strong className="text-stone-800 font-semibold">{novel.chaptersCount ?? 0}</strong> chương
                </span>
                <span>
                  <strong className="text-stone-800 font-semibold">{novel.likesCount ?? 0}</strong> lượt thích
                </span>
              </div>
              <Link to={`/reader/novels/${novel.novelId}`} className={`${primaryButton} self-start mt-2.5`}>
                Xem truyện
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileAvatar({ url, name, size }: { url: string; name: string; size: 'lg' | 'xl' }) {
  const dimension = size === 'xl' ? 'w-24 h-24 text-[32px]' : 'w-16 h-16 text-[24px]';
  if (url) {
    return <img src={url} alt={name} className={`${dimension} rounded-full object-cover border border-stone-200 shrink-0`} />;
  }
  return (
    <span className={`${dimension} rounded-full bg-primary-600 text-white font-semibold flex items-center justify-center shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function SectionHeading({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-[18px] text-primary-600">{icon}</span>
      <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-stone-600">{label}</span>
      {children}
    </div>
  );
}

function SaveRow({
  pending,
  success,
  error,
  onSave,
  label
}: {
  pending: boolean;
  success: boolean;
  error: string | null;
  onSave: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button type="button" onClick={onSave} disabled={pending} className={primaryButton}>
        <span className="material-symbols-outlined text-[16px]">save</span>
        <span>{pending ? 'Đang lưu...' : label}</span>
      </button>
      {success && !pending ? (
        <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700">
          <span className="material-symbols-outlined text-[15px]">check_circle</span>
          Đã lưu
        </span>
      ) : null}
      {error ? <span className="text-[12px] text-rose-600">{error}</span> : null}
    </div>
  );
}

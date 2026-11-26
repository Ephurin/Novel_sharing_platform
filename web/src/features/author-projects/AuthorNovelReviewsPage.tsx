import { useResourceId } from '../../app/ResourceRoute';
import { managedNovelHref } from '../../shared/routes';
import { useQuery } from '@tanstack/react-query';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { Breadcrumbs } from '../../shared/components/Breadcrumbs';
import { authorHomeCrumb } from '../../shared/components/navigation';
import { ErrorState, LoadingState, PermissionState } from '../../shared/components/PageStates';
import { getNovel } from '../novels/novel-api';
import { NovelReviews } from '../reader/NovelReviews';
import { useAuthStore } from '../auth/useAuthStore';

export function AuthorNovelReviewsPage() {
  const novelId = useResourceId('novelId') ?? '';
  const user = useAuthStore(state => state.user);
  const novel = useQuery({ queryKey: ['novel', novelId], queryFn: () => getNovel(novelId), enabled: Boolean(novelId) });
  const canManage = novel.data && (novel.data.authorId === user?.userId || user?.role === 'ADMIN');
  return <>
    <AuthorNavbar />
    <main className="sc-shell-content sc-reviews-main">
      <Breadcrumbs className="mb-4" items={[authorHomeCrumb, { label: novel.data?.title || 'Tác phẩm', to: managedNovelHref('/author/novels/:novelId', { novelId, slug: novel.data?.slug }) }, { label: 'Đánh giá độc giả' }]} />
      <div className="sc-reviews-panel">
        <header className="sc-reviews-header">
          <div><h1 className="text-page-title">Đánh giá độc giả</h1></div>
        </header>
        <div className="sc-reviews-body">
          {novel.isPending && <LoadingState label="Đang tải tác phẩm…" />}
          {novel.isError && <ErrorState title="Không tải được tác phẩm" error={novel.error} onRetry={() => void novel.refetch()} />}
          {novel.data && !canManage && <PermissionState requiredRole="Tác giả của tác phẩm" />}
          {canManage && <NovelReviews key={novelId} novelId={novelId} />}
        </div>
      </div>
    </main>
  </>;
}

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { ErrorState, LoadingState, PermissionState } from '../../shared/components/PageStates';
import { getNovel } from '../novels/novel-api';
import { NovelReviews } from '../reader/NovelReviews';
import { useAuthStore } from '../auth/useAuthStore';

export function AuthorNovelReviewsPage() {
  const { novelId = '' } = useParams();
  const user = useAuthStore(state => state.user);
  const novel = useQuery({ queryKey: ['novel', novelId], queryFn: () => getNovel(novelId), enabled: Boolean(novelId) });
  const canManage = novel.data && (novel.data.authorId === user?.userId || user?.role === 'ADMIN');
  return <>
    <AuthorNavbar />
    <main className="sc-shell-content sc-reviews-main">
      <div className="sc-reviews-panel">
        <header className="sc-reviews-header">
          <Link to={`/author/novels/${novelId}`} className="sc-icon-button" aria-label="Quay lại quản lý tác phẩm" title="Quay lại quản lý tác phẩm">
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          </Link>
          <div><h1 className="text-page">Đánh giá độc giả</h1>{novel.data && <p>{novel.data.title}</p>}</div>
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

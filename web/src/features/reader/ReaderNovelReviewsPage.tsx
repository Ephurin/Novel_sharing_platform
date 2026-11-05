import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { Breadcrumbs } from '../../shared/components/Breadcrumbs';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getReaderNovel } from './reader-api';
import { NovelEngagement } from './NovelEngagement';
import { NovelReviews } from './NovelReviews';
import './reader-detail.css';

export function ReaderNovelReviewsPage({ publicMode = false }: { publicMode?: boolean }) {
  const { novelId = '' } = useParams();
  const novel = useQuery({ queryKey: ['reader-review-novel', novelId], queryFn: () => getReaderNovel(novelId), enabled: Boolean(novelId) });
  const prefix = publicMode ? '/public' : '/reader';
  const content = novel.isPending ? <LoadingState label="Đang tải tác phẩm..." /> : novel.isError ? <ErrorState error={novel.error} onRetry={() => void novel.refetch()} /> : <div className="sc-reader-reviews-page">
    <Breadcrumbs items={[{ label: 'Danh sách truyện', to: prefix }, { label: novel.data.title, to: `${prefix}/novels/${novelId}` }, { label: 'Đánh giá' }]} />
    <header className="sc-reader-reviews-page-header"><h1>Đánh giá truyện {novel.data.title}</h1><Link to={`${prefix}/novels/${novelId}`} className="sc-reader-back-link">Về trang truyện</Link></header>
    <section className="sc-reader-detail-section" aria-label="Viết đánh giá"><NovelEngagement novelId={novelId} authorId={novel.data.authorId} /></section>
    <section className="sc-reader-detail-section" aria-label="Đánh giá độc giả"><NovelReviews novelId={novelId} /></section>
  </div>;
  return publicMode ? <><AuthorNavbar /><main className="sc-shell-content">{content}</main></> : content;
}

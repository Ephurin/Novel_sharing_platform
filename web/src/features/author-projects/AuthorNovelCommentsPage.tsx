import { Group, Pagination, Select, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { EmptyState, ErrorState, LoadingState, PermissionState } from '../../shared/components/PageStates';
import { getNovel, listChapters } from '../novels/novel-api';
import { useAuthStore } from '../auth/useAuthStore';
import { listAuthorComments } from '../reader/comments-api';
import { CommentThread, useRefreshComments } from '../reader/CommentsSection';

export function AuthorNovelCommentsPage() {
  const { novelId = '' } = useParams();
  return <AuthorComments key={novelId} novelId={novelId} />;
}
function AuthorComments({ novelId }: { novelId: string }) {
  const user = useAuthStore(state => state.user);
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const refresh = useRefreshComments();
  const novel = useQuery({ queryKey: ['novel', novelId], queryFn: () => getNovel(novelId), enabled: Boolean(novelId) });
  const canManage = Boolean(novel.data && (novel.data.authorId === user?.userId || user?.role === 'ADMIN'));
  const chapters = useQuery({ queryKey: ['chapters', novelId], queryFn: () => listChapters(novelId), enabled: canManage });
  const scope = filter === 'ALL' || filter === 'NOVEL' ? filter : 'CHAPTER';
  const comments = useQuery({ queryKey: ['author-comments', novelId, user?.userId, filter, page], queryFn: () => listAuthorComments(novelId, page, scope, scope === 'CHAPTER' ? filter : undefined), enabled: canManage });
  const options = [{ value: 'ALL', label: 'Tất cả bình luận' }, { value: 'NOVEL', label: 'Bình luận tác phẩm' }, ...(chapters.data ?? []).map(chapter => ({ value: chapter.chapterId, label: `Chương ${chapter.chapterNumber}: ${chapter.title}` }))];
  return <><AuthorNavbar /><main className="sc-shell-content sc-reviews-main">
    <div className="sc-reviews-panel">
      <header className="sc-reviews-header"><Link to={`/author/novels/${novelId}`} className="sc-icon-button" aria-label="Quay lại quản lý tác phẩm"><span className="material-symbols-outlined" aria-hidden="true">arrow_back</span></Link><div><h1 className="text-page">Bình luận độc giả</h1>{novel.data && <p>{novel.data.title}</p>}</div></header>
      <div className="sc-reviews-body">
        {novel.isPending && <LoadingState label="Đang tải tác phẩm…" />}
        {novel.isError && <ErrorState title="Không tải được tác phẩm" error={novel.error} onRetry={() => void novel.refetch()} />}
        {novel.data && !canManage && <PermissionState requiredRole="Tác giả của tác phẩm" />}
        {canManage && <Stack gap="md">
          <Group justify="space-between" align="flex-end"><Select label="Phạm vi bình luận" aria-label="Phạm vi bình luận" value={filter} data={options} searchable allowDeselect={false} onChange={value => { if (value) { setFilter(value); setPage(1); } }} style={{ flex: '1 1 260px', maxWidth: '100%' }} />{comments.data && <Text size="sm" c="dimmed">{comments.data.totalItems.toLocaleString('vi-VN')} bình luận</Text>}</Group>
          {chapters.isError && <ErrorState title="Không tải được danh sách chương" error={chapters.error} onRetry={() => void chapters.refetch()} />}
          {comments.isPending && <LoadingState label="Đang tải bình luận…" />}
          {comments.isError && <ErrorState title="Không tải được bình luận" error={comments.error} onRetry={() => void comments.refetch()} />}
          {comments.data?.totalItems === 0 && <EmptyState title="Chưa có bình luận" description="Bình luận đã được duyệt trong mục đã chọn sẽ xuất hiện tại đây." />}
          {comments.data?.items.map(comment => <CommentThread key={comment.commentId} comment={comment} onChanged={refresh} showContext />)}
          {comments.data && comments.data.totalPages > 1 && <Group justify="center"><Pagination total={comments.data.totalPages} value={page} onChange={setPage} siblings={0} boundaries={1} /></Group>}
        </Stack>}
      </div>
    </div>
  </main></>;
}

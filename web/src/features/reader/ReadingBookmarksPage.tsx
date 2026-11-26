import { useState } from 'react';
import { Accordion, ActionIcon, Stack } from '@mantine/core';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useReadingBookmarks } from './useReadingBookmarks';
import { readingBookmarkHref, type ReadingBookmarkEntry } from './reader-api';
import './reading-bookmarks.css';

export function ReadingBookmarksList({ novelId, base = '/reader', onOpen }: { novelId?: string; base?: string; onOpen?: () => void }) {
  const bookmarks = useReadingBookmarks(novelId);
  const [failedCovers, setFailedCovers] = useState<Record<string, boolean>>({});
  const [undoEntry, setUndoEntry] = useState<ReadingBookmarkEntry | null>(null);
  const groups = new Map<string, ReadingBookmarkEntry[]>();
  for (const item of bookmarks.items) groups.set(item.novelId, [...(groups.get(item.novelId) ?? []), item]);
  const showUndo = undoEntry && !bookmarks.items.some(item => item.bookmarkId === undoEntry.bookmarkId);
  return <Stack gap="md">
    {bookmarks.pending && <LoadingState label="Đang tải đoạn đã đánh dấu…" />}
    {bookmarks.error && <ErrorState retryLabel="Thử lại" error={bookmarks.error} onRetry={bookmarks.retry} />}
    {showUndo && <div className="sc-reading-bookmark-undo" role="status">
      <span>Đã bỏ đánh dấu một đoạn trong {undoEntry.novelTitle}.</span>
      <button type="button" className="sc-button sc-button-soft" disabled={bookmarks.saving} onClick={() => {
        const target = undoEntry;
        const { bookmarkId: _id, updatedAt: _at, ...draft } = target;
        void bookmarks.save(draft).then((restored) => {
          if (restored) {
            setUndoEntry((prev) => (prev?.bookmarkId === target.bookmarkId ? null : prev));
          }
        });
      }}>Hoàn tác</button>
    </div>}
    {!bookmarks.pending && !bookmarks.error && !bookmarks.items.length && <EmptyState title="Chưa có đoạn nào được đánh dấu" description="Bấm vào một dòng khi đọc để đánh dấu đoạn đó." />}
    {bookmarks.items.length > 0 && <Accordion multiple defaultValue={novelId ? [novelId] : []} className="sc-reading-bookmark-groups">
      {[...groups].map(([id, items]) => <Accordion.Item key={id} value={id}>
        <Accordion.Control><span className="sc-reading-bookmark-book">
          {items[0].coverImageUrl && !failedCovers[id]
            ? <img className="sc-reading-bookmark-cover" src={items[0].coverImageUrl} alt="" loading="lazy" onError={() => setFailedCovers(prev => ({ ...prev, [id]: true }))} />
            : <span className="sc-reading-bookmark-cover sc-reading-bookmark-cover-placeholder" aria-hidden="true"><span className="material-symbols-outlined">auto_stories</span></span>}
          <span>{items[0].novelTitle}<small>{items.length.toLocaleString('vi-VN')} đoạn</small></span>
        </span></Accordion.Control>
        <Accordion.Panel><Stack gap="sm">{items.map(item => {
          const title = item.chapterTitle.replace(/^\s*(?:Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
          return <div key={item.bookmarkId} className="sc-reading-bookmark-entry">
          <Link to={readingBookmarkHref(item, base)} onClick={onOpen} className="sc-reading-bookmark-open">
            <span>{item.chapterNumber ? `Chương ${item.chapterNumber}${title ? ` · ${title}` : ''}` : item.chapterTitle}</span>
            <p title={item.excerpt}>{item.excerpt || `Vị trí đã lưu · đoạn ${item.paragraphIndex + 1}`}</p>
          </Link>
          <ActionIcon variant="light" color="red" size={36} className="sc-reading-bookmark-remove" disabled={bookmarks.saving}
            title="Bỏ đánh dấu" aria-label={`Bỏ đánh dấu ${item.chapterNumber ? `chương ${item.chapterNumber}, ` : ''}${item.excerpt || `đoạn ${item.paragraphIndex + 1}`}`}
            onClick={() => {
              void bookmarks.remove(item.bookmarkId).then((removed) => {
                if (removed) setUndoEntry(item);
              });
            }}><span className="material-symbols-outlined" aria-hidden="true">close</span></ActionIcon>
        </div>; })}</Stack></Accordion.Panel>
      </Accordion.Item>)}
    </Accordion>}
    {bookmarks.more && <div><button type="button" className="sc-button" disabled={bookmarks.loadingMore} onClick={bookmarks.loadMore}>{bookmarks.loadingMore ? 'Đang tải…' : 'Xem thêm'}</button></div>}
  </Stack>;
}

export function ReadingBookmarksPage({ publicMode = false }: { publicMode?: boolean }) {
  const [params] = useSearchParams();
  const novelId = params.get('novelId') || undefined;
  return <section className="sc-reading-bookmarks-page">
    <header className="sc-reading-bookmarks-header">
      <h1 className="text-page-title">Đoạn đã đánh dấu</h1>
      {publicMode && <Link to="/public" className="sc-button">Danh sách truyện</Link>}
    </header>
    {novelId && <p className="sc-reading-bookmarks-filter"><Link to={publicMode ? '/public/bookmarks' : '/reader/bookmarks'} className="sc-review-link">Xem tất cả truyện</Link></p>}
    <ReadingBookmarksList novelId={novelId} base={publicMode ? '/public' : '/reader'} />
  </section>;
}

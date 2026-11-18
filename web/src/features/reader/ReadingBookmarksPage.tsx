import { Accordion, ActionIcon, Button, Group, Stack, Text, Title } from '@mantine/core';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useReadingBookmarks } from './useReadingBookmarks';
import { readingBookmarkHref, type ReadingBookmarkEntry } from './reader-api';
import './reading-bookmarks.css';

export function ReadingBookmarksList({ novelId, base = '/reader', onOpen }: { novelId?: string; base?: string; onOpen?: () => void }) {
  const bookmarks = useReadingBookmarks(novelId);
  const groups = new Map<string, ReadingBookmarkEntry[]>();
  for (const item of bookmarks.items) groups.set(item.novelId, [...(groups.get(item.novelId) ?? []), item]);
  return <Stack gap="md">
    {bookmarks.pending && <LoadingState label="Đang tải bookmark…" />}
    {bookmarks.error && <ErrorState error={bookmarks.error} onRetry={bookmarks.retry} />}
    {!bookmarks.pending && !bookmarks.error && !bookmarks.items.length && <EmptyState title="Chưa có bookmark" description="Bấm vào một dòng khi đọc để lưu bookmark." />}
    {bookmarks.items.length > 0 && <Accordion multiple defaultValue={novelId ? [novelId] : []} className="sc-reading-bookmark-groups">
      {[...groups].map(([id, items]) => <Accordion.Item key={id} value={id}>
        <Accordion.Control><span className="sc-reading-bookmark-book">
          {items[0].coverImageUrl && <img src={items[0].coverImageUrl} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
          <span>{items[0].novelTitle}<small>{items.length} bookmark</small></span>
        </span></Accordion.Control>
        <Accordion.Panel><Stack gap="sm">{items.map(item => {
          const title = item.chapterTitle.replace(/^\s*(?:Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
          return <div key={item.bookmarkId} className="sc-reading-bookmark-entry">
          <Link to={readingBookmarkHref(item, base)} onClick={onOpen} className="sc-reading-bookmark-open">
            <span>{item.chapterNumber ? `Chương ${item.chapterNumber}${title ? ` · ${title}` : ''}` : item.chapterTitle}</span>
            <p title={item.excerpt}>{item.excerpt || `Vị trí đã lưu · đoạn ${item.paragraphIndex + 1}`}</p>
          </Link>
          <ActionIcon variant="light" color="red" size={36} className="sc-reading-bookmark-remove" disabled={bookmarks.saving}
            title="Xóa bookmark" aria-label={`Xóa bookmark ${item.chapterNumber ? `chương ${item.chapterNumber}, ` : ''}${item.excerpt || `đoạn ${item.paragraphIndex + 1}`}`}
            onClick={() => bookmarks.remove(item.bookmarkId)}><span className="material-symbols-outlined" aria-hidden="true">close</span></ActionIcon>
        </div>; })}</Stack></Accordion.Panel>
      </Accordion.Item>)}
    </Accordion>}
    {bookmarks.more && <Button variant="subtle" loading={bookmarks.loadingMore} onClick={bookmarks.loadMore}>Xem thêm bookmark</Button>}
  </Stack>;
}

export function ReadingBookmarksPage({ publicMode = false }: { publicMode?: boolean }) {
  const [params] = useSearchParams();
  const novelId = params.get('novelId') || undefined;
  return <section className="sc-reading-bookmarks-page">
    <Group justify="space-between" mb="lg" gap="sm"><Title order={1}>Bookmark</Title>
      {publicMode && <Button component={Link} to="/public" variant="subtle">Danh sách truyện</Button>}
    </Group>
    {novelId && <Text mb="md"><Link to={publicMode ? '/public/bookmarks' : '/reader/bookmarks'}>Xem tất cả truyện</Link></Text>}
    <ReadingBookmarksList novelId={novelId} base={publicMode ? '/public' : '/reader'} />
  </section>;
}

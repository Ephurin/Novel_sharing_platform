import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { useToast } from '../../shared/components/ToastProvider';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { useAuthStore } from '../auth/useAuthStore';
import { followNovel, getNovelStatistics, setNovelNotifications } from '../novels/novel-statistics-api';
import type { ReaderChapter, ReaderNovel } from './reader-api';
import './reader-detail.css';

const labels: Record<string, string> = { ONGOING: 'Đang ra', COMPLETED: 'Hoàn thành', HIATUS: 'Tạm ngưng' };
const number = (value = 0) => value.toLocaleString('vi-VN');

function lastUpdate(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Chưa có';
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return 'Vừa xong';
  const format = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  if (seconds < 3600) return format.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return format.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 86400 * 30) return format.format(-Math.floor(seconds / 86400), 'day');
  return new Date(value).toLocaleDateString('vi-VN');
}

export function NovelOverview({ novel, chapters, authorLink, notice, actions }: {
  novel: ReaderNovel; chapters: ReaderChapter[]; authorLink?: string; notice?: string | null; actions?: ReactNode;
}) {
  const user = useAuthStore(state => state.user);
  const location = useLocation();
  const client = useQueryClient();
  const { showToast } = useToast();
  const statsKey = ['novel-statistics', novel.novelId, user?.userId ?? 'guest'];
  const statistics = useQuery({ queryKey: statsKey, queryFn: () => getNovelStatistics(novel.novelId) });
  const follow = useMutation({
    mutationFn: () => followNovel(novel.novelId, !statistics.data?.isFollowing),
    onSuccess: async data => {
      client.setQueryData(statsKey, data);
      showToast(data.isFollowing ? 'Đã theo dõi truyện.' : 'Đã bỏ theo dõi truyện.', 'success');
      await client.invalidateQueries({ queryKey: ['reader-library'] });
    },
    onError: error => showToast(getApiErrorMessage(error), 'error')
  });
  const notifications = useMutation({
    mutationFn: () => setNovelNotifications(novel.novelId, !statistics.data?.notificationsEnabled),
    onSuccess: data => {
      client.setQueryData(statsKey, data);
      showToast(data.notificationsEnabled ? 'Đã bật thông báo chương mới.' : 'Đã tắt thông báo chương mới.', 'success');
    },
    onError: error => showToast(getApiErrorMessage(error), 'error')
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const statusCode = novel.serialStatus ?? novel.status ?? 'ONGOING';
  const status = labels[statusCode] ?? 'Đang ra';
  const genres = novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [];
  const stats = statistics.data;
  const score = typeof stats?.ratingAverage === 'number' ? `${stats.ratingAverage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}/10` : 'Chưa có';
  const updated = novel.lastUpdatedAt;
  const shareUrl = `${window.location.origin}/public/novels/${encodeURIComponent(novel.novelId)}`;
  const canFollow = user?.role === 'READER' && user.status === 'ACTIVE' && user.userId !== novel.authorId;
  const catalogPath = location.pathname.startsWith('/reader') ? '/reader' : '/public';
  const reviewsPath = `${catalogPath}/novels/${novel.novelId}/reviews`;
  const followLabel = stats?.isFollowing ? 'Bỏ theo dõi truyện' : 'Theo dõi truyện';

  return <section className="sc-novel-overview sc-reader-overview" aria-label="Thông tin truyện">
    <div className="sc-novel-identity">
      <div className="sc-novel-cover sc-reader-detail-cover">
        {novel.coverImageUrl && !coverFailed ? <img src={novel.coverImageUrl} alt={novel.title} onError={() => setCoverFailed(true)} /> : <span>{novel.title}</span>}
      </div>
      <div className="sc-novel-description">
        <Link to={`${catalogPath}?status=${encodeURIComponent(labels[statusCode] ? statusCode : 'ONGOING')}`} className="sc-reader-status" title={`Tìm truyện ${status.toLocaleLowerCase('vi-VN')}`}>{status}</Link>
        <h1 className="text-page-title">{novel.title}</h1>
        <div className="sc-reader-taxonomy" aria-label="Thể loại và thẻ">
          {!!genres.length && <div className="sc-reader-genres" aria-label="Thể loại">{genres.map(genre => <Link key={genre} to={`${catalogPath}?genre=${encodeURIComponent(genre)}`} className="sc-genre-tag">{genre}</Link>)}</div>}
          {!!novel.tags?.length && <div className="sc-reader-tags" aria-label="Thẻ">{novel.tags.map(tag => <Link key={tag} to={`${catalogPath}?tag=${encodeURIComponent(tag)}`} className="sc-reader-tag">#{tag}</Link>)}</div>}
        </div>
        {novel.authorName && <p className="sc-reader-author">Tác giả: {authorLink ? <Link to={authorLink}>{novel.authorName}</Link> : <span>{novel.authorName}</span>}</p>}
        <div className="sc-reader-primary-actions">
          {actions}
          {canFollow ? <button type="button" className="sc-reader-follow-toggle" disabled={follow.isPending || notifications.isPending || !statistics.isSuccess} aria-label={followLabel} title={followLabel} aria-pressed={stats?.isFollowing ?? false} onClick={() => follow.mutate()} data-testid="reader-follow-novel-btn">
            <Icon name="favorite" />
          </button> : !user ? <Link to="/login" className="sc-reader-follow-toggle" aria-label="Đăng nhập để theo dõi truyện" title="Đăng nhập để theo dõi truyện"><Icon name="favorite" /></Link> : null}
          {canFollow ? <button type="button" className="sc-button sc-button-soft sc-reader-notification-toggle" aria-pressed={stats?.notificationsEnabled ?? false} disabled={notifications.isPending || follow.isPending || !statistics.isSuccess} onClick={() => notifications.mutate()} data-testid="reader-notifications-btn">
            <Icon name={stats?.notificationsEnabled ? 'notifications_active' : 'notifications_none'} /><span className="sc-reader-notification-label"><span className="sc-reader-notification-reserve" aria-hidden="true">Nhận thông báo</span><span>{stats?.notificationsEnabled ? 'Tắt thông báo' : 'Nhận thông báo'}</span></span>
          </button> : !user ? <Link to="/login" className="sc-button sc-button-soft" title="Đăng nhập để nhận thông báo chương mới"><Icon name="notifications_none" />Nhận thông báo</Link> : null}
        </div>
        <nav className="sc-reader-shortcuts" aria-label="Thao tác với truyện">
          <Link to={reviewsPath}><Icon name="star" /><span>Đánh giá</span></Link>
          <a href="#reader-chapters"><Icon name="format_list_bulleted" /><span>Mục lục</span></a>
          <a href="#reader-comments"><Icon name="forum" /><span>Bình luận</span></a>
          <button type="button" onClick={() => { setCopied(false); setCopyError(false); setShareOpen(true); }}><Icon name="share" /><span>Chia sẻ</span></button>
        </nav>
        {notice && <p className="sc-reader-detail-notice" role="status" data-testid="reader-interaction-notice">{notice}</p>}
      </div>
    </div>
    <dl className="sc-novel-metrics sc-reader-detail-metrics" aria-label="Thống kê truyện">
      <div><dt>Cập nhật</dt><dd className="sc-reader-updated"><time dateTime={updated ?? undefined} title={updated ? new Date(updated).toLocaleString('vi-VN') : undefined}>{lastUpdate(updated)}</time></dd></div>
      <div><dt>Tổng chương</dt><dd>{number(chapters.length)}</dd></div>
      <div><dt>Lượt đọc</dt><dd>{number(novel.viewsCount)}</dd></div>
      <div><dt>Đánh giá</dt><dd><Link className="sc-rating-metric" to={reviewsPath}>{statistics.isPending ? '…' : statistics.isError ? '—' : score}<Icon name="chevron_right" /></Link></dd></div>
      <div><dt>Số từ</dt><dd>{number(chapters.reduce((sum, chapter) => sum + (chapter.wordCount ?? 0), 0))}</dd></div>
    </dl>
    {statistics.isError && <button type="button" className="sc-review-link" onClick={() => void statistics.refetch()}>Không tải được thống kê · Thử lại</button>}
    <div className="sc-reader-description-section"><h2>Giới thiệu</h2><ExpandableSynopsis text={novel.synopsis || 'Chưa có lời giới thiệu.'} id={`reader-synopsis-${novel.novelId}`} /></div>
    {novel.authorNote && <div className="sc-reader-description-section sc-author-note"><h2>Lời tác giả</h2><p>{novel.authorNote}</p></div>}
    <AnimatedModal opened={shareOpen} onClose={() => setShareOpen(false)} title="Chia sẻ truyện" centered>
      <div className="sc-reader-share"><p>Chia sẻ đường dẫn công khai để mọi người cùng đọc truyện.</p><input aria-label="Đường dẫn chia sẻ" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} /><button type="button" className="sc-button sc-button-primary" onClick={() => {
        if (!navigator.clipboard) { setCopyError(true); return; }
        void navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setCopyError(false); }).catch(() => setCopyError(true));
      }}>Sao chép đường dẫn</button>{copied && <p role="status">Đã sao chép đường dẫn.</p>}{copyError && <p role="status">Hãy chọn đường dẫn phía trên và sao chép.</p>}</div>
    </AnimatedModal>
  </section>;
}

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function ExpandableSynopsis({ text, id }: { text: string; id: string }) {
  const element = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [height, setHeight] = useState<number>();
  const reduce = useReducedMotion();
  useLayoutEffect(() => setExpanded(false), [text]);
  useLayoutEffect(() => {
    const paragraph = element.current;
    if (!paragraph) return;
    const measure = () => {
      if (!expanded) setOverflows(paragraph.scrollHeight > paragraph.clientHeight + 1);
      setHeight(paragraph.getBoundingClientRect().height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [text, expanded]);
  return <><motion.div initial={false} animate={{ height: height ?? 'auto' }} style={{ overflow: 'hidden' }} transition={{ duration: reduce ? 0 : .18 }}><p id={id} ref={element} className={expanded ? undefined : 'sc-reader-synopsis-collapsed'}>{text}</p></motion.div>{overflows && <button type="button" className="sc-reader-synopsis-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? 'Ẩn bớt' : 'Xem thêm'}</button>}</>;
}

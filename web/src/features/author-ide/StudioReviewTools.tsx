import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { CopyTextButton, FeedbackIcon, FeedbackReveal } from '../../shared/components/ActionFeedback';
import { AnimatedProgress } from '../../shared/components/AnimatedProgress';
import { validPassageNotes } from './studio-annotations';
import { parseAuthorNotes } from '../../shared/lib/author-notes';
import { plainStudioText } from './studio-tools';
import { CHAPTER_CONTENT_MIN, CHAPTER_TITLE_MAX } from '../novels/novel-api';
import type { CharacterProfile, PlotSummary, StoryTimelineEvent } from '../story-context/story-context-types';

const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi').trim();

export function StoryReferenceLookup({ novelId, initialQuery, characters, timeline, summaries, loading, failed, onRetry, onClose }: {
  novelId: string; initialQuery: string; characters: CharacterProfile[]; timeline: StoryTimelineEvent[]; summaries: PlotSummary[];
  loading: boolean; failed: boolean; onRetry: () => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery.slice(0, 200)), [kind, setKind] = useState('all');
  const records = useMemo(() => [
    ...characters.map(item => ({ id: item.characterId, kind: 'character', type: 'Nhân vật', title: item.name, body: [item.description, item.personality, item.notes].filter(Boolean).join('\n\n') })),
    ...timeline.map(item => ({ id: item.eventId, kind: 'event', type: 'Sự kiện', title: item.title, body: item.summary })),
    ...summaries.map(item => ({ id: item.summaryId, kind: 'summary', type: 'Tóm tắt', title: item.arcName || item.chapterTitle || 'Tóm tắt tác phẩm', body: item.summary }))
  ], [characters, timeline, summaries]);
  const matches = records.filter(item => (kind === 'all' || kind === item.kind) && searchable(item.title + ' ' + item.body).includes(searchable(query)));
  return <AnimatedModal opened onClose={onClose} title="Tra cứu cẩm nang" size="lg" centered>
    <div className="sc-reference-filters"><label>Tên hoặc nội dung<input type="search" aria-label="Tìm trong cẩm nang" autoFocus value={query} maxLength={200} onChange={event => setQuery(event.target.value)} placeholder="Tên nhân vật, sự kiện…" /></label><label>Loại<select aria-label="Loại tra cứu" value={kind} onChange={event => setKind(event.target.value)}><option value="all">Tất cả</option><option value="character">Nhân vật</option><option value="event">Sự kiện</option><option value="summary">Tóm tắt</option></select></label></div>
    <div className="sc-reference-results" aria-busy={loading}>
      {loading && <p role="status">Đang tải cẩm nang…</p>}
      {failed && <p role="alert">Không tải được một phần cẩm nang. <button type="button" className="sc-feedback-button" onClick={onRetry}>Thử lại</button></p>}
      {!loading && !failed && !matches.length && <FeedbackReveal><p>{records.length ? 'Không có mục phù hợp. Thử chọn riêng tên nhân vật hoặc một từ khóa ngắn hơn.' : 'Cẩm nang chưa có dữ liệu. Thêm nhân vật hoặc sự kiện để tra cứu ngay khi viết.'}</p></FeedbackReveal>}
      {matches.slice(0, 30).map(item => <FeedbackReveal key={`${item.kind}:${item.id}`} className="sc-reference-card"><span className="text-meta">{item.type}</span><h3>{item.title}</h3><p>{item.body || 'Chưa có mô tả.'}</p><CopyTextButton value={`${item.title}\n\n${item.body}`} label="Sao chép thông tin" /></FeedbackReveal>)}
      {matches.length > 30 && <p className="text-meta">Đang hiện 30/{matches.length} mục. Gõ thêm để thu hẹp kết quả.</p>}
    </div>
    <Link className="sc-feedback-button" to={`/author/context/${novelId}`} target="_blank" rel="noreferrer">Mở cẩm nang đầy đủ ↗</Link>
  </AnimatedModal>;
}

/** Show real draft state. Advisory notes never silently block publishing. */
export function PublishChecklist({ scope, title, content, isVip, price, saved, saving, error, scheduledAt }: {
  scope: string; title: string; content: string; isVip: boolean; price: number; saved: boolean; saving: boolean; error: boolean; scheduledAt?: string;
}) {
  const [notes] = useState(() => { try { const value: unknown = JSON.parse(localStorage.getItem(`storycraft-passage-notes:${scope}`) ?? '[]'); return validPassageNotes(value) ? { open: value.filter(item => !item.resolved).length, unavailable: false } : { open: 0, unavailable: true }; } catch { return { open: 0, unavailable: true }; } });
  const publicNotes = parseAuthorNotes(content), unlinked = publicNotes.all.filter(note => !note.references.length).length;
  // Same measure as the server publish rule (SRS: title < 100 characters, content >= 500 characters).
  const contentLength = content.trim().length;
  const checks = [
    { label: !title.trim() ? 'Chưa đặt tiêu đề chương' : title.length > CHAPTER_TITLE_MAX ? `Tiêu đề chương cần dưới ${CHAPTER_TITLE_MAX + 1} ký tự` : 'Đã có tiêu đề chương', ok: !!title.trim() && title.length <= CHAPTER_TITLE_MAX },
    { label: !plainStudioText(content).trim() ? 'Bản thảo đang trống' : contentLength < CHAPTER_CONTENT_MIN ? `Cần ít nhất ${CHAPTER_CONTENT_MIN} ký tự để xuất bản · hiện có ${contentLength}` : 'Bản thảo đủ độ dài để xuất bản', ok: contentLength >= CHAPTER_CONTENT_MIN },
    { label: error ? 'Lưu thất bại · cần thử lưu lại' : saving ? 'Đang lưu bản nháp…' : saved ? 'Bản nháp đã được lưu' : 'Có thay đổi chưa lưu · hệ thống sẽ lưu trước khi gửi', ok: saved, pending: saving },
    { label: isVip ? `Chương VIP · ${price} Xu${price > 0 ? '' : ' · kiểm tra lại giá'}` : 'Chương miễn phí', ok: !isVip || Number.isFinite(price) && price > 0 },
    { label: notes.unavailable ? 'Không đọc được ghi chú trên trình duyệt này' : notes.open ? `${notes.open} ghi chú chưa xử lý · nên rà lại trước khi gửi` : 'Không có ghi chú đang mở trên trình duyệt này', ok: !notes.unavailable && notes.open === 0 },
    { label: unlinked ? `${unlinked} chú thích cho độc giả chưa gắn vào lời văn · cần gắn lại vị trí` : `${publicNotes.notes.length} chú thích cho độc giả đi cùng phiên bản chương`, ok: unlinked === 0 }
  ];
  return <section className="sc-publish-checklist" aria-label="Kiểm tra trước xuất bản"><h4>Kiểm tra trước xuất bản</h4>
    <ul>{checks.map((item, index) => <li key={index} data-state={item.ok ? 'ok' : item.pending ? 'pending' : 'review'}><FeedbackIcon icon={item.ok ? 'check_circle' : item.pending ? 'sync' : 'info'} busy={item.pending} /><span>{item.label}</span></li>)}</ul>
    {scheduledAt && <p className="text-meta">Đã có lịch đăng: {new Date(scheduledAt).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })} (Asia/Bangkok). Kiểm tra lịch trước khi gửi duyệt ngay.</p>}
    <p className="text-meta">Ghi chú riêng không được xuất bản. Chú thích trong mục “Cho độc giả” đi cùng nội dung chương và chỉ hiện khi phiên bản này được xuất bản. Máy chủ vẫn kiểm tra điều kiện xuất bản.</p>
  </section>;
}

export function TextComparison({ before, after, beforeLabel = 'Đoạn gốc', afterLabel = 'Đề xuất' }: { before: string; after: string; beforeLabel?: string; afterLabel?: string }) {
  const change = useMemo(() => {
    let start = 0, oldEnd = before.length, newEnd = after.length;
    while (start < oldEnd && start < newEnd && before[start] === after[start]) start++;
    while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
    // Keep emoji pairs inside one text node when marking the changed portion.
    const splitsPair = (text: string, at: number) => text.charCodeAt(at - 1) >= 0xD800 && text.charCodeAt(at - 1) <= 0xDBFF && text.charCodeAt(at) >= 0xDC00 && text.charCodeAt(at) <= 0xDFFF;
    if (splitsPair(before, start) || splitsPair(after, start)) start--;
    if (splitsPair(before, oldEnd)) oldEnd++;
    if (splitsPair(after, newEnd)) newEnd++;
    return { start, oldEnd, newEnd };
  }, [before, after]);
  return <div className="sc-text-comparison">{([{ label: beforeLabel, text: before, end: change.oldEnd }, { label: afterLabel, text: after, end: change.newEnd }]).map((item, index) => <section key={index}><h3>{item.label}</h3><div className="sc-comparison-prose">{item.text ? <>{item.text.slice(0, change.start)}<mark>{item.text.slice(change.start, item.end)}</mark>{item.text.slice(item.end)}</> : <span className="text-meta">Không có văn bản tại vị trí chèn.</span>}</div><CopyTextButton value={item.text} label={`Sao chép ${item.label.toLocaleLowerCase('vi')}`} /></section>)}</div>;
}

export function WritingGoalFeedback({ words, goal }: { words: number; goal: number }) {
  return <FeedbackReveal className="sc-writing-goal-summary"><FeedbackIcon icon={words >= goal ? 'task_alt' : 'edit_note'} /><span>{words >= goal ? 'Đã đạt mục tiêu chương' : `Còn ${Math.max(0, goal - words).toLocaleString('vi-VN')} từ để đạt mục tiêu`}</span><AnimatedProgress value={Math.min(100, words / goal * 100)} label={`${words.toLocaleString('vi-VN')}/${goal.toLocaleString('vi-VN')} từ`} /></FeedbackReveal>;
}

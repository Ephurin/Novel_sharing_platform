import { useEffect, useRef, useState } from 'react';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { AnimatedProgress } from '../../shared/components/AnimatedProgress';
import { getChapter } from '../novels/novel-api';
import type { Chapter } from '../novels/novel-types';
import { findText, plainStudioText } from './studio-tools';
import { passageAnchor, type TextAnchor } from './studio-annotations';

export type ChapterSearchHit = { chapterId: string; title: string; chapterNumber: number; anchor: TextAnchor; excerpt: string };
const RESULT_LIMIT = 300;
export function StudioNovelSearch({ opened, chapters, activeChapterId, content, onClose, onNavigate }: {
  opened: boolean; chapters: Chapter[]; activeChapterId: string; content: string; onClose: () => void; onNavigate: (hit: ChapterSearchHit) => void;
}) {
  const [query, setQuery] = useState(''), [caseSensitive, setCaseSensitive] = useState(false), [wholeWord, setWholeWord] = useState(false);
  const [hits, setHits] = useState<ChapterSearchHit[]>([]), [errors, setErrors] = useState<string[]>([]), [running, setRunning] = useState(false), [processed, setProcessed] = useState(0), [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false), [stopped, setStopped] = useState(false), [truncated, setTruncated] = useState(false);
  const [searchedTerm, setSearchedTerm] = useState('');
  const controller = useRef<AbortController | null>(null), pending = useRef<ChapterSearchHit | null>(null), resultRef = useRef<HTMLElement>(null);
  const latestContent = useRef(content); latestContent.current = content;
  useEffect(() => { if (!opened) { controller.current?.abort(); setRunning(false); } return () => controller.current?.abort(); }, [opened]);
  const search = async () => {
    if (!query.trim() || running) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    const term = query.trim(), list = [...chapters], collected: ChapterSearchHit[] = [], failures: string[] = []; let next = 0, completed = 0, capped = false;
    setRunning(true); setProcessed(0); setTotal(list.length); setHits([]); setErrors([]); setSearched(true); setSearchedTerm(term); setStopped(false); setTruncated(false);
    const worker = async () => {
      while (!request.signal.aborted && next < list.length) {
        const chapter = list[next++];
        try {
          const data = chapter.chapterId === activeChapterId ? null : await getChapter(chapter.chapterId, request.signal);
          if (request.signal.aborted) return;
          const text = (data ? data.draft?.content ?? data.content : latestContent.current) ?? '';
          const result = findText(text, term, caseSensitive, wholeWord, RESULT_LIMIT + 1);
          if (result.truncated) capped = true;
          for (const match of result.matches) {
            if (collected.length >= RESULT_LIMIT) { capped = true; break; }
            const anchor = passageAnchor(text, match.start, match.end); if (!anchor) continue;
            collected.push({ chapterId: chapter.chapterId, title: data?.draft?.title ?? data?.title ?? chapter.title, chapterNumber: chapter.chapterNumber, anchor, excerpt: plainStudioText(text.slice(Math.max(0, match.start - 45), Math.min(text.length, match.end + 80))).replace(/\s+/gu, ' ').trim() });
          }
        } catch { if (request.signal.aborted) return; failures.push(chapter.title); }
        completed++;
        if (!request.signal.aborted) { setProcessed(completed); setErrors([...failures]); setHits([...collected].sort((a,b) => a.chapterNumber - b.chapterNumber || a.anchor.start - b.anchor.start)); setTruncated(capped); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker));
    if (!request.signal.aborted) { setRunning(false); resultRef.current?.focus({ preventScroll: true }); }
  };
  return <AnimatedModal opened={opened} onClose={onClose} title="Tìm xuyên chương" size="lg" centered onCloseAutoFocus={event => { const hit = pending.current; if (hit) { pending.current = null; event.preventDefault(); onNavigate(hit); } }}>
    <p className="text-meta">Chương hiện tại gồm thay đổi đang viết; các chương khác dùng bản nháp trên máy chủ nếu có. Chỉ tìm nội dung, không thay thế hàng loạt.</p>
    <form onSubmit={event => { event.preventDefault(); void search(); }}><label className="sc-reference-search-label">Từ hoặc cụm từ<input autoFocus type="search" aria-label="Tìm trong toàn truyện" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} /></label>
      <div className="sc-studio-tool-row"><label><input type="checkbox" checked={caseSensitive} onChange={event => setCaseSensitive(event.target.checked)} /> Phân biệt hoa/thường</label><label><input type="checkbox" checked={wholeWord} onChange={event => setWholeWord(event.target.checked)} /> Nguyên từ</label><button type="submit" className="sc-feedback-button" disabled={running || !query.trim() || !chapters.length}>{running ? 'Đang tìm…' : 'Tìm toàn truyện'}</button>{running && <button type="button" className="sc-feedback-button" onClick={() => { controller.current?.abort(); setRunning(false); setStopped(true); }}>Dừng tìm</button>}</div>
    </form>
    {searched && <AnimatedProgress value={total ? processed / total * 100 : 0} label={`${processed}/${total} chương đã kiểm tra`} />}
    <section ref={resultRef} tabIndex={-1} className="sc-novel-search-results" aria-label="Kết quả tìm xuyên chương" aria-busy={running}>
      {searched && <p role="status">{hits.length} kết quả cho “{searchedTerm}”{stopped ? ' · Đã dừng, kết quả chưa đầy đủ' : running ? ' · Đang tìm tiếp' : ''}{truncated ? ' · Hiển thị tối đa 300 kết quả; hãy thu hẹp từ khóa' : ''}</p>}
      {!!errors.length && <p role="alert">Không tải được {errors.length} chương: {errors.join(', ')}. Bấm Tìm toàn truyện để thử lại.</p>}
      {!running && searched && !hits.length && !errors.length && !stopped && <p>Không tìm thấy nội dung phù hợp.</p>}
      {hits.map(hit => <button type="button" className="sc-novel-search-hit" key={`${hit.chapterId}:${hit.anchor.start}`} onClick={() => { pending.current = hit; onClose(); }}><strong>Chương {hit.chapterNumber} · {hit.title}</strong><span>{hit.excerpt}</span></button>)}
    </section>
  </AnimatedModal>;
}

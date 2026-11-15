import { useMemo, useState } from 'react';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { FeedbackReveal } from '../../shared/components/ActionFeedback';
import { applyProofIssues, inspectPunctuation, proofRules, type ProofIssue } from './studio-proofreading';

const visibleSpaces = (value: string) => value.replace(/ /g, '·').replace(/\t/g, '⇥');
export function StudioProofreader({ content, disabled, onApply, onClose }: {
  content: string; disabled: boolean; onApply: (before: string, after: string, issues: ProofIssue[]) => void; onClose: () => void;
}) {
  const analysis = useMemo(() => inspectPunctuation(content), [content]);
  const [filter, setFilter] = useState('all'), [ignored, setIgnored] = useState<{ text: string; ids: string[] }>({ text: content, ids: [] });
  const [message, setMessage] = useState('');
  const visible = analysis.issues.filter(issue => (filter === 'all' || issue.rule === filter) && !(ignored.text === content && ignored.ids.includes(issue.id)));
  const apply = (issues: ProofIssue[]) => {
    if (disabled || !issues.length) return;
    try {
      const after = applyProofIssues(content, issues);
      const preserved = ignored.text === content ? analysis.issues.filter(issue => ignored.ids.includes(issue.id)).map(issue => {
        const shift = issues.filter(edit => edit.end <= issue.start).reduce((sum, edit) => sum + edit.replacement.length - edit.original.length, 0);
        return `${issue.rule}:${issue.start + shift}:${issue.end + shift}`;
      }) : [];
      onApply(content, after, issues); setIgnored({ text: after, ids: preserved });
      setMessage(`Đã áp dụng ${issues.length} đề xuất. Dùng Ctrl+Z trong bản thảo để hoàn tác.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không áp dụng được thay đổi.'); }
  };
  return <AnimatedModal opened onClose={onClose} title="Kiểm tra dấu câu & khoảng trắng" size="lg" centered>
    <p className="text-meta">Đây là gợi ý trình bày, không phải kiểm tra ngữ pháp. Không tự sửa văn bản; dấu · biểu thị khoảng trắng trong phần so sánh.</p>
    <div className="sc-studio-tool-row"><label>Loại đề xuất<select aria-label="Loại lỗi trình bày" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Tất cả</option>{Object.entries(proofRules).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><button type="button" className="sc-feedback-button" disabled={disabled || !visible.length} onClick={() => apply(visible)}>Áp dụng các đề xuất đang hiện ({visible.length})</button></div>
    <p role="status" className="sc-feedback-message">{message || `${visible.length} đề xuất đang hiện`}</p>
    {analysis.truncated && <p className="text-meta">Hiển thị tối đa 500 đề xuất mỗi lượt. Kiểm tra lại sau khi xử lý nhóm hiện tại.</p>}
    {!visible.length && <FeedbackReveal><p>{analysis.issues.length ? 'Không còn đề xuất trong bộ lọc này.' : 'Không phát hiện vấn đề thuộc các quy tắc đang kiểm tra.'}</p></FeedbackReveal>}
    <div className="sc-proof-results">{visible.map(issue => <article key={issue.id} className="sc-proof-issue">
      <strong>{proofRules[issue.rule]}</strong><p className="sc-proof-context">…{content.slice(Math.max(0, issue.start - 35), issue.start).replace(/\s+/gu, ' ')}<mark>{visibleSpaces(issue.original)}</mark>{content.slice(issue.end, issue.end + 35).replace(/\s+/gu, ' ')}…</p>
      <p className="text-meta">Thay <code>{visibleSpaces(issue.original)}</code> bằng <code>{issue.replacement ? visibleSpaces(issue.replacement) : '(xóa khoảng trắng)'}</code></p>
      <div className="sc-studio-tool-row"><button type="button" className="sc-feedback-button" disabled={disabled} onClick={() => apply([issue])}>Áp dụng đề xuất</button><button type="button" className="sc-feedback-button" onClick={() => setIgnored(current => ({ text: content, ids: [...(current.text === content ? current.ids : []), issue.id] }))}>Bỏ qua đề xuất</button></div>
    </article>)}</div>
  </AnimatedModal>;
}

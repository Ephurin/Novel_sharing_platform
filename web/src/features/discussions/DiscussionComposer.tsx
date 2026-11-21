import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBold, IconItalic, IconLink } from '@tabler/icons-react';
import { AnimatedModal } from '../../shared/components/AnimatedModal';

const SAFE_PROTOCOLS = /^https?:$/;
const TOKEN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+)/g;

function isSafeUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url) || /[\s<>\\]/.test(url)) return false;
  try { return SAFE_PROTOCOLS.test(new URL(url).protocol); } catch { return false; }
}

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(line)) !== null) {
    if (match.index > last) out.push(line.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('[')) {
      const close = token.indexOf('](');
      const label = token.slice(1, close);
      const href = token.slice(close + 2, -1);
      out.push(isSafeUrl(href)
        ? <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{label}</a>
        : <span key={key}>{token}</span>);
    } else if (/^https?:\/\//.test(token)) {
      out.push(isSafeUrl(token)
        ? <a key={key} href={token} target="_blank" rel="noopener noreferrer nofollow">{token}</a>
        : <span key={key}>{token}</span>);
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** Renders the server-supported subset only (bold, italic, http(s) links). No HTML injection. */
export function DiscussionBody({ text }: { text: string }) {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className="forum-prose sc-discussion-body">
      {paragraphs.map((paragraph, index) => <p key={index}>
        {paragraph.split('\n').map((line, lineIndex) => <span key={lineIndex}>
          {lineIndex > 0 && '\n'}
          {renderInline(line, `line-${lineIndex}`)}
        </span>)}
      </p>)}
    </div>
  );
}

type DiscussionComposerProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  maxLength?: number;
  minRows?: number;
  disabled?: boolean;
  placeholder?: string;
  focusRequest?: number;
};

/** Controlled composer shared by topic and comment create/edit forms. */
export function DiscussionComposer({ value, onChange, label, maxLength, minRows = 4, disabled = false, placeholder, focusRequest }: DiscussionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [linkOpened, link] = useDisclosure(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formatError, setFormatError] = useState(false);
  const limit = typeof maxLength === 'number' && maxLength > 0 ? Math.floor(maxLength) : undefined;
  const text = typeof value === 'string' ? value : '';
  const count = text.length;
  const overLimit = limit !== undefined && count > limit;

  useEffect(() => {
    if (!focusRequest || disabled) return;
    setPreview(false);
    const frame = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  const insert = useCallback((before: string, after: string, fallback: string, replacement?: string) => {
    const field = textareaRef.current;
    const start = field?.selectionStart ?? count;
    const end = field?.selectionEnd ?? count;
    const selected = replacement ?? (text.slice(start, end) || fallback);
    const next = `${text.slice(0, start)}${before}${selected}${after}${text.slice(end)}`;
    if (limit !== undefined && next.length > limit) {
      setFormatError(true);
      return false;
    }
    setFormatError(false);
    onChange(next);
    const caretStart = start + before.length;
    const caretEnd = caretStart + selected.length;
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus({ preventScroll: true });
      node.setSelectionRange(caretStart, caretEnd);
    });
    return true;
  }, [count, limit, onChange, text]);

  const openLink = () => {
    const field = textareaRef.current;
    setLinkError(null);
    setLinkLabel(field ? text.slice(field.selectionStart, field.selectionEnd).slice(0, 200) : '');
    setLinkUrl('');
    link.open();
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!isSafeUrl(url)) { setLinkError('Đường dẫn phải bắt đầu bằng http:// hoặc https://.'); return; }
    const href = url.replaceAll('(', '%28').replaceAll(')', '%29');
    const caption = (linkLabel.trim() || url).replace(/[\[\]\r\n]/g, ' ').trim() || href;
    if (!insert('[', `](${href})`, caption, caption)) {
      setLinkError('Không đủ chỗ để chèn liên kết.');
      return;
    }
    setLinkLabel(''); setLinkUrl(''); setLinkError(null); link.close();
  };

  const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormatError(false);
    onChange(event.currentTarget.value);
  };

  return (
    <Stack gap="xs" className="forum-composer">
      <div className="forum-composer-box">
        {preview ? (
          <div className="forum-compose-preview" aria-live="polite" aria-label={`Xem trước ${label}`}>
            {text.trim() ? <DiscussionBody text={text} /> : <Text size="sm" c="dimmed">Chưa có nội dung để xem trước.</Text>}
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            label={label}
            value={text}
            onChange={onTextareaChange}
            autosize
            minRows={minRows}
            maxLength={limit}
            disabled={disabled}
            placeholder={placeholder}
            error={overLimit ? 'Nội dung vượt quá giới hạn ký tự.' : undefined}
            classNames={{ input: 'forum-compose-input' }}
          />
        )}
        <div className="forum-compose-toolbar" role="group" aria-label="Định dạng nội dung">
          <ActionIcon type="button" variant="subtle" aria-label="Chữ đậm" title="Chữ đậm" disabled={disabled || preview} onClick={() => insert('**', '**', 'chữ đậm')}>
            <IconBold size={18} aria-hidden="true" />
          </ActionIcon>
          <ActionIcon type="button" variant="subtle" aria-label="Chữ nghiêng" title="Chữ nghiêng" disabled={disabled || preview} onClick={() => insert('*', '*', 'chữ nghiêng')}>
            <IconItalic size={18} aria-hidden="true" />
          </ActionIcon>
          <ActionIcon type="button" variant="subtle" aria-label="Chèn liên kết" title="Chèn liên kết" disabled={disabled || preview} onClick={openLink}>
            <IconLink size={18} aria-hidden="true" />
          </ActionIcon>
          <Button type="button" size="compact-xs" variant="subtle" aria-pressed={preview} disabled={disabled} onClick={() => setPreview((state) => !state)}>
            {preview ? 'Quay lại soạn' : 'Xem trước'}
          </Button>
          {limit !== undefined ? (
            <span className="forum-compose-count" data-over={overLimit || undefined}>
              {count}/{limit}<span className="forum-compose-count-unit"> ký tự</span>
            </span>
          ) : null}
        </div>
      </div>
      {formatError && <Text size="xs" c="red" role="alert">Nội dung đã gần đến giới hạn ký tự.</Text>}

      <AnimatedModal opened={linkOpened} onClose={link.close} title="Chèn liên kết" size="sm" centered>
        <Stack gap="sm">
          <TextInput label="Nhãn hiển thị" value={linkLabel} onChange={(e) => setLinkLabel(e.currentTarget.value)} maxLength={200} placeholder="Tên liên kết" />
          <TextInput label="Đường dẫn" aria-label="Đường dẫn" value={linkUrl} onChange={(e) => { setLinkUrl(e.currentTarget.value); setLinkError(null); }}
            placeholder="https://" error={linkError} required withAsterisk description="Chỉ chấp nhận http:// hoặc https://" />
          <Group justify="flex-end">
            <Button type="button" size="xs" variant="default" onClick={link.close}>Huỷ</Button>
            <Button type="button" size="xs" disabled={!linkUrl.trim()} onClick={applyLink}>Chèn</Button>
          </Group>
        </Stack>
      </AnimatedModal>
    </Stack>
  );
}


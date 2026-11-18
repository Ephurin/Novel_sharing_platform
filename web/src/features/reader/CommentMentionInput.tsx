import { Avatar } from '@mantine/core';
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { EditorContent, type Editor } from '@tiptap/react';
import { useAuthStore } from '../auth/useAuthStore';
import { connections, type Connection } from './social-api';
import { mentionAtCursor } from './useCommentEditor';

export function CommentMentionInput({ editor, trigger, enabled, mentionCount, recipientPicker = false }: {
  editor: Editor | null;
  trigger?: ReturnType<typeof mentionAtCursor>;
  enabled: boolean;
  mentionCount: number;
  recipientPicker?: boolean;
}) {
  const account = useAuthStore(state => state.user?.userId);
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const [highlight, setHighlight] = useState(0);
  const editorId = useId();
  const triggerKey = trigger ? `${trigger.from}:${trigger.to}:${trigger.search}` : '';
  const showMentions = Boolean(account && editing && enabled && triggerKey && triggerKey !== dismissed);
  const mutual = useQuery({
    queryKey: ['connections', account, 'mention', trigger?.search],
    queryFn: () => connections('MUTUAL', trigger?.search),
    enabled: showMentions, retry: false
  });
  const options = mutual.isError ? [] : mutual.data?.items ?? [];
  const highlighted = options.length ? highlight % options.length : 0;
  const listId = `${editorId}-mentions`;
  const { refs, floatingStyles } = useFloating({ open: showMentions, strategy: 'fixed', placement: 'bottom-start',
    middleware: [offset(7), flip({ padding: 8 }), shift({ padding: 8 })], whileElementsMounted: autoUpdate });
  useEffect(() => { setHighlight(0); if (!triggerKey) setDismissed(''); }, [triggerKey]);
  useLayoutEffect(() => {
    if (!showMentions || !editor || !trigger) return;
    const position = trigger.from;
    refs.setReference({
      contextElement: editor.view.dom,
      getBoundingClientRect: () => {
        const rect = editor.view.coordsAtPos(Math.min(position, editor.state.doc.content.size));
        return new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      }
    });
    return () => refs.setReference(null);
  }, [showMentions, editor, triggerKey, refs.setReference]);
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (showMentions) {
      element.setAttribute('aria-controls', listId);
      element.setAttribute('aria-autocomplete', 'list');
      if (options.length) element.setAttribute('aria-activedescendant', `${listId}-${highlighted}`);
    }
    return () => {
      for (const attr of ['aria-controls', 'aria-autocomplete', 'aria-activedescendant']) element.removeAttribute(attr);
    };
  }, [editor, showMentions, listId, highlighted, options.length]);
  useEffect(() => {
    if (showMentions) document.getElementById(`${listId}-${highlighted}`)?.scrollIntoView({ block: 'nearest' });
  }, [showMentions, listId, highlighted, options.length]);
  const chooseMention = (person: Connection) => {
    const range = mentionAtCursor(editor);
    if (!editor || !range || mentionCount >= 30) return;
    const token = `@${person.username}`;
    const marks = (editor.state.storedMarks ?? editor.state.selection.$from.marks()).filter(mark => mark.type.name !== 'commentMention').map(mark => mark.toJSON());
    const next = editor.state.doc.resolve(range.to);
    const after = next.parent.textBetween(next.parentOffset, next.parent.content.size);
    const insert = [{ type: 'text', text: token, marks: [...marks, { type: 'commentMention', attrs: { userId: person.userId, token } }] }];
    if (!after || !/^[\s.,!?;:)\]}]/u.test(after)) insert.push({ type: 'text', text: ' ', marks });
    editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, insert).run();
    setDismissed(triggerKey);
  };
  const menu = showMentions && <div ref={refs.setFloating} style={floatingStyles} className="sc-comment-mention-menu"
    data-private-recipient-menu={recipientPicker || undefined}>
    {options.length === 0 && <p role="status">{mutual.isPending ? 'Đang tìm bạn bè…' : mutual.isError ? 'Không tải được bạn bè' : 'Không có bạn bè phù hợp'}</p>}
    <div id={listId} role="listbox" aria-label={recipientPicker ? 'Chọn bạn nhận tin' : 'Gợi ý bạn bè'}>
      {options.map((person, index) => <div key={person.userId} id={`${listId}-${index}`}
        role="option" aria-selected={index === highlighted} onMouseEnter={() => setHighlight(index)}
        onPointerDown={event => event.preventDefault()} onClick={() => chooseMention(person)}>
        <Avatar size={26} radius="xl" src={person.avatarUrl} aria-hidden="true">{person.username[0]?.toUpperCase()}</Avatar>
        <span>{person.displayName || person.username}<small>@{person.username}</small></span>
      </div>)}
    </div>
  </div>;
  return <div onFocus={() => setEditing(true)} onBlur={() => { setEditing(false); setDismissed(''); }}
        onKeyDownCapture={event => {
          if (!showMentions || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey) return;
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); setDismissed(triggerKey);
          } else if (options.length > 0 && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key) && !event.shiftKey) {
            event.preventDefault(); event.stopPropagation();
            if (event.key === 'Enter' || event.key === 'Tab') chooseMention(options[highlighted]);
            else setHighlight((highlighted + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
          }
        }}>
        <EditorContent editor={editor} />
        {recipientPicker && showMentions ? <FloatingPortal>{menu}</FloatingPortal> : menu}
      </div>;
}

import { useEffect, useState } from 'react';
import { Extension, Mark, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { DOMSerializer, type Node as RichNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { readRichSource, renderSource } from '../author-ide/RichManuscriptEditor';
import type { CommentInput } from './reader-api';

type Mention = NonNullable<CommentInput['mentions']>[number];
const mentionSelector = 'span[data-comment-mention]';
const CommentMention = Mark.create({
  name: 'commentMention',
  inclusive: false,
  addAttributes() {
    return {
      userId: { parseHTML: element => element.dataset.commentMention, renderHTML: attrs => ({ 'data-comment-mention': attrs.userId }) },
      token: { parseHTML: element => element.dataset.mentionToken, renderHTML: attrs => ({ 'data-mention-token': attrs.token }) }
    };
  },
  parseHTML: () => [{ tag: mentionSelector }],
  renderHTML: ({ HTMLAttributes }) => ['span', HTMLAttributes, 0]
});

function sourceHtml(source: string, mentions?: Mention[]) {
  const element = document.createElement('div');
  renderSource(element, source);
  element.lastChild?.remove();
  for (const note of element.querySelectorAll<HTMLElement>('[data-studio-note-source]')) {
    note.replaceWith(document.createTextNode(note.dataset.studioNoteSource ?? ''));
  }
  const parsed = readRichSource(element);
  for (const mention of [...(mentions ?? [])].sort((a, b) => b.start - a.start)) {
    const part = parsed.segments.find(segment => segment.node instanceof Text && segment.start <= mention.start && segment.end >= mention.end);
    const token = source.slice(mention.start, mention.end);
    if (!(part?.node instanceof Text) || !/^@[a-zA-Z0-9_]+$/.test(token)) continue;
    const range = document.createRange();
    range.setStart(part.node, mention.start - part.start);
    range.setEnd(part.node, mention.end - part.start);
    const span = document.createElement('span');
    span.dataset.commentMention = mention.userId;
    span.dataset.mentionToken = token;
    range.surroundContents(span);
  }
  return element.innerHTML;
}

function serialize(doc: RichNode) {
  const element = document.createElement('div');
  element.append(DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content));
  const parsed = readRichSource(element);
  const mentions = Array.from(element.querySelectorAll<HTMLElement>(mentionSelector)).flatMap(span => {
    const start = parsed.offset(span, 0);
    const end = parsed.offset(span, span.childNodes.length);
    const userId = span.dataset.commentMention;
    return userId && parsed.text.slice(start, end) === span.dataset.mentionToken ? [{ userId, start, end }] : [];
  });
  return { content: parsed.text, mentions };
}

export function mentionAtCursor(editor: Editor | null) {
  if (!editor?.state.selection.empty) return null;
  const { $from } = editor.state.selection;
  const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc');
  const match = /(?:^|[\s(\[{“‘"'])@([a-zA-Z0-9_]{0,50})$/.exec(before);
  if (!match) return null;
  const after = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, '\n', '\ufffc');
  const suffix = /^[a-zA-Z0-9_]*/.exec(after)?.[0] ?? '';
  return { from: $from.pos - match[1].length - 1, to: $from.pos + suffix.length, search: match[1] };
}

export function useCommentEditor({ value, mentions, onChange, label, disabled, id, placeholder = 'Chia sẻ cảm nhận về nội dung…' }: {
  value: string; mentions?: Mention[]; onChange: (value: { content: string; mentions: Mention[] }) => void; label: string; disabled: boolean; id: string; placeholder?: string;
}) {
  const [limitReached, setLimitReached] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ blockquote: false, bulletList: false, code: false, codeBlock: false, heading: false,
        horizontalRule: false, link: false, listItem: false, listKeymap: false, orderedList: false, dropcursor: false, gapcursor: false }),
      CommentMention,
      Extension.create({
        name: 'commentLengthLimit',
        addProseMirrorPlugins() {
          return [new Plugin({ filterTransaction: transaction => {
            if (!transaction.docChanged || serialize(transaction.doc).content.length <= 2000) return true;
            setLimitReached(true);
            return false;
          } })];
        }
      })
    ],
    content: sourceHtml(value, mentions),
    editable: !disabled,
    editorProps: {
      attributes: { id, role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', 'data-placeholder': placeholder, class: 'sc-comment-rich-input' },
      transformPastedHTML: html => {
        const template = document.createElement('template');
        template.innerHTML = html;
        for (const span of template.content.querySelectorAll(mentionSelector)) span.removeAttribute('data-comment-mention');
        return template.innerHTML;
      },
      handleKeyDown: (view, event) => {
        if (event.isComposing || !event.key || event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return false;
        event.preventDefault();
        view.dom.closest('form')?.requestSubmit();
        return true;
      }
    },
    onUpdate: ({ editor }) => { setLimitReached(false); onChange(serialize(editor.state.doc)); }
  });
  useEffect(() => {
    if (!editor || serialize(editor.state.doc).content === value) return;
    editor.commands.setContent(sourceHtml(value, mentions), { emitUpdate: false });
    setLimitReached(false);
  }, [editor, value, mentions]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  const formatting = useEditorState({ editor, selector: context => ({
    bold: context.editor?.isActive('bold') ?? false, italic: context.editor?.isActive('italic') ?? false,
    mention: mentionAtCursor(context.editor)
  }) });
  return { editor, formatting, limitReached };
}

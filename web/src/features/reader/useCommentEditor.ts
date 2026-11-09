import { useEffect, useState } from 'react';
import { Extension, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { DOMSerializer, type Node as RichNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { readRichSource, renderSource } from '../author-ide/RichManuscriptEditor';

function sourceHtml(source: string) {
  const element = document.createElement('div');
  renderSource(element, source);
  element.lastChild?.remove();
  for (const note of element.querySelectorAll<HTMLElement>('[data-studio-note-source]')) {
    note.replaceWith(document.createTextNode(note.dataset.studioNoteSource ?? ''));
  }
  return element.innerHTML;
}

function serialize(doc: RichNode) {
  const element = document.createElement('div');
  element.append(DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content));
  return readRichSource(element).text;
}

export function useCommentEditor({ value, onChange, label, disabled, id }: {
  value: string; onChange: (value: string) => void; label: string; disabled: boolean; id: string;
}) {
  const [limitReached, setLimitReached] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ blockquote: false, bulletList: false, code: false, codeBlock: false, heading: false,
        horizontalRule: false, link: false, listItem: false, listKeymap: false, orderedList: false, dropcursor: false, gapcursor: false }),
      Extension.create({
        name: 'commentLengthLimit',
        addProseMirrorPlugins() {
          return [new Plugin({ filterTransaction: transaction => {
            if (!transaction.docChanged || serialize(transaction.doc).length <= 2000) return true;
            setLimitReached(true);
            return false;
          } })];
        }
      })
    ],
    content: sourceHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: { id, role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', 'data-placeholder': 'Chia sẻ cảm nhận về nội dung…', class: 'sc-comment-rich-input' },
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
    if (!editor || serialize(editor.state.doc) === value) return;
    editor.commands.setContent(sourceHtml(value), { emitUpdate: false });
    setLimitReached(false);
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  const formatting = useEditorState({ editor, selector: context => ({
    bold: context.editor?.isActive('bold') ?? false, italic: context.editor?.isActive('italic') ?? false
  }) });
  return { editor, formatting, limitReached };
}

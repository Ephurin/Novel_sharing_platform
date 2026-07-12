import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';
import { Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, List, ListOrdered, Image as ImageIcon, Table as TableIcon } from 'lucide-react';
import useStore from '../store/useStore';

const MenuBar = ({ editor }) => {
  if (!editor) {
    return null;
  }

  const addImage = () => {
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const ToolButton = ({ onClick, isActive, disabled, children, title }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded hover:bg-surface transition-colors ${isActive ? 'bg-surface text-primary' : 'text-text-dim hover:text-text-bright'}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-dim bg-panel/50 backdrop-blur-md sticky top-0 z-10">
      <ToolButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold"
      >
        <Bold size={16} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic"
      >
        <Italic size={16} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Underline"
      >
        <UnderlineIcon size={16} />
      </ToolButton>

      <div className="w-px h-6 bg-dim mx-2"></div>

      <ToolButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 size={16} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={16} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List size={16} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered size={16} />
      </ToolButton>

      <div className="w-px h-6 bg-dim mx-2"></div>

      <ToolButton onClick={addImage} title="Insert Image">
        <ImageIcon size={16} />
      </ToolButton>
      <ToolButton onClick={addTable} title="Insert Table">
        <TableIcon size={16} />
      </ToolButton>
    </div>
  );
};

export default function RichTextEditor() {
  const { text, setText, runAnalysis } = useStore();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: text || '',
    onCreate: ({ editor }) => {
      if (!text) setText(editor.getText());
    },
    onUpdate: ({ editor }) => {
      // Sync Tiptap content to Zustand
      const html = editor.getHTML();
      const plainText = editor.getText();
      // For simplicity we just set plain text to store for analysis, but keeping HTML might be needed if we want full fidelity.
      // Currently backend NER expects plain text. Let's just update the store's text state with plainText so analysis works.
      setText(plainText);
    },
    editorProps: {
      attributes: {
        className: 'prose prose-invert prose-sky max-w-none focus:outline-none min-h-full px-12 py-8',
      },
    },
  });

  // Hotkey to trigger analysis (Ctrl+S or whatever)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        runAnalysis();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runAnalysis]);

  return (
    <div className="flex-1 flex flex-col h-full bg-void overflow-hidden relative">
      <MenuBar editor={editor} />
      <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center">
        {/* The "Paper" effect */}
        <div className="w-full max-w-4xl my-8 bg-panel shadow-2xl rounded-sm border border-dim">
          <EditorContent editor={editor} className="min-h-[800px] text-text-bright" />
        </div>
      </div>
      
      {/* Floating Auto-Save Indicator */}
      <div className="absolute bottom-4 right-8 flex items-center gap-2 text-xs text-text-dim">
        <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
        All changes saved locally
      </div>
    </div>
  );
}

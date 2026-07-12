import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import useStore from '../store/useStore';

export default function MainArea() {
  const { activity, text, setText, runAnalysis } = useStore();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: 'Bắt đầu viết bản nháp của bạn tại đây...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: text || '',
    onCreate: ({ editor }) => {
      if (!text) setText(editor.getText());
    },
    onUpdate: ({ editor }) => {
      setText(editor.getText());
    },
    editorProps: {
      attributes: {
        className: 'prose prose-invert prose-sky max-w-none focus:outline-none min-h-[calc(100vh-100px)] leading-[1.85] text-[#c9cdd6] text-[15px]',
      },
    },
  });

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
    <div className="flex-1 overflow-y-auto p-0 bg-bg0 flex flex-col relative">
      {/* Tab bar */}
      <div className="h-[36px] bg-bg1 border-b border-dim flex items-center px-2 gap-0.5 shrink-0">
        {activity === "story" && (
          <>
            <div className="px-3 h-full flex items-center gap-1.5 border-b-2 border-accent text-text-bright text-xs cursor-pointer">
              <span>📄</span> Bản nháp hiện tại
            </div>
          </>
        )}
        {activity === "timeline" && (
          <div className="px-3 h-full flex items-center gap-1.5 border-b-2 border-accent text-text-bright text-xs">
            📅 Timeline View
          </div>
        )}
        {activity === "entities" && (
          <div className="px-3 h-full flex items-center gap-1.5 border-b-2 border-accent text-text-bright text-xs">
            👤 Entity — Tiêu Viêm
          </div>
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-text-dim px-2">Local draft · auto-saved</span>
      </div>

      {/* Editor area */}
      <div 
        className="flex-1 overflow-y-auto px-[40px] md:px-[80px] py-[40px] max-w-[900px] w-full custom-scrollbar cursor-text"
        onClick={() => editor?.commands.focus()}
      >
        
        {(activity === "story" || activity === "search") && (
          <div className="relative min-h-full w-full">
            <EditorContent editor={editor} />
          </div>
        )}

        {activity === "timeline" && (
          <div>
            <h2 className="text-[18px] font-semibold mb-6 text-text-bright">Story Timeline</h2>
            <div className="text-text-dim">Timeline view integration coming soon...</div>
          </div>
        )}

        {activity === "entities" && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-[52px] h-[52px] rounded-[10px] bg-gradient-to-br from-accent to-purple flex items-center justify-center text-[22px]">🧑</div>
              <div>
                <h1 className="text-[22px] font-bold text-text-bright m-0">Tiêu Viêm</h1>
                <span className="text-xs text-text-dim">Character · Protagonist</span>
              </div>
            </div>
            <div className="text-text-dim">Entity view integration coming soon...</div>
          </div>
        )}

      </div>
    </div>
  );
}

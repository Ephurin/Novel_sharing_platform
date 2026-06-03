import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';
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
    ],
    content: text || '<h1>Chapter 3 — Ô Thản Thành</h1><p>The city gates loomed ahead, iron-wrought and ancient, their surface etched with formations that hummed faintly in the morning air. Tiêu Viêm pulled his robe tighter against the wind sweeping down from the Ember Plains.</p><p>"You\'re certain this is the place?" he muttered, tilting his head toward the jade ring on his finger.</p><p>A dry chuckle emanated from the ring — Yao Lao\'s presence, warm and unhurried. "The Alchemist Association has operated from this city for three hundred years. Certain? Boy, I helped build the east wing."</p><p>Tiêu Viêm exhaled slowly. The crowd around him thickened as merchants, cultivators, and wandering fighters funneled through the checkpoint. Guards in bronze armor scanned faces with practiced boredom. He lowered his gaze and fell into the flow.</p>',
    onUpdate: ({ editor }) => {
      setText(editor.getText());
    },
    editorProps: {
      attributes: {
        className: 'prose prose-invert prose-sky max-w-none focus:outline-none min-h-full leading-[1.85] text-[#c9cdd6] text-[14.5px]',
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
              <span>📄</span> Ch.3 — Ô Thản Thành
              <span className="text-text-dim text-[10px] ml-1">✕</span>
            </div>
            <div className="px-3 h-full flex items-center gap-1.5 text-text-dim text-xs cursor-pointer hover:bg-bg2">
              <span>📄</span> Ch.2 — The Merchant Road
              <span className="text-[10px] ml-1">✕</span>
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
        <span className="text-[11px] text-text-dim px-2">4,102 words · auto-saved</span>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-[80px] py-[40px] max-w-[860px] mx-auto w-full custom-scrollbar">
        
        {(activity === "story" || activity === "search") && (
          <div className="relative">
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

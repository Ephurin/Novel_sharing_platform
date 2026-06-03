import React from 'react';
import useStore from '../store/useStore';
import WikiDrawer from './WikiDrawer';
// We will mock Timeline and Chapter structure for now
import { Folder, Clock, Hash, CheckCircle2 } from 'lucide-react';

function MockChapterStructure() {
  const chapters = [
    { id: 1, title: 'Chương 1: Phế vật vùng biên thùy', status: 'published' },
    { id: 2, "title": "Chương 2: Vạn Kiếm Quy Tông", status: 'published' },
    { id: 3, "title": "Chương 3: Huyết tẩy Tiêu Gia", status: 'draft' },
  ];

  return (
    <div className="p-4 text-sm text-text-dim">
      <h3 className="font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Folder size={16} /> Mục lục truyện
      </h3>
      <ul className="space-y-2">
        {chapters.map(ch => (
          <li key={ch.id} className="flex items-center gap-2 p-2 hover:bg-surface rounded-lg cursor-pointer transition-colors">
            <Hash size={14} className="text-primary/50" />
            <span className="flex-1 truncate">{ch.title}</span>
            {ch.status === 'published' && <CheckCircle2 size={14} className="text-green-500" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MockTimeline() {
  return (
    <div className="p-4 text-sm text-text-dim">
      <h3 className="font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Clock size={16} /> Lịch sử sự kiện (Event History)
      </h3>
      <div className="space-y-4">
        <div className="relative pl-4 border-l border-dim">
          <div className="absolute w-2 h-2 bg-primary rounded-full -left-[4.5px] top-1.5 shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
          <p className="text-xs text-text-dim mb-1">Chương 1</p>
          <p className="text-text-bright">Huyết Sát dẫn Hắc Ma Hội tàn sát Tiêu Gia.</p>
        </div>
        <div className="relative pl-4 border-l border-dim">
          <div className="absolute w-2 h-2 bg-primary/50 rounded-full -left-[4.5px] top-1.5"></div>
          <p className="text-xs text-text-dim mb-1">Chương 1</p>
          <p className="text-text-bright">Lâm Nguyệt Nhi kéo Tiêu Trần chạy trốn.</p>
        </div>
      </div>
    </div>
  );
}

export default function LeftSidebar() {
  const { activeLeftView, drawerOpen } = useStore();

  if (!drawerOpen) return null;

  return (
    <div className="w-80 shrink-0 h-full border-r border-dim bg-panel overflow-y-auto custom-scrollbar flex flex-col relative shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
      {activeLeftView === 'wiki' && <WikiDrawer />}
      {activeLeftView === 'timeline' && <MockTimeline />}
      {activeLeftView === 'chapters' && <MockChapterStructure />}
    </div>
  );
}

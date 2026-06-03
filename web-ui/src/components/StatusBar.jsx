import React from 'react';
import useStore from '../store/useStore';

export default function StatusBar() {
  const { focusMode } = useStore();

  if (focusMode) return null;

  return (
    <div className="h-[24px] bg-[#0a3d62] border-t border-dim flex items-center px-3 gap-4 shrink-0 text-[11px] text-[#90caf9]">
      <span>📖 Đấu Phá Thương Khung</span>
      <span>·</span>
      <span>Ch.3 — Ô Thản Thành</span>
      <span>·</span>
      <span>4,102 words</span>
      <span>·</span>
      <span>✓ Saved</span>
      
      <div className="flex-1" />
      
      <span>AI Context: 4.1k / 128k</span>
      <span>·</span>
      <span className="text-green">● Synced</span>
      <span>·</span>
      <span>UTF-8</span>
    </div>
  );
}

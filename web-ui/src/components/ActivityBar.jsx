import React from 'react';
import useStore from '../store/useStore';

const ACTIVITIES = [
  { id: "story",    icon: "📖", label: "Story" },
  { id: "entities", icon: "👤", label: "Entities" },
  { id: "timeline", icon: "📅", label: "Timeline" },
  { id: "graph",    icon: "🕸",  label: "Graph" },
  { id: "search",   icon: "🔍", label: "Search" },
  { id: "tasks",    icon: "🤖", label: "Tasks" },
  { id: "projects", icon: "📁", label: "Projects" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

export default function ActivityBar() {
  const { activity, setActivity, focusMode, setFocusMode } = useStore();

  if (focusMode) return null;

  return (
    <div className="w-[48px] bg-bg1 border-r border-dim flex flex-col items-center pt-2 gap-0.5 shrink-0">
      {ACTIVITIES.map(a => (
        <button 
          key={a.id} 
          onClick={() => setActivity(a.id)} 
          title={a.label}
          className={`w-[36px] h-[36px] rounded-[6px] border-none cursor-pointer flex items-center justify-center text-[16px] transition-colors ${activity === a.id ? 'bg-bg3 outline outline-1 outline-dim' : 'bg-transparent hover:bg-bg2'}`}
        >
          {a.icon}
        </button>
      ))}
      
      <div className="flex-1" />
      
      <button 
        onClick={() => setFocusMode(true)} 
        title="Focus Mode"
        className="w-[36px] h-[36px] rounded-[6px] border-none cursor-pointer flex items-center justify-center text-[14px] bg-transparent text-text-dim mb-2 hover:text-text-bright transition-colors"
      >
        ⊞
      </button>
    </div>
  );
}

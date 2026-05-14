import React from 'react';
import useStore from '../store/useStore';
import { BookOpen, Play, Maximize2, Minimize2, Sparkles } from 'lucide-react';

const Header = () => {
  const { storyId, runAnalysis, setDrawerOpen, drawerOpen, focusMode, setFocusMode, isAnalyzing } = useStore();

  return (
    <header className="h-[52px] border-b border-dim flex items-center justify-between px-[20px] bg-panel relative z-50 flex-shrink-0">
      {/* Header line glow pseudo-element logic via class */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-sky/30 to-transparent pointer-events-none" />

      <div className="header-left flex items-center gap-[14px]">
        <div className="logo-icon w-[28px] h-[28px] bg-gradient-to-br from-sky to-violet rounded-[6px] flex items-center justify-center text-[12px] font-bold text-white tracking-[-0.5px] shadow-[0_0_16px_rgba(56,189,248,0.3)] shrink-0">
          EP
        </div>
        <h1 className="brand-name text-[15px] font-semibold text-text-bright tracking-[-0.3px]">
          Ephurin <span className="text-sky">Co-Pilot</span>
        </h1>
        <div className="session-badge font-mono text-[9px] font-medium text-text-dim bg-surface border border-dim px-[8px] py-[2px] rounded-[4px] tracking-[0.8px] uppercase">
          ID: {storyId?.toUpperCase() || 'WRITING_SESSION'}
        </div>
      </div>

      <div className="header-right flex items-center gap-[6px]">
        {isAnalyzing && (
          <div className="flex items-center gap-2 mr-2">
            <div className="analyzing-dot w-[6px] h-[6px] rounded-full bg-sky animate-pulse-dot" />
            <span className="text-[9px] font-mono text-sky tracking-[0.5px]">Đang phân tích...</span>
          </div>
        )}

        <button 
          onClick={runAnalysis}
          disabled={isAnalyzing}
          className="btn-header px-[12px] py-[6px] rounded-[6px] text-[11px] font-medium uppercase tracking-[0.3px] border transition-all duration-200 flex items-center gap-2 bg-gradient-to-br from-sky/20 to-violet/15 border-sky/35 text-sky hover:from-sky/30 hover:to-violet/25 hover:shadow-[0_0_20px_rgba(56,189,248,0.2)] disabled:opacity-50"
        >
          <Play size={12} fill="currentColor" /> Analyze
        </button>

        <button 
          onClick={() => setDrawerOpen(!drawerOpen)}
          className={`btn-header px-[12px] py-[6px] rounded-[6px] text-[11px] font-medium uppercase tracking-[0.3px] border transition-all duration-200 flex items-center gap-2 ${
            drawerOpen 
              ? 'bg-surface border-sky/25 text-sky' 
              : 'bg-transparent border-soft text-text-mid hover:bg-surface hover:text-text-bright hover:border-mid'
          }`}
          title="Toggle Lorebook Wiki"
        >
          <BookOpen size={12} /> Wiki
        </button>

        <button 
          onClick={() => setFocusMode(!focusMode)}
          className={`btn-header px-[12px] py-[6px] rounded-[6px] text-[11px] font-medium uppercase tracking-[0.3px] border transition-all duration-200 flex items-center gap-2 ${
            focusMode 
              ? 'bg-surface border-sky/25 text-sky' 
              : 'bg-transparent border-soft text-text-mid hover:bg-surface hover:text-text-bright hover:border-mid'
          }`}
          title="Focus Mode (Ctrl+Shift+F)"
        >
          {focusMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />} Focus
        </button>
      </div>
    </header>
  );
};

export default Header;

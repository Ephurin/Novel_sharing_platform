import React, { useEffect } from 'react';
import useStore from './store/useStore';
import Toolbar from './components/Toolbar';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import MainArea from './components/MainArea';
import AiPanel from './components/AiPanel';
import StatusBar from './components/StatusBar';

function App() {
  const { focusMode, setFocusMode } = useStore();

  // Focus Mode Hotkey: Ctrl+Shift+F
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setFocusMode(!focusMode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, setFocusMode]);

  return (
    <div className="flex flex-col h-screen w-full bg-bg0 text-text-bright font-sans text-[13px] overflow-hidden selection:bg-accent/20">
      
      {/* ── TOOLBAR ── */}
      <Toolbar />

      {/* ── MAIN ROW ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ── ACTIVITY BAR ── */}
        <ActivityBar />

        {/* ── SIDEBAR ── */}
        <Sidebar />

        {/* ── MAIN EDITOR / CONTENT ── */}
        <MainArea />

        {/* ── AI PANEL ── */}
        <AiPanel />

      </div>

      {/* ── STATUS BAR ── */}
      <StatusBar />

      {/* focus mode exit button */}
      {focusMode && (
        <button 
          onClick={() => setFocusMode(false)}
          className="fixed top-3 right-3 bg-bg3 border border-dim text-text-dim rounded-md px-2.5 py-1.5 cursor-pointer text-xs z-[999] hover:text-text-bright hover:border-text-dim transition-colors"
        >
          Exit Focus ⊞
        </button>
      )}

    </div>
  );
}

export default App;

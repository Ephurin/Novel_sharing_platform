import React, { useEffect } from 'react';
import useStore from './store/useStore';
import Header from './components/Header';
import Editor from './components/Editor';
import ChatPanel from './components/ChatPanel';
import WikiDrawer from './components/WikiDrawer';

function App() {
  const { focusMode, setFocusMode, drawerOpen } = useStore();

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
    <div className="flex flex-col h-screen bg-void text-text-bright overflow-hidden font-sans selection:bg-sky/20">
      <Header />

      <main className="flex-1 flex flex-row overflow-hidden relative w-full h-full">
        {/* Left Side: Wiki Drawer (replaces Graph Drawer) */}
        <div 
          className={`h-full border-r border-dim bg-panel transition-[width] duration-500 ease-in-out overflow-hidden ${drawerOpen && !focusMode ? 'w-[320px]' : 'w-0 border-none'}`}
        >
          <WikiDrawer />
        </div>

        {/* Center Side: Editor (Main Focus Area) */}
        <div className="flex-1 min-w-0 flex flex-col bg-void relative">
          <Editor />
        </div>

        {/* Right Side: Chat Panel (Passive, Fixed Width) */}
        {!focusMode && (
          <aside className="w-[280px] shrink-0 border-l border-dim bg-panel flex flex-col h-full z-20">
            <ChatPanel />
          </aside>
        )}
      </main>
    </div>
  );
}

export default App;

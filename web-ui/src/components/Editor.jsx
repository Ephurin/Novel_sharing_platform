import React, { useEffect, useRef, useState, useMemo } from 'react';
import useStore from '../store/useStore';
import EntityPanel from './EntityPanel';
import { Type, Clock, Users, Zap } from 'lucide-react';

const Editor = () => {
  const { text, setText, entities, runAnalysis, isAnalyzing, setSelectedEntity, focusMode, lastAnalyzedAt } = useStore();
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const [showPanel, setShowPanel] = useState(false);
  const [activeEntity, setActiveEntity] = useState(null);
  const [timeSinceLastAnalysis, setTimeSinceLastAnalysis] = useState('');
  
  const editorRef = useRef(null);
  const highlighterRef = useRef(null);
  const timeoutRef = useRef(null);

  // Debounce analysis: 2000ms idle
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      runAnalysis();
    }, 2000);
    return () => clearTimeout(timeoutRef.current);
  }, [text, runAnalysis]);

  // Update time since last analysis
  useEffect(() => {
    if (!lastAnalyzedAt) return;
    const interval = setInterval(() => {
      const seconds = Math.floor((new Date() - new Date(lastAnalyzedAt)) / 1000);
      if (seconds < 60) setTimeSinceLastAnalysis(`${seconds}s trước`);
      else setTimeSinceLastAnalysis(`${Math.floor(seconds / 60)}m trước`);
    }, 1000);
    return () => clearInterval(interval);
  }, [lastAnalyzedAt]);

  const handleInput = (e) => {
    setText(e.target.innerText);
  };

  const handleClick = (e) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const textAround = range.startContainer.textContent || "";
    const offset = range.startOffset;
    
    // Improved entity detection under cursor
    const entity = (entities || []).find(ent => {
      const name = ent.resolved_name || ent.word;
      // This is a simplified check; ideally we'd use exact offsets if we had them perfectly synced
      return textAround.substring(Math.max(0, offset - 15), offset + 15).includes(name);
    });

    if (entity) {
      const rect = range.getBoundingClientRect();
      setPanelPos({ x: rect.left, y: rect.bottom + window.scrollY + 8 });
      setActiveEntity(entity);
      setShowPanel(true);
      setSelectedEntity(entity);
    } else {
      setShowPanel(false);
    }
  };

  const stats = useMemo(() => {
    const words = text ? text.trim().split(/\s+/).length : 0;
    const readTime = Math.ceil(words / 200);
    const entityCount = entities ? entities.length : 0;
    return { words, readTime, entityCount };
  }, [text, entities]);

  const renderHighlightedHTML = () => {
    if (!text) return "";
    let html = text;

    // Escaping to prevent XSS
    const div = document.createElement('div');
    div.textContent = html;
    html = div.innerHTML;

    if (!entities || entities.length === 0) return html;

    // Sort by length descending to handle nested matches
    const sorted = [...entities].sort((a, b) => {
      const nameA = a.resolved_name || a.word || "";
      const nameB = b.resolved_name || b.word || "";
      return nameB.length - nameA.length;
    });

    const processed = new Set();
    sorted.forEach(ent => {
      const name = ent.resolved_name || ent.word;
      if (!name || processed.has(name)) return;
      processed.add(name);
      
      const typeClass = ent.entity_type === 'PERSON' ? 'ent-person' : 
                        ent.entity_type === 'LOCATION' ? 'ent-loc' : 
                        ent.entity_type === 'ORG' ? 'ent-org' : '';
      
      const regex = new RegExp(`(${name})`, 'gi');
      html = html.replace(regex, `<span class="ent ${typeClass}">$1</span>`);
    });

    return html;
  };

  return (
    <div className={`relative flex-1 flex flex-col transition-all duration-500 ${focusMode ? 'max-w-4xl mx-auto' : 'w-full'} h-full min-w-0`}>
      {/* Editor Toolbar */}
      <div className="editor-toolbar px-12 lg:px-16 py-3 border-b border-dim flex items-center justify-between shrink-0 bg-void z-20">
        <div className="editor-stats flex items-center gap-6">
          <div className="stat-item font-mono text-[9px] text-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <Type size={10} /> {stats.words} từ
          </div>
          <div className="stat-item font-mono text-[9px] text-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={10} /> {stats.readTime} phút đọc
          </div>
          <div className="stat-item font-mono text-[9px] text-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <Users size={10} /> {stats.entityCount} thực thể
          </div>
        </div>
        
        {lastAnalyzedAt && (
          <div className="stat-item font-mono text-[9px] text-text-dim uppercase tracking-wider flex items-center gap-1.5">
            <Zap size={10} className="text-amber" /> Phân tích lần cuối: {timeSinceLastAnalysis}
          </div>
        )}
      </div>

      <div className="relative flex-1 w-full overflow-hidden flex flex-col">
        {/* Layer 1: Editable Content */}
        <div 
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onClick={handleClick}
          spellCheck={false}
          className="absolute inset-0 p-12 lg:p-20 font-serif text-[18px] leading-[1.9] text-text-bright outline-none whitespace-pre-wrap break-words overflow-y-auto selection:bg-sky/20 caret-sky z-10"
          placeholder="Dòng văn của bạn bắt đầu từ đây..."
          style={{ scrollbarGutter: 'stable' }}
          onScroll={(e) => {
            if (highlighterRef.current) highlighterRef.current.scrollTop = e.target.scrollTop;
          }}
        />

        {/* Layer 2: Highlighter (Behind) */}
        <div 
          ref={highlighterRef}
          className="absolute inset-0 p-12 lg:p-20 font-serif text-[18px] leading-[1.9] text-transparent pointer-events-none whitespace-pre-wrap break-words overflow-y-auto z-0"
          dangerouslySetInnerHTML={{ __html: renderHighlightedHTML() }}
          style={{ scrollbarGutter: 'stable', scrollbarWidth: 'none' }}
        />
      </div>

      {showPanel && activeEntity && (
        <EntityPanel 
          entity={activeEntity} 
          position={panelPos} 
          onClose={() => setShowPanel(false)} 
        />
      )}

      <style>{`
        [contenteditable]:empty:before {
          content: attr(placeholder);
          color: var(--text-dim);
        }
      `}</style>
    </div>
  );
};

export default Editor;

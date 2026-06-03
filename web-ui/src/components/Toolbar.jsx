import React from 'react';
import useStore from '../store/useStore';

export default function Toolbar() {
  const { focusMode, setFocusMode, runAnalysis, isAnalyzing } = useStore();

  if (focusMode) return null;

  return (
    <div className="h-[44px] bg-bg1 border-b border-dim flex items-center px-3 gap-1 shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-3">
        <div className="w-[22px] h-[22px] bg-gradient-to-br from-accent to-purple rounded-[5px] flex items-center justify-center text-[11px] font-bold text-white">
          A
        </div>
        <span className="font-semibold text-text-bright text-[13px]">Antigravity</span>
      </div>

      {/* File group */}
      {["File", "Edit", "View", "AI"].map(g => (
        <button key={g} className="bg-transparent border-none text-text-mid px-2 py-1 rounded cursor-pointer text-xs hover:bg-bg3 transition-colors">
          {g}
        </button>
      ))}

      <div className="flex-1" />

      {/* Format group */}
      {/* Normally these would trigger Tiptap functions. In this mock layout, they are visual only unless wired in RichTextEditor. We will wire them later. */}
      {[["B", "bold"], ["I", "italic"], ["U", "underline"], ["S", "strike"]].map(([l, format]) => (
        <button 
          key={l} 
          className="bg-transparent border-none text-text-mid w-[26px] h-[26px] rounded cursor-pointer flex items-center justify-center hover:bg-bg3 transition-colors"
          style={{
            fontWeight: l === "B" ? "700" : "normal",
            fontStyle: l === "I" ? "italic" : "normal",
            textDecoration: l === "U" ? "underline" : l === "S" ? "line-through" : "none"
          }}
        >
          {l}
        </button>
      ))}
      
      <div className="w-px h-[20px] bg-dim mx-1" />
      
      {["H1", "H2", "H3"].map(h => (
        <button key={h} className="bg-transparent border-none text-text-mid px-1.5 py-1 rounded cursor-pointer text-[11px] hover:bg-bg3 transition-colors">
          {h}
        </button>
      ))}
      
      <div className="w-px h-[20px] bg-dim mx-1" />

      {/* AI actions */}
      {["Analyze", "Rewrite", "Expand", "Summarize"].map(a => (
        <button 
          key={a} 
          onClick={() => a === "Analyze" ? runAnalysis() : null}
          disabled={a === "Analyze" && isAnalyzing}
          className={`border px-2 py-1 rounded cursor-pointer text-[11px] ml-0.5 transition-colors ${
            a === "Analyze" 
              ? isAnalyzing 
                ? "bg-purple/20 border-purple/50 text-purple/70 cursor-wait" 
                : "bg-purple/20 border-purple text-purple hover:bg-purple hover:text-white"
              : "bg-accent-dim border-accent text-accent hover:bg-accent hover:text-white"
          }`}
        >
          {a === "Analyze" && isAnalyzing ? "Analyzing..." : a}
        </button>
      ))}
      
      <div className="w-px h-[20px] bg-dim mx-1" />
      
      <button 
        onClick={() => setFocusMode(true)} 
        className="bg-transparent border-none text-text-mid px-2 py-1 rounded cursor-pointer text-[11px] hover:bg-bg3 transition-colors"
      >
        Focus ⊞
      </button>
    </div>
  );
}

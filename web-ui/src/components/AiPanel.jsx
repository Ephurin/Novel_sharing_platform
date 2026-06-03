import React, { useState } from 'react';
import useStore from '../store/useStore';

const AI_CHAT = [
  { role: "ai", text: "I've analyzed Chapter 3. Strong atmospheric opening — the gate description grounds the reader immediately. One note: Yao Lao's tone shifts between paragraphs 3 and 6. Want me to flag the inconsistency?" },
  { role: "user", text: "Yes, and suggest a continuation for the scene inside the walls." },
  { role: "ai", text: "Flagged: Yao Lao uses 'Boy' in p.3 (casual) but the ring is described as 'warm and unhurried' — consider 'Kid' or 'Young one' for tonal consistency.\n\nContinuation suggestion: Tiêu Viêm could encounter a public auction of a mid-grade pill formula — establishing the economic stakes of alchemy in this city before he approaches the Association." },
];

// Fallback suggestions if none exist
const FALLBACK_SUGGESTIONS = [
  { type: "Hint", label: "No suggestions yet", detail: "Type something and select a character to get AI suggestions." },
];

export default function AiPanel() {
  const { aiOpen, setAiOpen, aiTab, setAiTab, focusMode, suggestions: realSuggestions, isGettingSuggestion, targetCharacter } = useStore();
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState(AI_CHAT);
  
  const displaySuggestions = realSuggestions?.length ? realSuggestions : FALLBACK_SUGGESTIONS;

  const send = () => {
    if (!chatInput.trim()) return;
    setMessages(m => [...m, { role: "user", text: chatInput }]);
    setChatInput("");
    setTimeout(() => setMessages(m => [...m, { role: "ai", text: "Analyzing your request in context of Chapter 3…" }]), 600);
  };

  if (focusMode && !aiOpen) return null; // In focus mode, AI panel might be closed by default unless opened. Actually the draft says in focus mode it only keeps Editor + AI Panel. 
  // Let's stick to the draft: in focus mode, if aiOpen is false, it shows a tiny toggle button.

  if (!aiOpen) {
    return (
      <button 
        onClick={() => setAiOpen(true)} 
        className="w-[14px] bg-bg1 border-none border-l border-dim text-text-dim cursor-pointer text-xs shrink-0 hover:bg-bg2 transition-colors z-10"
      >
        ‹
      </button>
    );
  }

  return (
    <div className="w-[340px] bg-bg1 border-l border-dim flex flex-col shrink-0 relative z-10">
      {/* tabs */}
      <div className="flex border-b border-dim px-1">
        {["chat", "suggestions", "context", "tasks"].map(t => (
          <button 
            key={t} 
            onClick={() => setAiTab(t)}
            className={`flex-1 bg-transparent border-none border-b-2 py-2.5 cursor-pointer text-[11px] capitalize transition-colors ${aiTab === t ? 'border-accent text-text-bright font-semibold' : 'border-transparent text-text-dim hover:text-text-mid font-normal'}`}
          >
            {t}
          </button>
        ))}
        <button onClick={() => setAiOpen(false)} className="bg-transparent border-none text-text-dim cursor-pointer px-2 text-base hover:text-text-bright">
          ›
        </button>
      </div>

      {/* CHAT */}
      {aiTab === "chat" && (
        <>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] text-white ${m.role === "ai" ? 'bg-gradient-to-br from-accent to-purple' : 'bg-bg4'}`}>
                  {m.role === "ai" ? "A" : "U"}
                </div>
                <div className={`max-w-[240px] px-2.5 py-2 rounded-lg text-xs leading-[1.6] whitespace-pre-line text-text-mid border ${m.role === "ai" ? 'bg-bg3 border-dim' : 'bg-accent-dim border-accent'}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="p-2.5 border-t border-dim flex gap-1.5">
            <input 
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)} 
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask about your story…"
              className="flex-1 bg-bg3 border border-dim rounded-md px-2.5 py-1.5 text-text-bright text-xs outline-none focus:border-accent/50 transition-colors"
            />
            <button onClick={send} className="bg-accent border-none text-white rounded-md px-2.5 py-1.5 cursor-pointer text-sm hover:bg-accent/90 transition-colors">
              ↑
            </button>
          </div>
        </>
      )}

      {/* SUGGESTIONS */}
      {aiTab === "suggestions" && (
        <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2 custom-scrollbar">
          {isGettingSuggestion && (
             <div className="text-center text-xs text-text-dim py-4 animate-pulse">
                Đang phân tích gợi ý cho {targetCharacter || "nhân vật"}...
             </div>
          )}
          {!isGettingSuggestion && displaySuggestions.map((s, i) => (
            <div key={i} className="p-3 bg-bg2 border border-dim rounded-lg cursor-pointer hover:border-accent/50 transition-colors">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] bg-accent-dim text-accent px-1.5 py-[1px] rounded-[3px] font-semibold">{s.type || s.category || "Ý Tưởng"}</span>
              </div>
              <div className="font-semibold text-xs text-text-bright mb-1">{s.label || s.title || "Gợi ý cốt truyện"}</div>
              <div className="text-[11px] text-text-dim leading-[1.5]">{s.detail || s.description || s.content || s.text || s}</div>
              <button className="mt-2 bg-accent border-none text-white rounded w-full py-1 cursor-pointer text-[11px] hover:bg-accent/90 transition-colors">
                Apply
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CONTEXT */}
      {aiTab === "context" && (
        <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2 custom-scrollbar">
          {[
            ["Current Chapter", "Ch.3 — Ô Thản Thành · 4,102 words"],
            ["Active Characters", "Tiêu Viêm · Yao Lao"],
            ["Active Locations", "Ô Thản Thành city gates · Market district"],
            ["Recent Events", "Arrived Day 7 · Guild confrontation pending"],
            ["AI Context Usage", "4,102 / 128k tokens used"],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-2.5 bg-bg2 border border-dim rounded-lg">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">{k}</div>
              <div className="text-xs text-text-mid">{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* TASKS */}
      {aiTab === "tasks" && (
        <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 custom-scrollbar">
          {["Extract Entities", "Update Timeline", "Check Plot Holes", "Generate Summary", "Detect Inconsistencies"].map(t => (
            <button key={t} className="bg-bg2 border border-dim text-text-mid rounded-md px-3 py-2.5 cursor-pointer text-xs text-left flex items-center gap-2 hover:bg-bg3 hover:text-text-bright transition-colors">
              <span className="text-sm">▶</span>{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

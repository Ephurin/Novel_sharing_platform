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

const STORY_TREE = [
  { id:"a1", type:"arc",     label:"Arc I — The Ember Plains",  depth:0 },
  { id:"c1", type:"chapter", label:"Ch.1 — Awakening",          depth:1, words:3241 },
  { id:"c2", type:"chapter", label:"Ch.2 — The Merchant Road",  depth:1, words:2887 },
  { id:"c3", type:"chapter", label:"Ch.3 — Ô Thản Thành",       depth:1, words:4102 },
  { id:"a2", type:"arc",     label:"Arc II — The Sealed Tower",  depth:0 },
  { id:"c4", type:"chapter", label:"Ch.4 — Huân Nhi",           depth:1, words:1956 },
  { id:"c5", type:"chapter", label:"Ch.5 — The First Trial",    depth:1, words:0, draft:true },
];

// We will compute ENTITIES dynamically from store.
const TASKS_LIST = [
  { id:"t1", label:"Extract Entities",    status:"idle" },
  { id:"t2", label:"Update Timeline",     status:"running", progress:62 },
  { id:"t3", label:"Check Plot Holes",    status:"done" },
  { id:"t4", label:"Generate Summary",    status:"idle" },
  { id:"t5", label:"Analyze Relationships", status:"done" },
];

export default function Sidebar() {
  const { activity, sidebarOpen, setSidebarOpen, selChapter, setSelChapter, expandedEnts, setExpandedEnts, focusMode, entities } = useStore();

  const groupedEntities = React.useMemo(() => {
    const groups = { "Characters": [], "Locations": [], "Organizations": [], "Items": [], "Others": [] };
    (entities || []).forEach(ent => {
      const type = (ent.entity_type || ent.type || "").toUpperCase();
      const name = ent.name || ent.resolved_name || ent.word;
      if (["PERSON", "PER"].includes(type)) groups["Characters"].push(name);
      else if (["LOCATION", "LOC"].includes(type)) groups["Locations"].push(name);
      else if (["ORGANIZATION", "ORG"].includes(type)) groups["Organizations"].push(name);
      else if (["ITEM", "OBJECT", "WEAPON"].includes(type)) groups["Items"].push(name);
      else groups["Others"].push(name);
    });
    
    // If no entities yet, provide a placeholder or empty list
    const entries = Object.entries(groups).filter(([_, items]) => items.length > 0);
    if (entries.length === 0) return [{ id: "empty", cat: "No Entities Found", items: ["Click Analyze to extract"] }];
    
    return entries.map(([cat, items], i) => ({
      id: `cat_${i}`,
      cat,
      items: [...new Set(items)]
    }));
  }, [entities]);

  if (focusMode) return null;

  if (!sidebarOpen) {
    return (
      <button 
        onClick={() => setSidebarOpen(true)} 
        className="w-[14px] bg-bg1 border-none border-r border-dim text-text-dim cursor-pointer text-xs shrink-0 hover:bg-bg2 transition-colors"
      >
        ›
      </button>
    );
  }

  return (
    <div className="w-[260px] bg-bg1 border-r border-dim flex flex-col shrink-0 overflow-hidden">
      {/* Sidebar header */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between border-b border-dim">
        <span className="font-semibold text-[11px] uppercase tracking-wider text-text-dim">
          {ACTIVITIES.find(a => a.id === activity)?.label}
        </span>
        <button 
          onClick={() => setSidebarOpen(false)} 
          className="bg-transparent border-none text-text-dim cursor-pointer text-sm px-0.5 hover:text-text-bright"
        >
          ‹
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5 custom-scrollbar">
        {/* STORY sidebar */}
        {activity === "story" && STORY_TREE.map(n => (
          <div 
            key={n.id} 
            onClick={() => n.type === "chapter" && setSelChapter(n.id)}
            className={`py-1.5 cursor-pointer flex items-center gap-1.5 rounded mx-1 ${selChapter === n.id ? 'bg-bg3 text-text-bright' : 'bg-transparent text-text-mid hover:bg-bg2'}`}
            style={{ paddingLeft: n.depth ? '28px' : '10px', paddingRight: n.depth ? '24px' : '10px' }}
          >
            {n.type === "arc" ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-dim">{n.label}</span>
            ) : (
              <>
                <span className="text-xs">📄</span>
                <span className="flex-1 text-xs truncate">{n.label}</span>
                {n.draft && <span className="text-[9px] bg-yellow/20 text-yellow px-1 py-0.5 rounded-sm">Draft</span>}
                {n.words > 0 && <span className="text-[10px] text-text-dim">{(n.words/1000).toFixed(1)}k</span>}
              </>
            )}
          </div>
        ))}

        {/* ENTITIES sidebar */}
        {activity === "entities" && groupedEntities.map(e => (
          <div key={e.id}>
            <div 
              onClick={() => setExpandedEnts(expandedEnts.includes(e.id) ? expandedEnts.filter(i => i !== e.id) : [...expandedEnts, e.id])}
              className="px-2.5 py-1.5 flex items-center gap-1.5 cursor-pointer text-text-dim text-[11px] font-bold uppercase tracking-wider hover:text-text-mid"
            >
              <span className="text-[10px] w-3 text-center">{expandedEnts.includes(e.id) ? "▾" : "▸"}</span>{e.cat}
              <span className="ml-auto bg-bg4 rounded-lg px-1.5 text-[10px] text-text-dim">{e.items.length}</span>
            </div>
            {expandedEnts.includes(e.id) && e.items.map((it, idx) => (
              <div key={idx} className="py-1.5 pr-2.5 pl-[26px] color-text-mid cursor-pointer text-xs flex items-center gap-1.5 hover:bg-bg2 hover:text-text-bright">
                <span 
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: e.cat === "Characters" ? "#3b82f6" : e.cat === "Locations" ? "#22c55e" : e.cat === "Organizations" ? "#eab308" : "#a855f7" }}
                />
                {it}
              </div>
            ))}
          </div>
        ))}

        {/* TIMELINE sidebar */}
        {activity === "timeline" && (
          <div className="px-2.5 py-1.5">
            {["All Events", "Chapter Filter", "Character Filter", "Arc Filter"].map(f => (
              <div key={f} className="px-2 py-1.5 text-text-mid cursor-pointer rounded my-0.5 text-xs flex items-center gap-1.5 hover:bg-bg2 hover:text-text-bright">
                <span>⊡</span>{f}
              </div>
            ))}
          </div>
        )}

        {/* TASKS sidebar */}
        {activity === "tasks" && TASKS_LIST.map(t => (
          <div key={t.id} className="py-1.5 px-3 flex items-center gap-2 cursor-pointer mx-1 rounded hover:bg-bg2">
            <span className={`text-[10px] w-2 h-2 rounded-full shrink-0 inline-block ${t.status === "done" ? "bg-green" : t.status === "running" ? "bg-yellow" : "bg-bg4"}`} />
            <span className="flex-1 text-xs text-text-mid truncate">{t.label}</span>
            {t.status === "running" && <span className="text-[10px] text-yellow animate-spin">↻</span>}
            {t.status === "done" && <span className="text-[10px] text-green">✓</span>}
          </div>
        ))}

        {/* SEARCH sidebar */}
        {activity === "search" && (
          <div className="p-2">
            <input 
              placeholder="Search project…" 
              className="w-full bg-bg3 border border-dim rounded px-2 py-1.5 text-text-bright text-xs outline-none focus:border-accent/50 transition-colors"
            />
            <div className="mt-2 text-text-dim text-[11px] py-1 px-0.5">Filters</div>
            {["Chapters", "Characters", "Locations", "Events"].map(f => (
              <div key={f} className="px-2 py-1 text-text-mid text-xs flex items-center gap-1.5 cursor-pointer hover:bg-bg2 rounded">
                <input type="checkbox" defaultChecked className="accent-accent" />{f}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Chapter btn */}
      {activity === "story" && (
        <div className="p-2 border-t border-dim">
          <button className="w-full bg-bg3 border border-dim text-text-mid rounded px-1.5 py-1.5 cursor-pointer text-xs flex items-center justify-center gap-1 hover:text-text-bright hover:border-text-dim transition-colors">
            <span>＋</span> New Chapter
          </button>
        </div>
      )}
    </div>
  );
}

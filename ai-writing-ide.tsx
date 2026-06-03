import { useState } from "react";

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

const ENTITIES = [
  { id:"e1", cat:"Characters", items:["Tiêu Viêm","Huân Nhi","Lão Yao","Nalan Yanran"] },
  { id:"e2", cat:"Locations",  items:["Ô Thản Thành","Ember Plains","The Sealed Tower"] },
  { id:"e3", cat:"Organizations", items:["Alchemist Association","Misty Cloud Sect"] },
  { id:"e4", cat:"Items",      items:["Yao Lao's Ring","Purple Flame","Dou Qi Stone"] },
];

const TIMELINE_EVENTS = [
  { day:"Day 1",  events:["Tiêu Viêm awakens Yao Lao","Discovers Purple Flame affinity"] },
  { day:"Day 3",  events:["Arrives at Merchant Road","First encounter with Huân Nhi"] },
  { day:"Day 7",  events:["Enters Ô Thản Thành","Alchemist Guild confrontation"] },
  { day:"Day 12", events:["Sealed Tower discovered","Nalan Yanran challenge issued"] },
];

const EDITOR_CONTENT = [
  { type:"h1",   text:"Chapter 3 — Ô Thản Thành" },
  { type:"p",    text:"The city gates loomed ahead, iron-wrought and ancient, their surface etched with formations that hummed faintly in the morning air. Tiêu Viêm pulled his robe tighter against the wind sweeping down from the Ember Plains." },
  { type:"p",    text:"\"You're certain this is the place?\" he muttered, tilting his head toward the jade ring on his finger." },
  { type:"p",    text:"A dry chuckle emanated from the ring — Yao Lao's presence, warm and unhurried. \"The Alchemist Association has operated from this city for three hundred years. Certain? Boy, I helped build the east wing.\"" },
  { type:"p",    text:"Tiêu Viêm exhaled slowly. The crowd around him thickened as merchants, cultivators, and wandering fighters funneled through the checkpoint. Guards in bronze armor scanned faces with practiced boredom. He lowered his gaze and fell into the flow." },
  { type:"h2",   text:"Inside the Walls" },
  { type:"p",    text:"The interior of Ô Thản Thành was layered — concentric rings of commerce, craft, and cultivation, each zone marked by the quality of its cobblestones. The outermost ring smelled of spiced meats and fresh dye. Further in, the streets narrowed and the signs above doorways shifted from goods to services: appraisers, formation scribes, pill cultivators." },
  { type:"p",    text:"He had forty gold coins and a ring containing the soul of one of the continent's greatest alchemists. By most metrics, he was well-equipped.", entity:"Yao Lao" },
];

const AI_CHAT = [
  { role:"ai",   text:"I've analyzed Chapter 3. Strong atmospheric opening — the gate description grounds the reader immediately. One note: Yao Lao's tone shifts between paragraphs 3 and 6. Want me to flag the inconsistency?" },
  { role:"user", text:"Yes, and suggest a continuation for the scene inside the walls." },
  { role:"ai",   text:"Flagged: Yao Lao uses 'Boy' in p.3 (casual) but the ring is described as 'warm and unhurried' — consider 'Kid' or 'Young one' for tonal consistency.\n\nContinuation suggestion: Tiêu Viêm could encounter a public auction of a mid-grade pill formula — establishing the economic stakes of alchemy in this city before he approaches the Association." },
];

const SUGGESTIONS = [
  { type:"Plot",       label:"Introduce rival alchemist",   detail:"A younger prodigy at the Association who recognizes Yao Lao's techniques." },
  { type:"Character",  label:"Show Tiêu Viêm's hesitation", detail:"He hasn't told anyone about Yao Lao. A moment of doubt before entering." },
  { type:"Foreshadow", label:"The east wing mention",        detail:"Yao Lao says he helped build it — pay this off when they physically enter." },
];

const TASKS_LIST = [
  { id:"t1", label:"Extract Entities",    status:"idle" },
  { id:"t2", label:"Update Timeline",     status:"running", progress:62 },
  { id:"t3", label:"Check Plot Holes",    status:"done" },
  { id:"t4", label:"Generate Summary",    status:"idle" },
  { id:"t5", label:"Analyze Relationships", status:"done" },
];

// ─── colours ────────────────────────────────────────────────────────────────
const C = {
  bg0:"#0d0f11", bg1:"#141618", bg2:"#1c1e21", bg3:"#242628",
  bg4:"#2c2e32", border:"#2e3035", accent:"#3b82f6",
  accentDim:"#1d3a6e", green:"#22c55e", yellow:"#eab308",
  red:"#ef4444", purple:"#a855f7", text:"#e2e4e8",
  textDim:"#6b7280", textMid:"#9ca3af",
};

const s = (obj) => Object.entries(obj).map(([k,v])=>`${k}:${v}`).join(";");

export default function App() {
  const [activity, setActivity] = useState("story");
  const [selChapter, setSelChapter] = useState("c3");
  const [aiTab, setAiTab] = useState("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState(AI_CHAT);
  const [expandedEnts, setExpandedEnts] = useState(["e1"]);
  const [focusMode, setFocusMode] = useState(false);

  const send = () => {
    if (!chatInput.trim()) return;
    setMessages(m => [...m, { role:"user", text:chatInput }]);
    setChatInput("");
    setTimeout(()=> setMessages(m=>[...m,{role:"ai",text:"Analyzing your request in context of Chapter 3…"}]),600);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",width:"100%",background:C.bg0,color:C.text,fontFamily:"'Inter',system-ui,sans-serif",fontSize:"13px",overflow:"hidden"}}>

      {/* ── TOOLBAR ── */}
      {!focusMode && (
        <div style={{height:"44px",background:C.bg1,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 12px",gap:"4px",flexShrink:0,zIndex:10}}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginRight:"12px"}}>
            <div style={{width:"22px",height:"22px",background:`linear-gradient(135deg,${C.accent},${C.purple})`,borderRadius:"5px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:700,color:"#fff"}}>A</div>
            <span style={{fontWeight:600,color:C.text,fontSize:"13px"}}>Antigravity</span>
          </div>

          {/* File group */}
          {["File","Edit","View","AI"].map(g=>(
            <button key={g} style={{background:"none",border:"none",color:C.textMid,padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"12px"}}>{g}</button>
          ))}

          <div style={{flex:1}}/>

          {/* Format group */}
          {[["B","bold"],["I","italic"],["U","underline"],["S","strike"]].map(([l])=>(
            <button key={l} style={{background:"none",border:"none",color:C.textMid,width:"26px",height:"26px",borderRadius:"4px",cursor:"pointer",fontWeight:l==="B"?"700":l==="I"?"400":"normal",fontStyle:l==="I"?"italic":"normal",textDecoration:l==="U"?"underline":l==="S"?"line-through":"none"}}>{l}</button>
          ))}
          <div style={{width:"1px",height:"20px",background:C.border,margin:"0 4px"}}/>
          {["H1","H2","H3"].map(h=>(
            <button key={h} style={{background:"none",border:"none",color:C.textMid,padding:"3px 6px",borderRadius:"4px",cursor:"pointer",fontSize:"11px"}}>{h}</button>
          ))}
          <div style={{width:"1px",height:"20px",background:C.border,margin:"0 4px"}}/>

          {/* AI actions */}
          {["Rewrite","Expand","Summarize"].map(a=>(
            <button key={a} style={{background:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",marginLeft:"2px"}}>{a}</button>
          ))}
          <div style={{width:"1px",height:"20px",background:C.border,margin:"0 4px"}}/>
          <button onClick={()=>setFocusMode(true)} style={{background:"none",border:"none",color:C.textMid,padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"11px"}}>Focus ⊞</button>
        </div>
      )}

      {/* ── MAIN ROW ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ── ACTIVITY BAR ── */}
        {!focusMode && (
          <div style={{width:"48px",background:C.bg1,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:"8px",gap:"2px",flexShrink:0}}>
            {ACTIVITIES.map(a=>(
              <button key={a.id} onClick={()=>{setActivity(a.id);setSidebarOpen(true);}} title={a.label}
                style={{width:"36px",height:"36px",borderRadius:"6px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",background:activity===a.id?C.bg3:"none",outline:activity===a.id?`1px solid ${C.border}`:"none",transition:"background .15s"}}>
                {a.icon}
              </button>
            ))}
            <div style={{flex:1}}/>
            <button onClick={()=>setFocusMode(f=>!f)} title="Focus Mode"
              style={{width:"36px",height:"36px",borderRadius:"6px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",background:"none",color:C.textDim,marginBottom:"8px"}}>
              {focusMode?"◱":"⊞"}
            </button>
          </div>
        )}

        {/* ── SIDEBAR ── */}
        {sidebarOpen && !focusMode && (
          <div style={{width:"260px",background:C.bg1,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
            {/* Sidebar header */}
            <div style={{padding:"10px 12px 6px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontWeight:600,fontSize:"11px",textTransform:"uppercase",letterSpacing:".08em",color:C.textDim}}>{ACTIVITIES.find(a=>a.id===activity)?.label}</span>
              <button onClick={()=>setSidebarOpen(false)} style={{background:"none",border:"none",color:C.textDim,cursor:"pointer",fontSize:"14px",padding:"0 2px"}}>‹</button>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>

              {/* STORY sidebar */}
              {activity==="story" && STORY_TREE.map(n=>(
                <div key={n.id} onClick={()=>n.type==="chapter"&&setSelChapter(n.id)}
                  style={{padding:`5px ${n.depth?24:10}px 5px ${n.depth?28:10}px`,cursor:"pointer",display:"flex",alignItems:"center",gap:"6px",borderRadius:"4px",margin:"0 4px",background:selChapter===n.id?C.bg3:"transparent",color:selChapter===n.id?C.text:n.type==="arc"?C.textMid:C.textMid}}>
                  {n.type==="arc"
                    ? <span style={{fontSize:"10px",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.textDim}}>{n.label}</span>
                    : <>
                        <span style={{fontSize:"12px"}}>📄</span>
                        <span style={{flex:1,fontSize:"12px",color:selChapter===n.id?C.text:C.textMid}}>{n.label}</span>
                        {n.draft && <span style={{fontSize:"9px",background:C.yellow+"33",color:C.yellow,padding:"1px 4px",borderRadius:"3px"}}>Draft</span>}
                        {n.words>0 && <span style={{fontSize:"10px",color:C.textDim}}>{(n.words/1000).toFixed(1)}k</span>}
                      </>
                  }
                </div>
              ))}

              {/* ENTITIES sidebar */}
              {activity==="entities" && ENTITIES.map(e=>(
                <div key={e.id}>
                  <div onClick={()=>setExpandedEnts(x=>x.includes(e.id)?x.filter(i=>i!==e.id):[...x,e.id])}
                    style={{padding:"6px 10px",display:"flex",alignItems:"center",gap:"6px",cursor:"pointer",color:C.textDim,fontSize:"11px",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>
                    <span style={{fontSize:"10px"}}>{expandedEnts.includes(e.id)?"▾":"▸"}</span>{e.cat}
                    <span style={{marginLeft:"auto",background:C.bg4,borderRadius:"8px",padding:"0 5px",fontSize:"10px",color:C.textDim}}>{e.items.length}</span>
                  </div>
                  {expandedEnts.includes(e.id) && e.items.map(it=>(
                    <div key={it} style={{padding:"5px 10px 5px 26px",color:C.textMid,cursor:"pointer",fontSize:"12px",display:"flex",alignItems:"center",gap:"6px"}}>
                      <span style={{width:"6px",height:"6px",borderRadius:"50%",background:e.id==="e1"?C.accent:e.id==="e2"?C.green:e.id==="e3"?C.yellow:C.purple,flexShrink:0}}/>
                      {it}
                    </div>
                  ))}
                </div>
              ))}

              {/* TIMELINE sidebar */}
              {activity==="timeline" && (
                <div style={{padding:"6px 10px"}}>
                  {["All Events","Chapter Filter","Character Filter","Arc Filter"].map(f=>(
                    <div key={f} style={{padding:"6px 8px",color:C.textMid,cursor:"pointer",borderRadius:"4px",margin:"2px 0",fontSize:"12px",display:"flex",alignItems:"center",gap:"6px"}}>
                      <span>⊡</span>{f}
                    </div>
                  ))}
                </div>
              )}

              {/* TASKS sidebar */}
              {activity==="tasks" && TASKS_LIST.map(t=>(
                <div key={t.id} style={{padding:"7px 12px",display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",margin:"0 4px",borderRadius:"4px"}}>
                  <span style={{fontSize:"10px",width:"8px",height:"8px",borderRadius:"50%",background:t.status==="done"?C.green:t.status==="running"?C.yellow:C.bg4,flexShrink:0,display:"inline-block"}}/>
                  <span style={{flex:1,fontSize:"12px",color:C.textMid}}>{t.label}</span>
                  {t.status==="running"&&<span style={{fontSize:"10px",color:C.yellow}}>↻</span>}
                  {t.status==="done"&&<span style={{fontSize:"10px",color:C.green}}>✓</span>}
                </div>
              ))}

              {/* SEARCH sidebar */}
              {activity==="search" && (
                <div style={{padding:"8px"}}>
                  <input placeholder="Search project…" style={{width:"100%",background:C.bg3,border:`1px solid ${C.border}`,borderRadius:"5px",padding:"6px 8px",color:C.text,fontSize:"12px",outline:"none",boxSizing:"border-box"}}/>
                  <div style={{marginTop:"8px",color:C.textDim,fontSize:"11px",padding:"4px 2px"}}>Filters</div>
                  {["Chapters","Characters","Locations","Events"].map(f=>(
                    <div key={f} style={{padding:"5px 8px",color:C.textMid,fontSize:"12px",display:"flex",alignItems:"center",gap:"6px",cursor:"pointer"}}>
                      <input type="checkbox" defaultChecked style={{accentColor:C.accent}}/>{f}
                    </div>
                  ))}
                </div>
              )}

            </div>

            {/* New Chapter btn */}
            {activity==="story" && (
              <div style={{padding:"8px",borderTop:`1px solid ${C.border}`}}>
                <button style={{width:"100%",background:C.bg3,border:`1px solid ${C.border}`,color:C.textMid,borderRadius:"5px",padding:"6px",cursor:"pointer",fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"4px"}}>
                  <span>＋</span> New Chapter
                </button>
              </div>
            )}
          </div>
        )}

        {/* collapsed sidebar toggle */}
        {!sidebarOpen && !focusMode && (
          <button onClick={()=>setSidebarOpen(true)} style={{width:"14px",background:C.bg1,border:"none",borderRight:`1px solid ${C.border}`,color:C.textDim,cursor:"pointer",fontSize:"12px",flexShrink:0}}>›</button>
        )}

        {/* ── MAIN EDITOR / CONTENT ── */}
        <div style={{flex:1,overflowY:"auto",padding:"0",background:C.bg0,display:"flex",flexDirection:"column"}}>

          {/* Tab bar */}
          <div style={{height:"36px",background:C.bg1,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 8px",gap:"2px",flexShrink:0}}>
            {activity==="story" && (
              <>
                <div style={{padding:"0 12px",height:"100%",display:"flex",alignItems:"center",gap:"6px",borderBottom:`2px solid ${C.accent}`,color:C.text,fontSize:"12px",cursor:"pointer"}}>
                  <span>📄</span> Ch.3 — Ô Thản Thành
                  <span style={{color:C.textDim,fontSize:"10px",marginLeft:"4px"}}>✕</span>
                </div>
                <div style={{padding:"0 12px",height:"100%",display:"flex",alignItems:"center",gap:"6px",color:C.textDim,fontSize:"12px",cursor:"pointer"}}>
                  <span>📄</span> Ch.2 — The Merchant Road
                  <span style={{fontSize:"10px",marginLeft:"4px"}}>✕</span>
                </div>
              </>
            )}
            {activity==="timeline" && (
              <div style={{padding:"0 12px",height:"100%",display:"flex",alignItems:"center",gap:"6px",borderBottom:`2px solid ${C.accent}`,color:C.text,fontSize:"12px"}}>
                📅 Timeline View
              </div>
            )}
            {activity==="entities" && (
              <div style={{padding:"0 12px",height:"100%",display:"flex",alignItems:"center",gap:"6px",borderBottom:`2px solid ${C.accent}`,color:C.text,fontSize:"12px"}}>
                👤 Entity — Tiêu Viêm
              </div>
            )}
            <div style={{flex:1}}/>
            <span style={{fontSize:"11px",color:C.textDim,padding:"0 8px"}}>4,102 words · auto-saved</span>
          </div>

          {/* Editor area */}
          <div style={{flex:1,overflowY:"auto",padding:"40px 80px",maxWidth:"860px",margin:"0 auto",width:"100%"}}>

            {/* STORY/EDITOR */}
            {(activity==="story"||activity==="search") && (
              <div>
                {EDITOR_CONTENT.map((b,i)=>{
                  if(b.type==="h1") return <h1 key={i} style={{fontSize:"26px",fontWeight:700,color:C.text,marginBottom:"20px",letterSpacing:"-.02em"}}>{b.text}</h1>;
                  if(b.type==="h2") return <h2 key={i} style={{fontSize:"18px",fontWeight:600,color:C.text,marginTop:"28px",marginBottom:"12px",letterSpacing:"-.01em"}}>{b.text}</h2>;
                  return (
                    <p key={i} style={{lineHeight:"1.85",color:"#c9cdd6",marginBottom:"16px",fontSize:"14.5px"}}>
                      {b.text.split(/(Tiêu Viêm|Yao Lao|Huân Nhi|Ô Thản Thành)/g).map((part,j)=>
                        ["Tiêu Viêm","Yao Lao","Huân Nhi","Ô Thản Thành"].includes(part)
                          ? <span key={j} style={{borderBottom:`1px dotted ${C.accent}`,color:C.accent,cursor:"pointer"}} title={`Entity: ${part}`}>{part}</span>
                          : part
                      )}
                    </p>
                  );
                })}
                {/* blinking cursor */}
                <div style={{display:"inline-block",width:"2px",height:"18px",background:C.accent,verticalAlign:"middle",animation:"blink 1s step-end infinite"}}/>
              </div>
            )}

            {/* TIMELINE VIEW */}
            {activity==="timeline" && (
              <div>
                <h2 style={{fontSize:"18px",fontWeight:600,marginBottom:"24px",color:C.text}}>Story Timeline</h2>
                {TIMELINE_EVENTS.map((day,i)=>(
                  <div key={i} style={{display:"flex",gap:"20px",marginBottom:"28px"}}>
                    <div style={{width:"72px",flexShrink:0,textAlign:"right",paddingTop:"2px"}}>
                      <span style={{fontSize:"11px",fontWeight:600,color:C.accent,background:C.accentDim,padding:"2px 6px",borderRadius:"4px"}}>{day.day}</span>
                    </div>
                    <div style={{borderLeft:`2px solid ${C.border}`,paddingLeft:"20px",flex:1}}>
                      {day.events.map((ev,j)=>(
                        <div key={j} style={{padding:"8px 12px",background:C.bg2,borderRadius:"6px",border:`1px solid ${C.border}`,marginBottom:"6px",fontSize:"13px",color:C.textMid,position:"relative"}}>
                          <div style={{position:"absolute",left:"-27px",top:"11px",width:"10px",height:"10px",borderRadius:"50%",background:C.accent,border:`2px solid ${C.bg0}`}}/>
                          {ev}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ENTITIES VIEW */}
            {activity==="entities" && (
              <div>
                <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"}}>
                  <div style={{width:"52px",height:"52px",borderRadius:"10px",background:`linear-gradient(135deg,${C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px"}}>🧑</div>
                  <div>
                    <h1 style={{fontSize:"22px",fontWeight:700,color:C.text,margin:0}}>Tiêu Viêm</h1>
                    <span style={{fontSize:"12px",color:C.textDim}}>Character · Protagonist</span>
                  </div>
                  <div style={{marginLeft:"auto",display:"flex",gap:"6px"}}>
                    <button style={{background:C.bg3,border:`1px solid ${C.border}`,color:C.textMid,borderRadius:"5px",padding:"5px 10px",cursor:"pointer",fontSize:"12px"}}>Edit</button>
                  </div>
                </div>
                {[
                  ["Description","A young genius alchemist who lost his talent at age 11, only to have it restored by a mysterious jade ring containing the soul of the legendary alchemist Yao Lao."],
                  ["Aliases","Xiao Yan (alternate romanization)"],
                  ["Attributes","Dou Qi Rank: 7 · Flame Affinity: Purple · Status: Active"],
                  ["Active Relationships","Yao Lao — Mentor · Huân Nhi — Companion · Nalan Yanran — Rival"],
                  ["Recent Events","Arrived at Ô Thản Thành (Day 7) · Challenged the Alchemist Guild · Discovered the sealed tower"],
                ].map(([k,v])=>(
                  <div key={k} style={{marginBottom:"16px",padding:"14px",background:C.bg2,borderRadius:"8px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:"11px",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",color:C.textDim,marginBottom:"6px"}}>{k}</div>
                    <div style={{fontSize:"13px",color:C.textMid,lineHeight:"1.7"}}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* TASKS VIEW */}
            {activity==="tasks" && (
              <div>
                <h2 style={{fontSize:"18px",fontWeight:600,marginBottom:"20px",color:C.text}}>Agent Tasks</h2>
                {TASKS_LIST.map(t=>(
                  <div key={t.id} style={{padding:"14px 16px",background:C.bg2,border:`1px solid ${t.status==="running"?C.yellow:C.border}`,borderRadius:"8px",marginBottom:"8px",display:"flex",alignItems:"center",gap:"12px"}}>
                    <div style={{width:"10px",height:"10px",borderRadius:"50%",background:t.status==="done"?C.green:t.status==="running"?C.yellow:C.bg4,flexShrink:0}}/>
                    <span style={{flex:1,fontSize:"13px",color:C.text}}>{t.label}</span>
                    {t.status==="running" && (
                      <div style={{width:"140px",height:"4px",background:C.bg4,borderRadius:"2px",overflow:"hidden"}}>
                        <div style={{width:`${t.progress}%`,height:"100%",background:C.yellow,borderRadius:"2px"}}/>
                      </div>
                    )}
                    <span style={{fontSize:"11px",color:t.status==="done"?C.green:t.status==="running"?C.yellow:C.textDim,background:t.status==="done"?C.green+"22":t.status==="running"?C.yellow+"22":C.bg4,padding:"2px 7px",borderRadius:"4px"}}>
                      {t.status==="running"?`${t.progress}%`:t.status}
                    </span>
                    {t.status==="idle"&&<button style={{background:C.accent,border:"none",color:"#fff",borderRadius:"4px",padding:"4px 10px",cursor:"pointer",fontSize:"11px"}}>Run</button>}
                  </div>
                ))}
              </div>
            )}

            {/* PROJECTS VIEW */}
            {activity==="projects" && (
              <div>
                <h2 style={{fontSize:"18px",fontWeight:600,marginBottom:"20px",color:C.text}}>Projects</h2>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px"}}>
                  {[
                    {name:"Đấu Phá Thương Khung", genre:"Cultivation / Fantasy", words:"312,450", chapters:24, progress:38},
                    {name:"Tiên Nghịch",            genre:"Xianxia",             words:"84,200",  chapters:8,  progress:12},
                    {name:"Untitled Project 3",     genre:"—",                   words:"0",       chapters:0,  progress:0,  draft:true},
                  ].map((p,i)=>(
                    <div key={i} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"16px",cursor:"pointer"}}>
                      <div style={{width:"36px",height:"36px",borderRadius:"7px",background:`linear-gradient(135deg,${[C.accent,C.purple,C.bg4][i]},${[C.purple,C.green,C.border][i]})`,marginBottom:"10px"}}/>
                      <div style={{fontWeight:600,color:C.text,fontSize:"13px",marginBottom:"4px"}}>{p.name}</div>
                      <div style={{fontSize:"11px",color:C.textDim,marginBottom:"10px"}}>{p.genre}</div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:C.textDim}}>
                        <span>{p.words} words</span><span>{p.chapters} chapters</span>
                      </div>
                      {p.progress>0&&<div style={{marginTop:"8px",height:"3px",background:C.bg4,borderRadius:"2px"}}>
                        <div style={{width:`${p.progress}%`,height:"100%",background:C.accent,borderRadius:"2px"}}/>
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GRAPH placeholder */}
            {activity==="graph" && (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",flexDirection:"column",gap:"12px",color:C.textDim}}>
                <div style={{fontSize:"48px"}}>🕸</div>
                <div style={{fontSize:"15px"}}>Knowledge Graph</div>
                <div style={{fontSize:"12px",maxWidth:"300px",textAlign:"center"}}>Interactive relationship graph for characters, locations, and events. Coming in v1.</div>
              </div>
            )}

            {/* SETTINGS placeholder */}
            {activity==="settings" && (
              <div>
                <h2 style={{fontSize:"18px",fontWeight:600,marginBottom:"20px",color:C.text}}>Settings</h2>
                {[["General","Language, autosave interval, theme"],["Editor","Font size, line height, typewriter mode"],["AI","Model, context window, response style"],["Storage","Cloud sync, export formats"],["Themes","Color scheme, icon set"]].map(([k,v])=>(
                  <div key={k} style={{padding:"14px 16px",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:"8px",marginBottom:"6px",display:"flex",alignItems:"center",cursor:"pointer"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,color:C.text,fontSize:"13px"}}>{k}</div>
                      <div style={{fontSize:"11px",color:C.textDim,marginTop:"2px"}}>{v}</div>
                    </div>
                    <span style={{color:C.textDim}}>›</span>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>

        {/* ── AI PANEL ── */}
        {aiOpen && (
          <div style={{width:"340px",background:C.bg1,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
            {/* tabs */}
            <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,padding:"0 4px"}}>
              {["chat","suggestions","context","tasks"].map(t=>(
                <button key={t} onClick={()=>setAiTab(t)}
                  style={{flex:1,background:"none",border:"none",borderBottom:aiTab===t?`2px solid ${C.accent}`:"2px solid transparent",color:aiTab===t?C.text:C.textDim,padding:"10px 0",cursor:"pointer",fontSize:"11px",fontWeight:aiTab===t?600:400,textTransform:"capitalize"}}>
                  {t}
                </button>
              ))}
              <button onClick={()=>setAiOpen(false)} style={{background:"none",border:"none",color:C.textDim,cursor:"pointer",padding:"0 8px",fontSize:"16px"}}>›</button>
            </div>

            {/* CHAT */}
            {aiTab==="chat" && (
              <>
                <div style={{flex:1,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:"10px"}}>
                  {messages.map((m,i)=>(
                    <div key={i} style={{display:"flex",gap:"8px",flexDirection:m.role==="user"?"row-reverse":"row"}}>
                      <div style={{width:"24px",height:"24px",borderRadius:"50%",background:m.role==="ai"?`linear-gradient(135deg,${C.accent},${C.purple})`:C.bg4,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px"}}>
                        {m.role==="ai"?"A":"U"}
                      </div>
                      <div style={{maxWidth:"240px",padding:"8px 10px",borderRadius:"8px",background:m.role==="ai"?C.bg3:C.accentDim,border:`1px solid ${m.role==="ai"?C.border:C.accent}`,fontSize:"12px",color:C.textMid,lineHeight:"1.6",whiteSpace:"pre-line"}}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{padding:"10px",borderTop:`1px solid ${C.border}`,display:"flex",gap:"6px"}}>
                  <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
                    placeholder="Ask about your story…"
                    style={{flex:1,background:C.bg3,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px 10px",color:C.text,fontSize:"12px",outline:"none"}}/>
                  <button onClick={send} style={{background:C.accent,border:"none",color:"#fff",borderRadius:"6px",padding:"7px 10px",cursor:"pointer",fontSize:"13px"}}>↑</button>
                </div>
              </>
            )}

            {/* SUGGESTIONS */}
            {aiTab==="suggestions" && (
              <div style={{flex:1,overflowY:"auto",padding:"10px",display:"flex",flexDirection:"column",gap:"8px"}}>
                {SUGGESTIONS.map((s,i)=>(
                  <div key={i} style={{padding:"12px",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:"8px",cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"5px"}}>
                      <span style={{fontSize:"10px",background:C.accentDim,color:C.accent,padding:"1px 6px",borderRadius:"3px",fontWeight:600}}>{s.type}</span>
                    </div>
                    <div style={{fontWeight:600,fontSize:"12px",color:C.text,marginBottom:"4px"}}>{s.label}</div>
                    <div style={{fontSize:"11px",color:C.textDim,lineHeight:"1.5"}}>{s.detail}</div>
                    <button style={{marginTop:"8px",background:C.accent,border:"none",color:"#fff",borderRadius:"4px",padding:"4px 10px",cursor:"pointer",fontSize:"11px",width:"100%"}}>Apply</button>
                  </div>
                ))}
              </div>
            )}

            {/* CONTEXT */}
            {aiTab==="context" && (
              <div style={{flex:1,overflowY:"auto",padding:"10px",display:"flex",flexDirection:"column",gap:"8px"}}>
                {[
                  ["Current Chapter","Ch.3 — Ô Thản Thành · 4,102 words"],
                  ["Active Characters","Tiêu Viêm · Yao Lao"],
                  ["Active Locations","Ô Thản Thành city gates · Market district"],
                  ["Recent Events","Arrived Day 7 · Guild confrontation pending"],
                  ["AI Context Usage","4,102 / 128k tokens used"],
                ].map(([k,v])=>(
                  <div key={k} style={{padding:"10px 12px",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:"7px"}}>
                    <div style={{fontSize:"10px",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",color:C.textDim,marginBottom:"4px"}}>{k}</div>
                    <div style={{fontSize:"12px",color:C.textMid}}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* TASKS AI */}
            {aiTab==="tasks" && (
              <div style={{flex:1,overflowY:"auto",padding:"10px",display:"flex",flexDirection:"column",gap:"6px"}}>
                {["Extract Entities","Update Timeline","Check Plot Holes","Generate Summary","Detect Inconsistencies"].map(t=>(
                  <button key={t} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.textMid,borderRadius:"6px",padding:"10px 12px",cursor:"pointer",fontSize:"12px",textAlign:"left",display:"flex",alignItems:"center",gap:"8px"}}>
                    <span style={{fontSize:"14px"}}>▶</span>{t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* collapsed AI panel */}
        {!aiOpen && (
          <button onClick={()=>setAiOpen(true)} style={{width:"14px",background:C.bg1,border:"none",borderLeft:`1px solid ${C.border}`,color:C.textDim,cursor:"pointer",fontSize:"12px",flexShrink:0}}>‹</button>
        )}
      </div>

      {/* ── STATUS BAR ── */}
      {!focusMode && (
        <div style={{height:"24px",background:"#0a3d62",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 12px",gap:"16px",flexShrink:0,fontSize:"11px",color:"#90caf9"}}>
          <span>📖 Đấu Phá Thương Khung</span>
          <span>·</span>
          <span>Ch.3 — Ô Thản Thành</span>
          <span>·</span>
          <span>4,102 words</span>
          <span>·</span>
          <span>✓ Saved</span>
          <div style={{flex:1}}/>
          <span>AI Context: 4.1k / 128k</span>
          <span>·</span>
          <span style={{color:C.green}}>● Synced</span>
          <span>·</span>
          <span>UTF-8</span>
        </div>
      )}

      {/* focus mode exit */}
      {focusMode && (
        <button onClick={()=>setFocusMode(false)}
          style={{position:"fixed",top:"12px",right:"12px",background:C.bg3,border:`1px solid ${C.border}`,color:C.textDim,borderRadius:"6px",padding:"5px 10px",cursor:"pointer",fontSize:"12px",zIndex:999}}>
          Exit Focus ⊞
        </button>
      )}

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:${C.bg4} transparent}`}</style>
    </div>
  );
}

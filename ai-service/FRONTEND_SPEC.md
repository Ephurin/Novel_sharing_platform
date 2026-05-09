# FRONTEND_SPEC.md — Ephurin Co-Pilot UI
> **Dành cho Antigravity Agent** — Đọc file này TRƯỚC khi tạo Implementation Plan.
> Đây là source of truth cho toàn bộ giao diện. Không tự suy luận ngoài spec này.

---

## 0. TÓM TẮT DỰ ÁN

| Mục | Giá trị |
|-----|---------|
| Tên app | Ephurin Co-Pilot |
| Mục đích | AI-assisted writing environment cho tác giả truyện |
| Framework | React + Vite |
| Styling | Tailwind CSS + CSS custom (cho Editor) |
| State | Zustand |
| Icons | Lucide-React |
| Font | Lora (serif, editor) + DM Sans (UI panels) + JetBrains Mono (code/meta) |

---

## 1. DESIGN TOKENS (BẮT BUỘC DÙNG)

```css
:root {
  /* Backgrounds */
  --bg-void:    #04050f;   /* body background */
  --bg-deep:    #070a1a;
  --bg-panel:   #0a0d1f;   /* sidebar panels */
  --bg-surface: #0f1225;   /* cards, inputs */
  --bg-raised:  #141730;   /* hover states, floating panels */

  /* Borders */
  --border-dim:  rgba(255,255,255,0.04);
  --border-soft: rgba(255,255,255,0.08);
  --border-mid:  rgba(255,255,255,0.12);

  /* Accent colors */
  --accent-sky:    #38bdf8;
  --accent-violet: #818cf8;
  --accent-rose:   #fb7185;
  --accent-amber:  #fbbf24;

  /* Text */
  --text-bright: #f1f5f9;
  --text-mid:    #94a3b8;
  --text-dim:    #475569;

  /* Entity highlight */
  --ent-person-bg:     rgba(129,140,248,0.12);
  --ent-person-border: rgba(129,140,248,0.5);
  --ent-loc-bg:        rgba(56,189,248,0.10);
  --ent-loc-border:    rgba(56,189,248,0.45);
  --ent-org-bg:        rgba(251,191,36,0.10);
  --ent-org-border:    rgba(251,191,36,0.40);
}
```

> ❌ KHÔNG dùng màu hardcode trong component. Luôn dùng CSS variable trên.

---

## 2. LAYOUT TỔNG THỂ

```
┌─────────────────────────────────────────────────────────┐
│  HEADER (height: 52px, z-index: 50)                      │
├──────────────┬──────────────────────────┬───────────────┤
│              │                          │               │
│  GRAPH       │        EDITOR            │  CHAT         │
│  DRAWER      │   (flex-1, min-w-0)      │  PANEL        │
│  (w-0/w-260) │                          │  (w-280px)    │
│              │                          │               │
└──────────────┴──────────────────────────┴───────────────┘
```

### Rules cứng:
- **Editor** luôn là vùng `flex-1` — lớn nhất
- **Chat** luôn bên phải, `width: 280px`, không co
- **Graph** là drawer: `width: 0` (ẩn) → `width: 260px` (mở), transition 500ms
- Không stack dọc, không đổi thứ tự
- **Focus Mode**: ẩn cả Graph lẫn Chat, Editor full width `max-w-4xl mx-auto`

---

## 3. COMPONENT BREAKDOWN

### 3.1 `<Header />`

**File:** `src/components/Header.tsx`

**Layout:** `height: 52px`, flex row, space-between, `px-20`, `bg-panel`, `border-bottom: border-dim`

**Header line glow:** pseudo `::after` với gradient `transparent → rgba(56,189,248,0.3) → transparent`

**Bên trái:**
```
[Logo 28x28 gradient] [Brand name] [Session badge monospace]
```
- Logo: `background: linear-gradient(135deg, #38bdf8, #818cf8)`, border-radius 6px, chữ "EP"
- Brand: `"Ephurin "` + `<span color=accent-sky>"Co-Pilot"</span>`, font-size 15px, font-weight 600
- Session badge: `font-family: JetBrains Mono`, font-size 9px, `bg-surface`, `border-dim`, text: `ID: WRITING_SESSION_XXX`

**Bên phải (theo thứ tự):**
1. Analyzing indicator: dot nhấp nháy + text "Đang phân tích..." — chỉ hiện khi `isAnalyzing === true`
2. Button **Analyze** — `variant: accent` (gradient sky/violet bg, border sky)
3. Button **Graph** — `variant: ghost`, active state khi `drawerOpen === true`
4. Button **Focus** — `variant: ghost`, active state khi `focusMode === true`

**Button base style:**
```css
padding: 6px 12px; border-radius: 6px; font-size: 11px;
font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px;
border: 1px solid transparent; transition: all 0.2s;
```

---

### 3.2 `<GraphDrawer />`

**File:** `src/components/GraphDrawer.tsx`

**Container:** `width: 260px`, flex col, `bg-panel`, `border-right: border-dim`

**Sub-sections (top → bottom):**
1. **Drawer header** — title "KNOWLEDGE GRAPH" (9px, uppercase, letter-spacing 1.5px) + close button (X icon)
2. **Graph canvas** — ReactFlow canvas, flex-1, nodes + edges
3. **Node info panel** — bottom, fixed height, hiện khi click node

**Node styles theo type:**

| Type | BG | Border | Text color |
|------|----|--------|------------|
| PERSON | `--ent-person-bg` | `--ent-person-border` | `--accent-violet` |
| LOCATION | `--ent-loc-bg` | `--ent-loc-border` | `--accent-sky` |
| ORG | `--ent-org-bg` | `--ent-org-border` | `--accent-amber` |

**Node info panel fields:**
- Name (15px, font-weight 600)
- Type badge (9px uppercase)
- Trạng thái: key/value pairs
- Quan hệ: rel-tag (`ally` = green, `enemy` = rose) + tên entity

---

### 3.3 `<Editor />`

**File:** `src/components/Editor.tsx`

**⚠️ QUAN TRỌNG — Kỹ thuật 2 lớp (Layering):**

```
┌─────────────────────────────────────┐
│  Layer 2: Highlighter (z-0)         │  ← dangerouslySetInnerHTML
│  pointer-events: none               │  ← text màu transparent
│  overflow-y: auto                   │  ← sync scroll với layer 1
├─────────────────────────────────────┤
│  Layer 1: Editable div (z-10)       │  ← contentEditable
│  position: absolute, inset: 0       │  ← user gõ ở đây
│  color: --text-bright               │  ← text thật
└─────────────────────────────────────┘
```

Cả 2 layer: `position: absolute, inset: 0`, cùng font/padding để text align khớp nhau.

**Toolbar phía trên editor:**
- Stats: word count, read time, entity count — dùng JetBrains Mono 9px
- Phải: "Phân tích lần cuối: Xs trước" — chỉ hiện khi `lastAnalyzedAt` có giá trị

**Typography editor:**
```css
font-family: 'Lora', serif;
font-size: 18px;
line-height: 1.9;
padding: 48px 64px;
caret-color: var(--accent-sky);
```

**Entity highlight spans:**
```css
/* Cấu trúc chung */
.ent {
  border-radius: 2px;
  padding: 0 1px;
  cursor: pointer;
  transition: filter 0.15s;
}
.ent:hover { filter: brightness(1.3); }

/* Theo type */
.ent-person { background: var(--ent-person-bg); border-bottom: 1.5px solid var(--ent-person-border); }
.ent-loc    { background: var(--ent-loc-bg);    border-bottom: 1.5px solid var(--ent-loc-border); }
.ent-org    { background: var(--ent-org-bg);    border-bottom: 1.5px solid var(--ent-org-border); }
```

**Tooltip (hover entity):**
```
┌────────────────────────┐
│ Ô Thản Thành           │  ← normalized name, 12px bold
│ [LOCATION]  conf: 0.72 │  ← type badge + confidence mono
└────────────────────────┘
```
Position: `bottom: calc(100% + 8px)`, `left: 50%`, transform translateX(-50%)

**Floating entity panel (click entity):**
```
┌─────────────────────────┐
│ Ô Thản          [LOCATION] │
│ ─────────────────────── │
│ Normalized   Ô Thản Thành │
│ Confidence   ████░░  0.72 │
│ ─────────────────────── │
│ [✔ Xác nhận][✏ Sửa][✕ Bỏ] │
└─────────────────────────┘
```
- Position: `absolute`, tính từ cursor position
- Background: `--bg-raised`, border: `--border-mid`, border-radius: 12px
- Box-shadow: `0 16px 40px rgba(0,0,0,0.5)`
- Không dùng modal, không block typing

**Debounce analysis:**
```js
// 2000ms sau khi ngừng gõ → gọi runAnalysis()
useEffect(() => {
  const t = setTimeout(() => runAnalysis(), 2000);
  return () => clearTimeout(t);
}, [text]);
```

---

### 3.4 `<ChatPanel />`

**File:** `src/components/ChatPanel.tsx`

**Container:** `width: 280px`, flex col, `bg-panel`, `border-left: border-dim`

**Header:** icon 24x24 gradient + title "AI ASSISTANT" (9px uppercase)

**Body sections (theo thứ tự từ trên xuống):**

#### Section 1: Focus Character
```jsx
<select className="char-select">
  {entities.filter(isPerson).map(e => <option>{e.name}</option>)}
</select>
```
Style: `bg-surface`, `border-soft`, border-radius 8px, padding 9px 12px

#### Section 2: Narrative Mood
Grid 2 cột, 5 moods: Neutral / Romantic / Tragic / Dark / Comedic (span 2 cols)

Active states theo mood:
```
neutral  → bg sky/10,    border sky/30,    text accent-sky
tragic   → bg rose/10,   border rose/30,   text accent-rose
romantic → bg amber/8,   border amber/25,  text accent-amber
dark     → bg violet/10, border violet/30, text accent-violet
```

#### Section 3: Warning banner (conditional)
Chỉ hiện khi có entity confidence < 0.8:
```
⚠ [amber bg/6, border amber/15]
  "Thực thể X có độ chính xác thấp (0.XX). Hãy xác nhận..."
```

#### Section 4: Suggestion cards
```
┌─────────────────────────────┐
│ ▌ [text italic Lora 12px]   │  ← left accent bar 3px gradient
│   ...                       │
│ [tag mood] [Dùng →]         │
└─────────────────────────────┘
```
- Hover: `translateX(2px)`, border sáng hơn
- Left bar: `position: absolute, left:0, top:0, width:3px, height:100%`, gradient sky→violet

**Footer:** legend 3 loại entity với colored dots

---

## 4. STATE MANAGEMENT (Zustand)

**File:** `src/store/useStore.ts`

```ts
interface AppState {
  // Editor
  text: string;
  setText: (t: string) => void;

  // Entities từ backend
  entities: Entity[];
  setEntities: (e: Entity[]) => void;

  // Analysis
  isAnalyzing: boolean;
  lastAnalyzedAt: Date | null;
  runAnalysis: () => Promise<void>;

  // UI state
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;

  // Chat
  mood: 'neutral' | 'tragic' | 'romantic' | 'dark' | 'comedic';
  setMood: (m: string) => void;
  targetCharacter: string;
  setTargetCharacter: (c: string) => void;
  suggestions: string[];

  // Graph
  selectedNode: Entity | null;
  setSelectedNode: (e: Entity | null) => void;
}

interface Entity {
  word: string;
  resolved_name?: string;
  entity_type: 'PERSON' | 'LOCATION' | 'ORG' | 'UNKNOWN';
  confidence: number;
  start: number;
  end: number;
}
```

---

## 5. KEYBOARD SHORTCUTS

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+F` | Toggle Focus Mode |
| `Escape` | Đóng floating entity panel |

---

## 6. ANIMATION & TRANSITIONS

| Element | Animation |
|---------|-----------|
| Graph drawer open/close | `transition: width 500ms ease` |
| Chat panel mount | `animate-in slide-in-from-right duration-500` |
| Suggestion card hover | `transform: translateX(2px)` |
| Analyzing dot | `pulse` keyframe 1.4s ease-in-out |
| Cursor trong editor | `blink` keyframe 1.1s step-end, glow `rgba(56,189,248,0.6)` |
| Entity panel appear | `opacity 0→1`, `translateY 4px→0`, 150ms |

---

## 7. ANTI-PATTERNS — AGENT KHÔNG ĐƯỢC LÀM

```
❌ Dùng <textarea> cho editor
❌ Dùng modal/dialog cho entity confirm
❌ Block UI khi đang analyze
❌ Chat nằm dưới editor (phải luôn bên phải)
❌ Graph luôn hiển thị (phải là drawer)
❌ Hardcode màu hex trong component (dùng CSS var)
❌ Layout 1 cột
❌ Editor nhỏ hơn chat panel
❌ Dùng font Inter/Roboto/Arial (dùng DM Sans + Lora + JetBrains Mono)
```

---

## 8. FILE STRUCTURE

```
src/
├── components/
│   ├── Header.tsx
│   ├── Editor.tsx          ← quan trọng nhất
│   ├── ChatPanel.tsx
│   ├── GraphDrawer.tsx
│   └── EntityPanel.tsx     ← floating panel khi click entity
├── store/
│   └── useStore.ts
├── hooks/
│   └── useDebounce.ts
├── styles/
│   └── editor.css          ← entity highlight CSS
├── App.tsx
└── main.tsx
```

---

## 9. REFERENCE MOCKUP

File HTML mockup đầy đủ đã được render: `ephurin-ui.html`

Agent có thể mở file này trong browser để xem visual reference trước khi implement.

> Nếu có conflict giữa spec này và code hiện tại → **spec này thắng**.

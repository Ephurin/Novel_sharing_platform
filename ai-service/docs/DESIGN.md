# 🧠 Design.md — AI Writing UI & Interaction System

## 🎯 Mục tiêu

Xây dựng một **AI-assisted writing environment** (không phải dashboard) với:

* Trải nghiệm giống Google Docs / Colab
* AI hoạt động **ngầm, không gây gián đoạn**
* Cho phép chỉnh sửa entity / graph **khi cần (on-demand)**

---

# I. 🧩 CORE UX PRINCIPLES (BẮT BUỘC)

## ❗ Nguyên tắc chính

* User là **writer**, không phải annotator
* Không interrupt flow viết
* Không có bước confirm bắt buộc
* AI output phải:

  * inline
  * thụ động (passive)
  * có thể chỉnh sửa

---

## ❌ CẤM

* Modal confirm
* Block UI khi analyze
* Bắt user xác nhận entity trước khi dùng AI
* Layout dạng form/dashboard

---

# II. 🧱 LAYOUT (WIREFRAME CHUẨN)

## 🖥️ Tổng thể

```
+-------------------------------------------------------------+
| Header: Title | Analyze | Toggle Graph | Focus Mode          |
+----------------------+----------------------+---------------+
|                      |                      |               |
|                      |                      |               |
|   GRAPH DRAWER       |        EDITOR        |     CHAT      |
| (hidden by default)  |   (main focus area)  |               |
|                      |                      |               |
+----------------------+----------------------+---------------+
```

---

## 📏 Kích thước

```
TOTAL WIDTH = 100%

GRAPH (closed) = 0%
GRAPH (open)   = 20%

EDITOR         = 65–70%
CHAT           = 30–35%
```

---

## 🔥 RULE CỨNG

* Editor luôn là vùng lớn nhất
* Chat luôn bên phải
* Graph là drawer (ẩn/hiện)
* Không stack dọc

---

## ❌ Anti-pattern

* Editor nhỏ hơn chat
* Chat nằm dưới editor
* Graph luôn hiển thị
* Layout 1 cột

---

# III. 🧭 HEADER

## Thành phần

* Title / Story ID
* Analyze
* Toggle Graph
* Focus Mode

---

## Interaction

* Analyze → gọi pipeline
* Toggle Graph → mở drawer
* Focus Mode → ẩn chat + graph

---

# IV. ✍️ EDITOR (QUAN TRỌNG NHẤT)

## ❗ KHÔNG dùng textarea

Phải dùng:

```
contentEditable div
```

---

## 🧠 Behavior

* Typing mượt
* Không bị lag
* Không bị reset cursor

---

## 🎯 Entity Highlight

Ví dụ:

```
Tiêu Viêm rời [Ô Thản] để đến [Hồn Điện]
```

---

## 🎨 Style

* Background nhẹ
* Hover đậm hơn
* Clickable

---

## 🖱️ Interaction

### Hover

* Hiển thị tooltip:

  * normalized name
  * type
  * confidence

---

### Click

Hiện floating panel:

```
Ô Thản
-----------------------
Normalized: Ô Thản Thành
Type: Location
Confidence: 0.72

[✔ Confirm]
[✏ Edit]
[❌ Ignore]
```

---

## ❗ RULE

* Không dùng modal
* Panel nổi (absolute)
* Không block typing

---

# V. ⚙️ BACKGROUND PROCESSING

## Flow

```
User typing
   ↓ (2s idle)
Auto analyze (background)
   ↓
Update entities / events / relations / states
```

---

## ❗ RULE

* Không loading fullscreen
* Không freeze editor
* Chỉ hiển thị indicator nhẹ

---

# VI. 💬 CHAT PANEL (RIGHT)

## Layout

* Fixed width (~30%)
* Scrollable
* Input + mood selector

---

## Nội dung

* Suggestion
* Confidence warning

---

## Ví dụ

```
⚠ Low confidence due to ambiguous entity

Tiêu Viêm có thể quay lại...
```

---

## Behavior

* Không phụ thuộc confirm entity
* Đổi mood → regenerate ngay

---

# VII. 🕸️ GRAPH DRAWER (LEFT)

## Behavior

* Hidden mặc định
* Slide-in từ trái

---

## Nội dung

* Nodes = entities
* Edges = relations

---

## Click node

```
Tiêu Viêm
------------------
State:
- health: wounded
- location: Vân Lam Tông

Relations:
- ally: Dược Lão
- enemy: Hồn Điện
```

---

# VIII. ⚡ INTERACTION FLOW

```
User viết
   ↓
Auto extract (background)
   ↓
Highlight entity
   ↓
User:
   ├── ignore
   ├── click → chỉnh
   └── mở graph
   ↓
Suggestion luôn update
```

---

## ❗ QUAN TRỌNG

```
Write → Suggest → (optional confirm)
```

KHÔNG phải:

```
Write → Confirm → Suggest
```

---

# IX. 🔍 ENTITY SYSTEM

## Input từ backend

```json
[
  {
    "text": "Ô Thản",
    "start": 13,
    "end": 19,
    "normalized": "Ô Thản Thành",
    "type": "location",
    "confidence": 0.72
  }
]
```

---

## Render logic

* slice text theo offset
* wrap bằng `<span>`

---

# X. ⚠️ VẤN ĐỀ KỸ THUẬT

## 1. Cursor jump

Nguyên nhân:

```
innerHTML bị replace
```

Giải pháp:

* dùng Range API
* hoặc chuyển sang editor framework

---

## 2. Offset sai

Nguyên nhân:

* user edit text

Giải pháp:

```
re-run analyze mỗi lần debounce
```

---

## 3. XSS risk

Nguyên nhân:

```
innerHTML injection
```

Giải pháp:

* sanitize HTML
* escape text

---

# XI. 🧠 STATE & REACTIVE SYSTEM

## Flow dữ liệu

```
Text
 → Analyze
 → Entities
 → Render highlight
 → User edit entity
 → Re-run analyze
 → Update graph + suggestion
```

---

## Nguyên tắc

* Không có “confirm step” cứng
* Mọi thứ reactive

---

# XII. 🎯 FOCUS MODE

## Before

```
[GRAPH][EDITOR][CHAT]
```

## After

```
[EDITOR FULL WIDTH]
```

---

## Trigger

```
Ctrl + Shift + F
```

---

# XIII. 🚀 MỤC TIÊU CUỐI

User cảm thấy:

> “Tôi đang viết bình thường, AI chỉ hỗ trợ nhẹ nhàng”

---

# XIV. 📦 IMPLEMENTATION CHECKLIST

## Layout

* [ ] 3 panel đúng tỷ lệ
* [ ] Graph drawer hoạt động
* [ ] Focus mode

---

## Editor

* [ ] contentEditable
* [ ] highlight entity
* [ ] click mở panel

---

## AI

* [ ] auto analyze debounce
* [ ] suggestion luôn available
* [ ] mood hoạt động

---

## Graph

* [ ] render entity + relation
* [ ] click node xem state

---

# ❗ FINAL RULE

Nếu UI:

* Editor không phải trung tâm
* Chat không nằm bên phải
* Graph không phải drawer

→ ❌ Implementation INVALID

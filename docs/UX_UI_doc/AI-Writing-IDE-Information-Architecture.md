# AI Writing IDE - Information Architecture v1.0

## 1. Product Vision

AI Writing IDE là một môi trường sáng tác tích hợp lấy cảm hứng từ VSCode, Antigravity, Cursor, Obsidian và Sudowrite.

Mục tiêu là cung cấp một không gian làm việc duy nhất để tác giả:

* Viết nội dung
* Tương tác với AI
* Quản lý tri thức của truyện
* Kiểm tra logic và plot-hole
* Theo dõi timeline và quan hệ nhân vật

Mọi thao tác đều được thực hiện trong một màn hình duy nhất (Single Workspace).

---

# 2. Global Layout

```text
+------------------------------------------------------------------+
| Toolbar                                                          |
+------------------------------------------------------------------+

| Activity | Sidebar | Main Editor | AI Assistant Panel           |
|   Bar    |         |             |                              |
|          |         |             |                              |
|          |         |             |                              |
|          |         |             |                              |

+------------------------------------------------------------------+
| Status Bar                                                       |
+------------------------------------------------------------------+
```

---

# 3. Core Layout Regions

## 3.1 Activity Bar

Vị trí:

* Ngoài cùng bên trái
* Cố định

Mục đích:

* Chuyển đổi giữa các chế độ làm việc
* Điều khiển nội dung Sidebar

Chiều rộng:

* 48px – 56px

---

## 3.2 Sidebar

Vị trí:

* Bên phải Activity Bar

Mục đích:

* Hiển thị nội dung tương ứng với Activity đang được chọn

Chiều rộng:

* 280px – 360px

Có thể:

* Collapse
* Resize

---

## 3.3 Main Editor

Vị trí:

* Trung tâm màn hình

Mục đích:

* Soạn thảo nội dung chính

Chiếm:

* Phần lớn không gian

---

## 3.4 AI Assistant Panel

Vị trí:

* Bên phải

Mục đích:

* Chat với AI
* Xem suggestion
* Xem context
* Chạy agent task

Chiều rộng:

* 320px – 450px

Có thể:

* Collapse
* Resize

---

## 3.5 Toolbar

Vị trí:

* Trên cùng

Mục đích:

* Formatting
* Insert
* AI Actions

---

## 3.6 Status Bar

Vị trí:

* Dưới cùng

Mục đích:

* Hiển thị trạng thái hệ thống

---

# 4. Activities Architecture

## Activity 1: Story

Icon:

📖

Mục tiêu:

Quản lý cấu trúc truyện.

Sidebar hiển thị:

```text
Story Name

Arc 1
 ├─ Chapter 1
 ├─ Chapter 2

Arc 2
 ├─ Chapter 3
 ├─ Chapter 4
```

Main Area:

Editor chương hiện tại.

AI Panel:

* Story suggestions
* Chapter summary
* Next scene suggestion

---

## Activity 2: Entities

Icon:

👤

Mục tiêu:

Quản lý wiki của truyện.

Sidebar:

```text
Characters
Locations
Organizations
Items
Concepts
```

Main Area:

Entity Detail View

Ví dụ:

```text
Name
Aliases
Description
Attributes
Relationships
Recent Events
```

AI Panel:

* Entity analysis
* Relationship suggestions
* Consistency warnings

---

## Activity 3: Timeline

Icon:

📅

Mục tiêu:

Quản lý diễn biến câu chuyện.

Sidebar:

```text
Chapter 1
Chapter 2
Chapter 3
```

Main Area:

Timeline View

Ví dụ:

```text
Day 1
- Event A
- Event B

Day 2
- Event C
```

AI Panel:

* Timeline analysis
* Missing events
* Continuity warnings

---

## Activity 4: Knowledge Graph

Icon:

🕸

Mục tiêu:

Trực quan hóa dữ liệu truyện.

Sidebar:

```text
Characters
Locations
Organizations
```

Main Area:

Interactive Graph

AI Panel:

* Explain relationship
* Graph insights

---

## Activity 5: Search

Icon:

🔍

Mục tiêu:

Tìm kiếm toàn bộ project.

Sidebar:

Search Filters

Main Area:

Search Results

AI Panel:

* Semantic search
* Context explanation

---

## Activity 6: Tasks

Icon:

🤖

Mục tiêu:

Điều khiển Agent.

Sidebar:

```text
Analyze Chapter
Extract Entities
Update Timeline
Check Plot Holes
Generate Summary
```

Main Area:

Task History

AI Panel:

Task Execution Console

---

## Activity 7: Projects

Icon:

📁

Mục tiêu:

Quản lý nhiều bộ truyện.

Sidebar:

Danh sách Project

Main Area:

Project Dashboard

AI Panel:

Project Statistics

---

## Activity 8: Settings

Icon:

⚙

Mục tiêu:

Thiết lập hệ thống.

Sidebar:

```text
General
Editor
AI
Storage
Themes
```

Main Area:

Settings Form

---

# 5. Editor Requirements

## 5.1 Infinite Scroll

Editor phải hoạt động giống:

* Google Docs
* Notion
* Word Online

Không giới hạn chiều dài nội dung.

---

## 5.2 Rich Text Features

Hỗ trợ:

* Bold
* Italic
* Underline
* Strikethrough
* Heading
* Bullet List
* Number List
* Table
* Image
* Quote
* Code Block
* Hyperlink
* Comment

---

## 5.3 Context Awareness

Hover Entity:

```text
Tiêu Viêm
```

Hiển thị:

```text
Type: Character

Health: 80%

Location:
Ô Thản Thành

Relations:
Huân Nhi (Friend)
```

---

## 5.4 Plot-hole Highlight

Cho phép đánh dấu:

* Consistency Issue
* Timeline Issue
* Character State Issue

Bằng:

* Underline
* Highlight
* Warning Badge

---

# 6. AI Assistant Panel

AI Panel có 4 tab.

---

## Tab 1: Chat

Mục tiêu:

Trao đổi tự do với AI.

Ví dụ:

```text
Viết lại đoạn này

Mô tả cảnh chiến đấu

Đề xuất hội thoại
```

---

## Tab 2: Suggestions

Mục tiêu:

Hiển thị đề xuất chủ động.

Ví dụ:

```text
Plot Twist

Foreshadowing

Character Development
```

---

## Tab 3: Context

Mục tiêu:

Hiển thị context hiện tại.

Ví dụ:

```text
Current Chapter

Active Characters

Recent Events

Related Entities
```

---

## Tab 4: Tasks

Mục tiêu:

Thực thi Agent Workflow.

Ví dụ:

```text
Analyze Chapter

Extract Entities

Update KB

Generate Summary
```

---

# 7. Toolbar

Toolbar chia thành các nhóm.

---

## Group: File

* New
* Save
* Export

---

## Group: Edit

* Undo
* Redo

---

## Group: Formatting

* Bold
* Italic
* Underline
* Strike

---

## Group: Structure

* H1
* H2
* H3

---

## Group: Insert

* Table
* Image
* Link
* Comment

---

## Group: AI

* Rewrite
* Expand
* Shorten
* Summarize
* Extract Entities
* Update Timeline
* Check Consistency

---

# 8. Status Bar

Hiển thị:

```text
Project Name

Current Chapter

Word Count

Character Count

Last Save Time

AI Context Usage

Sync Status
```

---

# 9. Focus Mode

Ẩn:

* Activity Bar
* Sidebar

Chỉ giữ:

```text
Editor
+
AI Panel
```

Mục tiêu:

Tập trung viết.

---

# 10. Future Extensions

Dự phòng cho:

* Multi-Agent System
* Visual Story Map
* Character Simulation
* Voice Dictation
* Collaborative Editing
* Version History
* Branching Storylines
* AI Memory Inspector

Không cần triển khai ở phiên bản đầu tiên nhưng kiến trúc phải hỗ trợ mở rộng.

# Narrative Memory Architecture v2

## Hướng dẫn kiến trúc cho AI Writing Co-pilot Agent

# 1. Mục tiêu refactor kiến trúc

Hệ thống hiện tại đang dùng:

```text
KB JSON
 ├── entities
 └── relationships
```

Vấn đề:

1. Relationship quá cứng nhắc
2. Không lưu lịch sử narrative
3. Không có temporal progression
4. Không có current world state riêng
5. Khó scale với truyện dài
6. LLM thiếu narrative context thật sự

---

# 2. Tư duy kiến trúc mới

Chuyển từ:

```text
Entity-centric architecture
```

sang:

```text
Narrative memory architecture
```

Hệ thống mới sẽ gồm 3 lớp dữ liệu chính:

```text
[1] Entity Layer
[2] Event History Layer
[3] Current World State Layer
```

Và optional:

```text
[4] Vector Semantic Memory (RAG)
```

---

# 3. Core Philosophy

## KHÔNG coi relationship là dữ liệu gốc

Relationship chỉ là:

```text
derived state
```

được suy ra từ:

```text
event history
```

Ví dụ:

```text
Event:
- A cứu B
- B phản bội A
- A giết cha B

→ hệ thống suy ra:
A và B là kẻ thù
```

---

# 4. Kiến trúc tổng thể

```text
Text Input
    ↓
NER / Entity Extraction
    ↓
Event Extraction
    ↓
Narrative Summarization
    ↓
Event Store
    ↓
Current State Update
    ↓
RAG Indexing
```

---

# 5. Layer 1 — Entity Layer

## Mục đích

Lưu:

* canonical identity
* world objects
* stable metadata

KHÔNG lưu narrative phức tạp.

---

## Ví dụ schema

```json
{
  "entities": [
    {
      "id": "char_tieu_viem",
      "name": "Tiêu Viêm",
      "type": "character",
      "aliases": ["Tiêu Viêm", "Viêm Nhi"],
      "metadata": {
        "gender": "male",
        "faction": "Tiêu Gia"
      }
    }
  ]
}
```

---

## Chỉ nên lưu dữ liệu tương đối ổn định

Ví dụ:

GOOD:

* tên
* chủng tộc
* faction
* nghề nghiệp
* item type

BAD:

* yêu ai
* ghét ai
* đang tức giận
* quan hệ phức tạp

---

# 6. Layer 2 — Event History Layer (QUAN TRỌNG NHẤT)

## Đây là narrative memory thật sự

Hệ thống phải lưu:

```text
các sự kiện đã xảy ra
```

thay vì chỉ relationship.

---

# 7. Event Structure

## Ví dụ schema

```json
{
  "event_id": "evt_0001",
  "chapter": 12,
  "timestamp": "story_time_optional",

  "participants": [
    "char_tieu_viem",
    "char_huyet_sat"
  ],

  "locations": [
    "loc_ha_ma_thanh"
  ],

  "summary": "Huyết Sát dẫn Hắc Ma Hội tấn công Tiêu Gia, khiến nhiều trưởng lão tử trận.",

  "event_type": "battle",

  "emotion_tags": [
    "revenge",
    "anger",
    "fear"
  ],

  "importance_score": 0.92,

  "consequences": [
    "Tiêu Viêm trọng thương",
    "Tiêu Gia suy yếu"
  ],

  "source": "AI"
}
```

---

# 8. Event History là dữ liệu gốc

Ví dụ:

KHÔNG lưu:

```json
{
  "relation": "ENEMY_OF"
}
```

Mà lưu:

```json
{
  "summary": "Huyết Sát giết cha của Tiêu Viêm"
}
```

LLM sẽ tự hiểu:

* hatred
* revenge
* hostility

---

# 9. Event Granularity

## Một event KHÔNG nên quá nhỏ

BAD:

```text
A rút kiếm
A bước tới
A nói chuyện
```

GOOD:

```text
A đối đầu B tại đại hội tông môn
```

---

# 10. Event Compression Strategy

Khi truyện dài:

```text
scene
→ chapter summary
→ arc summary
→ saga summary
```

Ví dụ:

```text
100 chương
→ 1 arc memory
```

Điều này giúp:

* giảm retrieval noise
* giảm token usage
* tăng long-context consistency

---

# 11. Layer 3 — Current World State

## Đây là snapshot hiện tại của thế giới

KHÔNG dùng event history trực tiếp cho runtime logic.

---

# 12. Current State Structure

```json
{
  "current_world_state": {
    "characters": {
      "char_tieu_viem": {
        "location": "Gia Mã Đế Quốc",
        "realm": "Đấu Hoàng",
        "health": 72,
        "status": "alive",

        "inventory": [
          "Băng Lam Kiếm"
        ],

        "active_relationships": {
          "char_huyet_sat": "hostile"
        }
      }
    }
  }
}
```

---

# 13. Current State = Cache Layer

Current state được:

```text
derive/update
```

từ event history.

Ví dụ:

```text
Event:
A cướp kiếm của B

→ update:
owner(sword) = A
```

---

# 14. Tại sao phải tách Event và Current State?

Vì:

## Event History

phục vụ:

* narrative reasoning
* emotion
* causality
* story recall

---

## Current State

phục vụ:

* deterministic logic
* consistency checking
* fast query
* gameplay/UI

---

# 15. Layer 4 — Vector Semantic Memory (Optional nhưng rất nên có)

## Mỗi event summary sẽ được embedding

Ví dụ:

```json
{
  "embedding_source":
  "Huyết Sát dẫn Hắc Ma Hội tiêu diệt Tiêu Gia"
}
```

---

# 16. RAG Retrieval Strategy

Khi user viết:

```text
Tiêu Viêm gặp lại Huyết Sát
```

Hệ thống sẽ retrieve:

* previous battles
* revenge scenes
* family massacre
* emotional conflicts

---

# 17. KHÔNG retrieve raw chapter text

Chỉ retrieve:

* summarized events
* compressed memory
* important scenes

---

# 18. Relationship System mới

## Relationship không còn là primary storage

Mà là:

```text
computed interpretation
```

Ví dụ:

```json
{
  "char_a": {
    "char_b": {
      "relationship": "hostile",
      "confidence": 0.82,
      "derived_from_events": [
        "evt_001",
        "evt_008"
      ]
    }
  }
}
```

---

# 19. Consistency Engine mới

Consistency check KHÔNG chỉ dựa trên graph.

Mà dựa trên:

## A. Current state

Ví dụ:

```text
dead character appears
```

---

## B. Event history

Ví dụ:

```text
A suddenly forgives B
without narrative transition
```

---

# 20. Narrative Reasoning Flow

## Input

```text
Tiêu Viêm bước vào đại điện.
```

---

## System flow

### Step 1 — Entity detection

Detect:

* Tiêu Viêm

---

### Step 2 — Current state lookup

Get:

* current location
* injuries
* faction
* current enemies

---

### Step 3 — Event retrieval

Retrieve:

* recent conflict
* related arcs
* emotional memories

---

### Step 4 — Context build

Build narrative context.

---

### Step 5 — LLM generation

Generate coherent continuation.

---

# 21. JSON Structure đề xuất

```json
{
  "story_id": "story_001",

  "entities": [],

  "event_history": [],

  "current_world_state": {},

  "relationship_cache": {},

  "vector_memory_refs": []
}
```

---

# 22. Migration Strategy

## KHÔNG rewrite toàn bộ hệ thống

Chỉ:

### KEEP

* NER pipeline
* Entity extraction
* Existing KB manager

---

### ADD

* event_history
* current_world_state
* event summarizer
* world state updater

---

# 23. Agent Design Rules

## Rule 1

Entities là identity layer.

KHÔNG nhồi narrative vào entities.

---

## Rule 2

Event history là source of truth cho story progression.

---

## Rule 3

Current world state là runtime truth.

---

## Rule 4

Relationship là derived cache.

KHÔNG phải dữ liệu gốc.

---

## Rule 5

RAG chỉ retrieve summarized narrative memory.

KHÔNG retrieve raw novel text nếu không cần.

---

# 24. Long-term Goal

Hệ thống mục tiêu:

```text
AI Writing Assistant
→ Narrative Operating System
```

Có khả năng:

* nhớ truyện dài hạn
* track world evolution
* detect plot holes
* reasoning theo narrative history
* maintain emotional continuity

---

# 25. Final Architecture

```text
                ┌──────────────────┐
                │ Raw Story Text   │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ Entity Extraction│
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ Event Extraction │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ Event History    │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ World State Sync │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ Vector Memory    │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ Context Builder  │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ LLM Reasoning    │
                └──────────────────┘
```

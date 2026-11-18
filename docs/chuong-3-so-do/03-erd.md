# Chương 3 – Sơ đồ ERD

> **Ghi chú kiểm tra:** Các sơ đồ được tách từ [Chương 3](../BAO_CAO_CHUONG_3.md) để xem Mermaid theo nhóm, giảm tải cho trình xem GitHub. Nguồn đối chiếu nghiệp vụ là mã nguồn nhánh `main`; vị trí lưu này chỉ là nhánh tài liệu.

## 3.4.2. ERD nhóm tài khoản và xuất bản

```mermaid
erDiagram
    USERS {
      uuid user_id PK
      varchar email UK
      varchar username UK
      varchar role
      varchar status
    }
    USER_PROFILES {
      uuid user_id PK, FK
      varchar display_name
      text avatar_url
    }
    REFRESH_TOKENS {
      uuid refresh_token_id PK
      uuid user_id FK
      timestamp expires_at
    }
    NOVELS {
      uuid novel_id PK
      uuid author_id FK
      varchar title
      varchar status
    }
    CHAPTERS {
      uuid chapter_id PK
      uuid novel_id FK
      int chapter_number
      varchar status
      boolean is_vip
      int price_coins
    }
    CHAPTER_REVISIONS {
      uuid revision_id PK
      uuid novel_id FK
      uuid chapter_id FK
      varchar content_hash
      text content
      varchar source_type
    }
    REVISION_OUTBOX_EVENTS {
      uuid event_id PK
      uuid revision_id FK
      varchar event_type
      varchar status
    }
    CHARACTER_PROFILES {
      uuid character_id PK
      uuid novel_id FK
      varchar name
      varchar role
    }
    STORY_TIMELINE_EVENTS {
      uuid event_id PK
      uuid novel_id FK
      uuid chapter_id FK
      int event_order
    }
    PLOT_SUMMARIES {
      uuid summary_id PK
      uuid novel_id FK
      varchar scope
    }
    USERS ||--o| USER_PROFILES : has
    USERS ||--o{ REFRESH_TOKENS : owns
    USERS ||--o{ NOVELS : writes
    NOVELS ||--o{ CHAPTERS : includes
    NOVELS ||--o{ CHAPTER_REVISIONS : records
    CHAPTERS ||--o{ CHAPTER_REVISIONS : versions
    CHAPTER_REVISIONS ||--o{ REVISION_OUTBOX_EVENTS : generates
    NOVELS ||--o{ CHARACTER_PROFILES : describes
    NOVELS ||--o{ STORY_TIMELINE_EVENTS : contains
    NOVELS ||--o{ PLOT_SUMMARIES : summarizes
```

*Hình 3.10. ERD nhóm tài khoản, truyện, chương và ngữ cảnh do tác giả quản lý.*

## 3.4.3. ERD đọc truyện, tương tác và ví Coin

```mermaid
erDiagram
    USERS {
      uuid user_id PK
    }
    NOVELS {
      uuid novel_id PK
    }
    CHAPTERS {
      uuid chapter_id PK
      uuid novel_id FK
    }
    READING_HISTORIES {
      uuid user_id FK
      uuid novel_id FK
      uuid chapter_id FK
      int paragraph_index
    }
    READING_BOOKMARK_ENTRIES {
      uuid bookmark_id PK
      uuid user_id FK
      uuid novel_id FK
      uuid chapter_id FK
      int paragraph_index
      int start_offset
    }
    NOVEL_FOLLOWS {
      uuid user_id FK
      uuid novel_id FK
    }
    NOVEL_RATINGS {
      uuid user_id FK
      uuid novel_id FK
    }
    WALLETS {
      uuid wallet_id PK
      uuid user_id FK
      int coins_balance
    }
    TRANSACTIONS {
      uuid transaction_id PK
      uuid wallet_id FK
      int amount_coins
      varchar status
    }
    CHAPTER_UNLOCKS {
      uuid user_id FK
      uuid chapter_id FK
      uuid transaction_id FK
    }
    USERS ||--o{ READING_HISTORIES : reads
    NOVELS ||--o{ READING_HISTORIES : tracked
    CHAPTERS ||--o{ READING_HISTORIES : positioned
    USERS ||--o{ READING_BOOKMARK_ENTRIES : saves
    CHAPTERS ||--o{ READING_BOOKMARK_ENTRIES : bookmarked
    USERS ||--o{ NOVEL_FOLLOWS : follows
    NOVELS ||--o{ NOVEL_FOLLOWS : followed
    USERS ||--o{ NOVEL_RATINGS : rates
    NOVELS ||--o{ NOVEL_RATINGS : rated
    USERS ||--o| WALLETS : owns
    WALLETS ||--o{ TRANSACTIONS : records
    USERS ||--o{ CHAPTER_UNLOCKS : unlocks
    CHAPTERS ||--o{ CHAPTER_UNLOCKS : permitted
    TRANSACTIONS ||--o| CHAPTER_UNLOCKS : evidences
```

*Hình 3.11. ERD nhóm đọc truyện, theo dõi, đánh giá và ví Coin.*

## 3.4.4. ERD dữ liệu Narrative Memory

```mermaid
erDiagram
    STORY_BRAINS {
      uuid id PK
      uuid novel_id
      uuid tenant_id
      bigint brain_version
      varchar status
    }
    ENTITIES {
      uuid id PK
      uuid story_brain_id FK
      varchar canonical_name
      varchar entity_type
      varchar confirmation_status
    }
    ENTITY_ALIASES {
      uuid id PK
      uuid entity_id FK
      varchar alias
    }
    EVENTS {
      uuid id PK
      uuid story_brain_id FK
      bigint narrative_order
      int chapter_number
      text summary
    }
    FACTS {
      uuid id PK
      uuid story_brain_id FK
      varchar fact_key
      varchar confirmation_status
    }
    PROPOSALS {
      uuid id PK
      uuid story_brain_id FK
      varchar status
      varchar proposal_type
    }
    MEMORY_CHUNKS {
      uuid id PK
      uuid story_brain_id FK
      text content
      varchar content_hash
    }
    MEMORY_EMBEDDINGS {
      uuid id PK
      uuid memory_chunk_id FK
      varchar embedding_version
      int embedding_dimension
    }
    STORY_BRAINS ||--o{ ENTITIES : contains
    ENTITIES ||--o{ ENTITY_ALIASES : aliases
    STORY_BRAINS ||--o{ EVENTS : narrates
    STORY_BRAINS ||--o{ FACTS : records
    STORY_BRAINS ||--o{ PROPOSALS : reviews
    STORY_BRAINS ||--o{ MEMORY_CHUNKS : remembers
    MEMORY_CHUNKS ||--o{ MEMORY_EMBEDDINGS : vectorizes
```

*Hình 3.12. ERD tổng quan của schema Narrative Memory.*


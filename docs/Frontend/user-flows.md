# Frontend User Flows

## 1. Reader Reads and Comments

```mermaid
sequenceDiagram
    actor Reader
    participant Mobile
    participant API

    Reader->>Mobile: Open Home/Search
    Mobile->>API: GET /reading/novels
    API-->>Mobile: public novels
    Reader->>Mobile: Select novel
    Mobile->>API: GET /novels/{novelId}
    API-->>Mobile: novel detail + chapters
    Reader->>Mobile: Open chapter
    Mobile->>API: GET /chapters/{chapterId}
    API-->>Mobile: chapter content
    Reader->>Mobile: Add comment
    Mobile->>API: POST /chapters/{chapterId}/comments
    API-->>Mobile: APPROVED or PENDING_MODERATION
```

## 2. Author Publishes Chapter

```mermaid
sequenceDiagram
    actor Author
    participant Web
    participant API
    participant Control as Content Control

    Author->>Web: Open Chapter Editor
    Web->>API: GET /chapters/{chapterId}
    API-->>Web: draft/approved chapter data
    Author->>Web: Save draft
    Web->>API: PATCH /chapters/{chapterId}
    API-->>Web: saved draft
    Author->>Web: Submit publish
    Web->>API: POST /chapters/{chapterId}/submit-publish
    API->>Control: check content
    Control-->>API: PASS or NEED_ADMIN_REVIEW
    API-->>Web: PUBLISHED or PENDING_MODERATION
```

## 3. Writing Copilot Suggestion

```mermaid
sequenceDiagram
    actor Author
    participant Web
    participant API

    Author->>Web: Open Copilot panel
    Web->>API: GET story context
    API-->>Web: characters/timeline/summaries
    Author->>Web: Enter instruction + optional context text
    Web->>API: POST /ai/copilot/suggestions
    API-->>Web: draft suggestion + proposal IDs
    Author->>Web: Accept proposal
    Web->>API: POST /context-proposals/{proposalId}/approve
    API-->>Web: official context updated
```

## 4. Author Checks Plot Consistency

```mermaid
sequenceDiagram
    actor Author
    participant Web
    participant API

    Author->>Web: Click Analyze Consistency
    Web->>API: POST /ai/copilot/consistency-check
    API-->>Web: contextHealthScore + warnings
    Author->>Web: Open warning detail
    alt revise draft
        Author->>Web: Edit chapter manually
        Web->>API: PATCH /chapters/{chapterId}
    else request fix
        Web->>API: POST /ai/copilot/suggestions
    else update context
        Web->>API: POST /ai/copilot/context-proposals
    end
```

## 5. Reader Unlocks VIP Chapter

```mermaid
sequenceDiagram
    actor Reader
    participant Mobile
    participant API

    Reader->>Mobile: Open VIP chapter
    Mobile->>API: GET /chapters/{chapterId}
    API-->>Mobile: PAYMENT_002 or unlock required
    Reader->>Mobile: Tap Unlock
    Mobile->>API: POST /chapters/{chapterId}/unlock
    API-->>Mobile: unlocked or insufficient balance
    alt insufficient balance
        Reader->>Mobile: Mock deposit
        Mobile->>API: POST /wallet/deposit-sessions
        API-->>Mobile: mockPaymentUrl
    end
```

## 6. Admin Resolves Moderation Review

```mermaid
sequenceDiagram
    actor Admin
    participant Web
    participant API

    Admin->>Web: Open Moderation Queue
    Web->>API: GET /admin/moderation/reviews
    API-->>Web: pending reviews
    Admin->>Web: Open review detail
    Web->>API: GET /admin/moderation/reviews/{reviewId}
    API-->>Web: target + evidence summary
    Admin->>Web: Resolve
    Web->>API: POST /admin/moderation/reviews/{reviewId}/resolve
    API-->>Web: resolved status
```

# Backend Service Flows

This document describes important backend workflows and their module interactions.

## 1. Login Flow

```mermaid
sequenceDiagram
    actor User
    participant API as API Controller
    participant Auth as Auth Service
    participant Repo as Auth Repository

    User->>API: POST /auth/login
    API->>Auth: login(identifier, password)
    Auth->>Repo: findUserByEmailOrUsername()
    Repo-->>Auth: user
    Auth->>Auth: verify password + status
    Auth->>Repo: create refresh token hash
    Auth-->>API: user + access token + refresh cookie
    API-->>User: response envelope
```

## 2. Publish Chapter Flow

```mermaid
sequenceDiagram
    actor Author
    participant API as Chapter Controller
    participant Novel as Novel Service
    participant Control as Content Control Service

    Author->>API: POST /chapters/{chapterId}/submit-publish
    API->>Novel: submitChapter(chapterId, currentUser)
    Novel->>Novel: verify ownership + validate content
    Novel->>Control: checkContent(CHAPTER, chapter)
    alt Content Control PASS
        Novel->>Novel: set chapter status PUBLISHED
        Novel-->>API: published response
    else NEED_ADMIN_REVIEW
        Novel->>Novel: set chapter status PENDING_MODERATION
        Novel-->>API: pending moderation response
    end
```

## 3. Unlock VIP Chapter Flow

```mermaid
sequenceDiagram
    actor Reader
    participant API as Wallet Controller
    participant Wallet as Wallet Service
    participant Repo as Wallet Repository

    Reader->>API: POST /chapters/{chapterId}/unlock
    API->>Wallet: unlockChapter(readerId, chapterId)
    Wallet->>Repo: begin transaction
    Repo->>Repo: lock reader wallet
    Repo->>Repo: check already unlocked
    Repo->>Repo: decrement reader balance
    Repo->>Repo: increment author balance
    Repo->>Repo: create transaction
    Repo->>Repo: create chapter_unlock
    Repo-->>Wallet: commit
    Wallet-->>API: unlock result
```

## 4. Reading History Sync Flow

```mermaid
sequenceDiagram
    actor Reader
    participant API as Reading Controller
    participant Reading as Reading Service
    participant Redis as Redis Cache
    participant Job as Sync Job
    participant PG as PostgreSQL

    Reader->>API: PUT /reading/history/me
    API->>Reading: syncPosition()
    Reading->>Redis: store latest position
    Reading-->>API: synced cached response
    Job->>Redis: read dirty positions
    Job->>PG: upsert reading_histories
```

## 5. Comment Moderation Flow

```mermaid
sequenceDiagram
    actor Reader
    participant API as Comment Controller
    participant Comment as Comment Service
    participant Control as Content Control Service
    participant Mongo as MongoDB

    Reader->>API: POST /chapters/{chapterId}/comments
    API->>Comment: createComment()
    Comment->>Control: checkContent(COMMENT, comment)
    alt Content Control APPROVED
        Comment->>Mongo: save APPROVED comment
    else PENDING_REVIEW
        Comment->>Mongo: save PENDING_MODERATION comment
    end
    Comment-->>API: comment status response
```

## 6. Writing Copilot Suggestion Flow

```mermaid
sequenceDiagram
    actor Author
    participant API as AI Controller
    participant AI as Copilot Service
    participant Novel as Novel Service
    participant Mongo as Copilot Log Repository

    Author->>API: POST /ai/copilot/suggestions
    API->>AI: generateSuggestion()
    AI->>Novel: load character/timeline/summary context
    Novel-->>AI: official context
    AI->>AI: build prompt with currentDraft + additionalContextText
    AI->>AI: call LLM provider
    AI->>Novel: create context proposals if needed
    AI->>Mongo: store generation log
    AI-->>API: draft suggestion + proposal IDs
```

## 7. Approve Context Proposal Flow

```mermaid
sequenceDiagram
    actor Author
    participant API as AI Controller
    participant AI as Copilot Service
    participant Novel as Novel Service
    participant Mongo as Copilot Log Repository

    Author->>API: POST /ai/copilot/consistency-check
    API->>AI: checkConsistency()
    AI->>Novel: load character/timeline/summary context
    Novel-->>AI: official context
    AI->>AI: build consistency prompt
    AI->>AI: call LLM provider
    AI->>Mongo: store consistency check log
    AI-->>API: context health score + warnings
```

## 8. Approve Context Proposal Flow

```mermaid
sequenceDiagram
    actor Author
    participant API as Novel Controller
    participant Novel as Context Proposal Service
    participant Repo as Context Repository

    Author->>API: POST /context-proposals/{proposalId}/approve
    API->>Novel: approveProposal(proposalId, currentUser)
    Novel->>Repo: begin transaction
    Repo->>Repo: load proposal + verify PENDING
    Repo->>Repo: verify author owns novel
    Repo->>Repo: upsert target context row
    Repo->>Repo: set proposal APPROVED
    Repo-->>Novel: commit
    Novel-->>API: committedResourceId
```

## 9. Admin Moderation Flow

```mermaid
sequenceDiagram
    actor AdminUser as Admin
    participant API as Content Control Controller
    participant Control as Content Control Service
    participant Novel as Novel Service
    participant Comment as Comment Service

    AdminUser->>API: POST /admin/moderation/reviews/{reviewId}/resolve
    API->>Control: resolveModerationReview()
    alt target is novel/chapter
        Control->>Novel: apply moderation decision
    else target is comment
        Control->>Comment: apply moderation decision
    end
    Control->>Control: mark review resolved
    Control-->>API: resolved response
```

## 10. Mock Deposit Flow

```mermaid
sequenceDiagram
    actor User
    participant API as Wallet Controller
    participant Wallet as Wallet Service
    participant Mock as Mock Payment Page

    User->>API: POST /wallet/deposit-sessions
    API->>Wallet: createDepositSession()
    Wallet-->>API: mockPaymentUrl
    User->>Mock: confirm demo payment
    Mock->>API: POST /wallet/mock-webhook/deposit-success
    API->>Wallet: processMockDeposit()
    Wallet->>Wallet: idempotency check + credit wallet
    Wallet-->>API: transaction result
```

# Chương 3 – Biểu đồ lớp

> **Ghi chú kiểm tra:** Các sơ đồ được tách từ [Chương 3](../BAO_CAO_CHUONG_3.md) để xem Mermaid theo nhóm, giảm tải cho trình xem GitHub. Nguồn đối chiếu nghiệp vụ là mã nguồn nhánh `main`; vị trí lưu này chỉ là nhánh tài liệu.

## 3.3.1. Biểu đồ lớp tài khoản và tác phẩm

```mermaid
classDiagram
    class User {
      +UUID userId
      +string email
      +string username
      +UserRole role
      +UserStatus status
    }
    class UserProfile {
      +UUID userId
      +string displayName
      +string avatarUrl
    }
    class RefreshToken {
      +UUID refreshTokenId
      +UUID userId
      +datetime expiresAt
      +datetime revokedAt
    }
    class Novel {
      +UUID novelId
      +UUID authorId
      +string title
      +NovelStatus status
      +string serialStatus
    }
    class Chapter {
      +UUID chapterId
      +UUID novelId
      +int chapterNumber
      +string title
      +ChapterStatus status
      +boolean isVip
      +int priceCoins
    }
    class ChapterRevision {
      +UUID revisionId
      +UUID chapterId
      +string contentHash
      +string sourceType
      +datetime createdAt
    }
    User "1" --> "0..1" UserProfile : sở hữu
    User "1" --> "0..*" RefreshToken : có
    User "1" --> "0..*" Novel : sáng tác
    Novel "1" --> "0..*" Chapter : gồm
    Chapter "1" --> "0..*" ChapterRevision : lịch sử
```

*Hình 3.7. Biểu đồ lớp tài khoản, tác phẩm và phiên bản chương.*

## 3.3.2. Biểu đồ lớp đọc truyện, tương tác và ví

```mermaid
classDiagram
    class ReadingHistory {
      +UUID userId
      +UUID novelId
      +UUID chapterId
      +int paragraphIndex
      +datetime updatedAt
    }
    class ReadingBookmarkEntry {
      +UUID bookmarkId
      +UUID chapterId
      +int paragraphIndex
      +int startOffset
      +int endOffset
    }
    class Comment {
      +string commentId
      +string chapterId
      +string content
      +string status
    }
    class NovelFollow {
      +UUID userId
      +UUID novelId
    }
    class Wallet {
      +UUID walletId
      +UUID userId
      +int coinsBalance
    }
    class CoinTransaction {
      +UUID transactionId
      +string type
      +string status
      +int amountCoins
    }
    class ChapterUnlock {
      +UUID userId
      +UUID chapterId
      +UUID transactionId
    }
    class User {
      +UUID userId
    }
    class Novel {
      +UUID novelId
    }
    class Chapter {
      +UUID chapterId
    }
    User "1" --> "0..*" ReadingHistory
    User "1" --> "0..*" ReadingBookmarkEntry
    User "1" --> "0..*" Comment
    User "1" --> "0..*" NovelFollow
    User "1" --> "0..1" Wallet
    Wallet "1" --> "0..*" CoinTransaction
    User "1" --> "0..*" ChapterUnlock
    Novel "1" --> "0..*" NovelFollow
    Chapter "1" --> "0..*" ChapterUnlock
```

*Hình 3.8. Biểu đồ lớp đọc truyện, tương tác và giao dịch Coin.*

## 3.3.3. Biểu đồ lớp quản lý ngữ cảnh và AI

```mermaid
classDiagram
    class StoryBrain {
      +UUID id
      +UUID novelId
      +long brainVersion
      +string status
    }
    class NarrativeEntity {
      +UUID id
      +string canonicalName
      +string entityType
      +string confirmationStatus
      +boolean isLocked
    }
    class NarrativeEvent {
      +UUID id
      +long narrativeOrder
      +string summary
      +int chapterNumber
    }
    class NarrativeFact {
      +UUID id
      +string factKey
      +string confirmationStatus
      +boolean isLocked
    }
    class NarrativeProposal {
      +UUID id
      +string status
      +string proposalType
    }
    class NarrativeFinding {
      +UUID id
      +string findingType
      +string severity
    }
    class MemoryChunk {
      +UUID id
      +string contentHash
      +string memoryType
    }
    class MemoryEmbedding {
      +UUID id
      +int embeddingDimension
      +string embeddingVersion
    }
    StoryBrain "1" --> "0..*" NarrativeEntity
    StoryBrain "1" --> "0..*" NarrativeEvent
    StoryBrain "1" --> "0..*" NarrativeFact
    StoryBrain "1" --> "0..*" NarrativeProposal
    StoryBrain "1" --> "0..*" NarrativeFinding
    StoryBrain "1" --> "0..*" MemoryChunk
    MemoryChunk "1" --> "0..*" MemoryEmbedding
```

*Hình 3.9. Biểu đồ lớp miền ngữ cảnh truyện và AI.*


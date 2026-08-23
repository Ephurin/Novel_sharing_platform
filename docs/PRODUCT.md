# Product — AI Writing Copilot

## Product vision

Xây dựng một AI Writing Copilot cho tiểu thuyết dài tập. Sản phẩm không chỉ sinh văn bản mà duy trì một mô hình có cấu trúc và liên tục phát triển của thế giới truyện — **Story Brain** — để hỗ trợ tác giả mà không làm mất quyền kiểm soát sáng tạo.

```text
IDEA → PLANNING → WRITING → STORY STATE UPDATE
     → CONSISTENCY CHECK → EDITING → REPEAT
```

## Giá trị cốt lõi

- Hiểu và chuẩn hóa nhân vật, địa điểm, tổ chức, vật phẩm và kỹ năng.
- Theo dõi sự kiện, trạng thái, quan hệ và timeline xuyên nhiều chương.
- Truy xuất đúng context thay vì nhét toàn bộ novel vào prompt.
- Phát hiện plot-hole và giải thích bằng evidence.
- Hỗ trợ planning, writing, checking và editing trong cùng workflow.
- Tôn trọng mọi dữ liệu tác giả đã xác nhận, chỉnh sửa hoặc khóa.

## Người dùng chính

Tác giả đang lập kế hoạch, viết và biên tập truyện dài. Reader, moderator, finance operator và platform administrator không phải persona chính của Copilot.

## Nguyên tắc sản phẩm

1. **Author is the source of truth.** AI chỉ đề xuất hoặc tạo finding.
2. **Story Brain trước generation.** Chất lượng dữ liệu và context quan trọng hơn model lớn.
3. **Explainable assistance.** Cảnh báo phải chỉ ra đoạn văn, entity, event và evidence liên quan.
4. **IDE, not chatbot.** AI hoạt động trong workflow viết thay vì trở thành một chat box tách rời.
5. **Extend over rewrite.** Tận dụng pipeline và API hiện có, mở rộng backward-compatible.

## Phạm vi

### Trong phạm vi

- Rich-text authoring IDE và chapter organization.
- Entity normalization, resolution và author confirmation.
- Event history, timeline, current world state và relation inference.
- Consistency checking bằng deterministic rules kết hợp LLM reasoning.
- Hybrid retrieval và structured context builder.
- Continue, expand, rewrite, dialogue, brainstorm và scene generation.
- Planning objects: premise, character, world, plot, act, chapter và scene.
- Editing assistance: language, style, pacing và AI beta reader.

### Ngoài phạm vi

- Account/profile/KYC và platform RBAC.
- Public publishing workflow và moderation decision cuối cùng.
- Reader app, search/ranking, library và reading history.
- Comment, like, follow và notification.
- Coin, payment, unlock chapter và revenue settlement.

## Quan hệ với Novel Platform

Novel Platform là system of record cho user, novel, chapter, revision và publishing status. Copilot sở hữu dữ liệu dẫn xuất như analysis job, entity mapping, event history, world-state projection, embeddings, findings và suggestions.

Platform phải truyền canonical `author_id`, `novel_id`, `chapter_id`, `revision_id` và `content_hash`. Copilot không tự tạo định danh nghiệp vụ khi tích hợp production.

## Thành công được đo bằng

- Độ chính xác entity/event/state và tỷ lệ cảnh báo sai.
- Khả năng replay event để tái dựng world state.
- Relevance của retrieved context trên truyện dài.
- Tỷ lệ suggestion được chấp nhận và edit distance sau khi chấp nhận.
- P50/P95 latency, token cost và provider error theo operation.
- Tỷ lệ author override để phát hiện điểm yếu của pipeline.

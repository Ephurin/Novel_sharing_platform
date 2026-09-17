# UX — AI Writing IDE

## Mục tiêu

UI là môi trường sáng tác có Story Brain chạy nền, không phải chatbot. Editor luôn là vùng trung tâm; AI xuất hiện theo context và không che khuất việc viết.

## Bố cục chuẩn

```text
┌─────────────────────────────────────────────────────┐
│ Toolbar                                             │
├────┬──────────────┬──────────────────────┬───────────┤
│Act.│ Story/Brain  │ Editor / Main Area   │ AI Panel  │
│Bar │ Sidebar      │                      │           │
├────┴──────────────┴──────────────────────┴───────────┤
│ Status Bar                                          │
└─────────────────────────────────────────────────────┘
```

## Khu vực chính

- **Activity Bar:** Story, Entities, Timeline, Graph, Search, Tasks và Settings.
- **Sidebar:** điều hướng chapter hoặc danh sách theo activity hiện tại.
- **Editor:** rich text, autosave, selection-aware commands và inline findings.
- **AI Panel:** Chat, Suggestions, Context và Tasks; không tự chèn text.
- **Status Bar:** word count, save/sync state, analysis state và warnings.
- **Focus Mode:** ẩn vùng phụ nhưng giữ khả năng thoát rõ ràng.

## Workflow ưu tiên

1. Mở project và chapter.
2. Viết/chỉnh sửa với autosave và revision history.
3. Yêu cầu AI hoặc nhận background analysis.
4. Preview suggestion dưới dạng diff.
5. Accept, reject, edit hoặc undo.
6. Điều tra consistency warning qua evidence.
7. Xem entity, event, relation và timeline khi cần.

## Human-in-the-loop

- AI không tự thay đổi nội dung editor hoặc canonical facts.
- Entity/relation/event inference phải có trạng thái proposed, confirmed, rejected hoặc locked.
- Warning có nút “Why?” và liên kết tới đoạn văn, entity, event trước đó.
- Author override được ghi audit và được ưu tiên trong các lần phân tích sau.

## Trạng thái UI bắt buộc

- Idle, analyzing, generating, saving, synced, failed và offline.
- Empty state cho project/chapter/knowledge chưa có dữ liệu.
- Error có hành động retry; không chỉ ghi vào console.
- Long-running analysis dùng progress/polling/SSE, không khóa editor.

## Prototype gần nhất

- Hoàn thiện project/chapter persistence thay cho mock tree.
- Kết nối canonical story/chapter/revision ID.
- Autosave và recovery.
- Entity review, timeline và consistency evidence.
- Suggestion preview/diff và undo.

Các màn hình planning, multi-agent collaboration và dashboard nâng cao chỉ triển khai sau khi workflow viết cốt lõi ổn định.

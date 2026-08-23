# Development Rules

## Golden rules

Trước khi triển khai tính năng mới:

1. Đọc kiến trúc và kiểm tra component hiện có.
2. Ưu tiên mở rộng thay vì rewrite.
3. Không duplicate capability hoặc tạo endpoint mới nếu contract hiện tại có thể mở rộng an toàn.
4. Thay đổi schema phải versioned và backward-compatible hoặc có migration.
5. Tách AI inference khỏi dữ liệu tác giả xác nhận.
6. Không âm thầm overwrite author decision.
7. Ưu tiên deterministic logic khi đủ; chỉ dùng LLM cho semantic reasoning.
8. Mỗi pipeline stage mới phải có test với fake/stub provider.
9. Giữ route mỏng; orchestration nằm trong application/service layer.
10. Cập nhật README/API/architecture trong cùng thay đổi cấu trúc.

## API

- Dùng Pydantic request/response schema; không trả raw provider response.
- Chuẩn hóa error code cho validation, provider, parsing, conflict và persistence.
- Operation thay đổi state phải hỗ trợ idempotency.
- Long-running task dùng job API; không giữ HTTP request không giới hạn.
- Không hard-code endpoint, origin, model hoặc secret.

## Knowledge and memory

- Event history là source of truth của diễn tiến.
- Current state và relationship là projection có thể rebuild.
- Mọi fact/finding có provenance, revision và pipeline version.
- Author-confirmed/locked facts không bị AI override.
- Persistence phải atomic; production dùng transaction và migration.

## LLM usage

- Prompt có version và output schema rõ.
- Validate output trước khi ghi; malformed output là lỗi quan sát được.
- Ghi provider/model, latency, token usage và retry count.
- Không log secret hoặc toàn bộ nội dung truyện mặc định.
- Có timeout, bounded retry và fallback policy theo operation.
- Fine-tune chỉ khi evaluation chứng minh prompt/retrieval không giải quyết được bottleneck.

## Testing

- Unit test cho normalization, resolution, projection và deterministic rules.
- Contract test cho API schema và error behavior.
- Replay/idempotency test cho event/state.
- Golden dataset cho entity, event, consistency và retrieval.
- Provider integration test tách khỏi default local test suite.

## Documentation

- `docs/README.md` là chỉ mục duy nhất.
- Không thêm weekly notes, prompt brainstorm hoặc SRS platform vào repo.
- Quyết định kiến trúc bền vững nên viết ADR; backlog chỉ cập nhật trong `docs/ROADMAP.md`.
- Test story phải nằm trong test fixtures, không nằm trong `docs/`.

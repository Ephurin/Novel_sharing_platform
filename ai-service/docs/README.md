# AI Writing Copilot Documentation

Đây là nguồn tài liệu chuẩn cho module AI Writing Copilot trong Novel Sharing Platform. Bộ SRA/SRS của dự án chính được giữ nguyên tại `../../docs/SRA_doc/` và không trộn vào specification của Copilot.

## Bắt đầu từ đây

| Tài liệu | Nội dung |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Tầm nhìn, người dùng, phạm vi và ranh giới với Novel Platform |
| [USE_CASES.md](USE_CASES.md) | Hai luồng khởi tạo Story Brain và vòng lặp sáng tác chính |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc hiện tại, dữ liệu, pipeline và kiến trúc đích |
| [ROADMAP.md](ROADMAP.md) | Thứ tự phát triển và exit criteria |
| [UX.md](UX.md) | Kiến trúc thông tin và nguyên tắc trải nghiệm viết |
| [PIPELINE.md](PIPELINE.md) | Sơ đồ hóa toàn bộ pipeline: bootstrap, import, writing loop, analysis, generation |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Quy tắc mở rộng hệ thống và chuẩn chất lượng |
| [API reference](API_DOC.md) | Endpoint của FastAPI AI service |
| [STATE_PROJECTION.md](STATE_PROJECTION.md) | Event sourcing, deterministic state projection và timeline rebuild |

## Implementation baseline

Các tài liệu dưới đây là thiết kế đích đã hoàn tất review để bắt đầu implementation tăng dần:

| Tài liệu | Nội dung |
|---|---|
| [DATA_MODEL.md](DATA_MODEL.md) | ERD, DDL draft, invariants, transaction và migration từ JSON |
| [API_CONTRACTS.md](API_CONTRACTS.md) | API đích, job lifecycle, proposal review và error contract |
| [ADRS.md](ADRS.md) | Các quyết định kiến trúc đã được chấp nhận và quyết định phase-gated |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phase triển khai, mapping code cũ và exit criteria |
| [TEST_AND_EVALUATION.md](TEST_AND_EVALUATION.md) | Test pyramid, golden datasets, metrics và release gates |
| [SECURITY_AND_OPERATIONS.md](SECURITY_AND_OPERATIONS.md) | Permission, privacy, observability, SLO và recovery |

Pre-implementation review hoàn tất ngày 2026-08-27. Endpoint và DDL bên trong là accepted design baseline nhưng chưa đồng nghĩa đã được triển khai; code hiện hành vẫn là nguồn sự thật về runtime.

### Thứ tự review đề xuất

1. `ADRS.md`: accept/reject các quyết định nền tảng.
2. `DATA_MODEL.md`: kiểm tra aggregate, source of truth và transaction.
3. `API_CONTRACTS.md`: kiểm tra workflow từ góc nhìn frontend/platform.
4. `IMPLEMENTATION_PLAN.md`: kiểm tra thứ tự migration và phạm vi MVP.
5. `TEST_AND_EVALUATION.md`: chốt quality gates.
6. `SECURITY_AND_OPERATIONS.md`: chốt privacy, permission, SLO và budget.

Các lựa chọn queue implementation và embedding model/dimension được cố ý phase-gate trước Phase 3 và Phase 7; chúng không block Phase 0–2.

## Nguồn sự thật

1. Code trong `web-ui/` và `ai-service/` quyết định hành vi hiện tại.
2. `ARCHITECTURE.md` mô tả kiến trúc đã thống nhất.
3. `ROADMAP.md` là backlog định hướng duy nhất.
4. `ADRS.md` ghi quyết định đã được chấp nhận trước khi implementation.
5. Khi code thay đổi API, schema hoặc pipeline, cập nhật tài liệu liên quan trong cùng thay đổi.

## Phạm vi repo

Repo tập trung vào authoring IDE và Story Brain: entity, event, world state, consistency, retrieval và writing assistance. Authentication, publishing, reader experience, community, moderation vận hành và payment thuộc Novel Platform bên ngoài.

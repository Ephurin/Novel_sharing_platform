# AI Writing Copilot Documentation

Đây là nguồn tài liệu chuẩn cho module AI Writing Copilot trong Novel Sharing Platform. Bộ SRA/SRS của dự án chính được giữ nguyên tại `../../docs/SRA_doc/` và không trộn vào specification của Copilot.

**Workflow hiện hành:** [WORKFLOW_CONTRACT.md revision1.3](../../Pipeline_test/WORKFLOW_CONTRACT.md)
là nguồn chuẩn của P1/P2/P3 và human entity review. Khi các thiết kế lịch sử trong
bộ docs này khác contract, ưu tiên contract; pipeline map là bản đối chiếu code/evidence.

## Bắt đầu từ đây

| Tài liệu | Nội dung |
|---|---|
| [DEFENSE_QNA_HANDOVER.md](DEFENSE_QNA_HANDOVER.md) | 🎓 Sổ tay vấn đáp bảo vệ tốt nghiệp & bàn giao kỹ thuật |
| [PRODUCT.md](PRODUCT.md) | Tầm nhìn, người dùng, phạm vi và ranh giới với Novel Platform |
| [Workflow contract](../../Pipeline_test/WORKFLOW_CONTRACT.md) | Source of truth P1/P2/P3, review gates và ranh giới tự động |
| [USE_CASES.md](USE_CASES.md) | Dẫn đến contract hiện hành; phần UC-01/02/03 bên dưới là thiết kế lịch sử |
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

# Bản đồ AI pipeline

Nguồn chuẩn mô tả hành vi P1/P2/P3 là [WORKFLOW_CONTRACT.md revision1.4](../WORKFLOW_CONTRACT.md). Bản đồ là snapshot đối chiếu code/evidence và vấn đề, không thay thế contract.

**Snapshot/limitations:** This map was generated from source around **2026-10-20 (HEAD `94d5072` + working tree)**. It is a **historical map**, not an accurate 2026-10-21 current status after Wave 1B/1C/1D. Do not take `[ok]` labels as latest or as LIVE_UI/real-provider PASS. See [Current architecture](../../ai-service/docs/ARCHITECTURE.md) and [2026-10-21 delta](CURRENT_DELTA_2026-10-21.md).

Human review branch shown in the snapshot: hints → review entity → event/fact; implementation opt-in, feature flag OFF by default. X05/X06 are proposals. Historical `2026-10-20-human-entity-review` report and previous `2026-10-21-gemini-p1-live-01` failed provider S02 are distinct run evidence; latest Wave 1B/1C offline patches do **not** prove live acceptance.

- **Mở xem độc lập:** `ai-pipeline-map-standalone.html` — mở bằng trình duyệt, chọn khối và mở từng bước. Không cần backend/AI hoặc gọi provider.
- **Đọc toàn bộ dưới dạng văn bản:** `AI_PIPELINE_MAP.md`.
- **Dữ liệu đối chiếu:** `pipeline-map-data.json` — 87 bước, 24 vấn đề/giới hạn, nguồn code và fingerprints tại thời điểm lập bản đồ.
- **Nguồn hiển thị trong hội thoại:** `ai-pipeline-map.html` (fragment, không phải bản HTML độc lập).
- **Nguồn dựng lại:** `build_pipeline_map.py` và `pipeline-map.template.html`.
- **Kiểm chứng hiển thị mới:** `map-human-review-qa.json`, `map-human-review-preview.png`; `map-qa.json`/`map-preview.png` là bản trước human review.

## Phạm vi

Bản đồ ba luồng canonical P1/P2/P3 và các bước dùng chung, dựa trên code, run live `2026-10-19-recovery-ui-01` và offline regression `2026-10-20-human-entity-review`. Phân biệt lỗi đã tái hiện, code chưa live retest và phần còn là thiết kế. Không coi mọi bước có code là đã PASS. `15/35` là assertions gold, không phải entity recall.

## Cập nhật

Sửa nội dung các bước/vấn đề trong `build_pipeline_map.py`; sửa cách hiển thị trong `pipeline-map.template.html`, rồi chạy từ root:

```powershell
python Pipeline_test/architecture/build_pipeline_map.py
```

Lệnh này dựng lại JSON, Markdown và fragment, đồng thời cập nhật snapshot nguồn; không khởi động app, sửa dữ liệu truyện hoặc gọi LLM. Bản standalone cần export lại bằng công cụ render sau khi cập nhật fragment; QA cũ không tự trở thành QA của bản mới.

Khi sửa code, giữ mã bước/issue ổn định để liên kết báo cáo retest. Chỉ đóng một vấn đề khi có bằng chứng đáp ứng điều kiện tương ứng; không thay bằng chứng lịch sử bằng kết quả mới.

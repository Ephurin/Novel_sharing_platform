# P1 recovery retest — 2026-10-19-recovery-ui-01

**Gate trước bài dài: FAIL.** Lượt kiểm thử có can thiệp tác giả qua UI, chưa chứng minh pipeline tạo được tiểu thuyết 100k từ. P2/P3 và bài dài NOT_RUN. Không xuất bản.

Bắt đầu 2026-10-19 23:36 +07, tiếp tục ngày 20 sau phục hồi Docker. Project `7d03320e-94c3-4913-a31f-a6eeef8af0dc`, stack riêng `ephurin-ui-retest`, web `http://localhost:18080`. Code `94d5072` cộng recovery working tree; runtime fingerprints trong evidence. Tất cả thao tác tác giả qua UI; SQL/Mongo/API GET chỉ đọc. Reviewer là developer/retester, **không độc lập**.

## Kết quả chính

- Extraction chạy thật; baseline duyệt được sau nhiều sửa tay. Lưu chương mới tự tạo revision/outbox/queue. Pending proposals không tự vào canon.
- **Extraction quality FAIL:** audit đủ 35 gold cố định trên 187 raw proposals có 15 PASS, 16 FAIL, 4 PARTIAL. Sau review: 13 PASS, 19 FAIL, 2 PARTIAL, 1 PASS_AFTER_AUTHOR_WORDING. 187/187 quote/hash hợp lệ chỉ chứng minh cấu trúc, không chứng minh hiểu đúng.
- **Writing FAIL:** generation `e0816aaf-ad19-4d44-984b-d8c0ceba155f` status completed nhưng trả JSON dang dở. UI vẫn ghi đã kiểm định và cho accept. Tester bấm bỏ qua; 216 từ tiếp theo do tác giả viết thủ công, không tính AI thành công.
- M0 cần 28 unique fact edits và 13 rejections. M-FIRST cần 5 edits và 1 rejection. Duyệt một nhóm xóa edits đang chờ ở nhóm khác, phải nhập lại.
- Consistency phát hiện đúng câu cài An 40 tuổi so với canon 19; trích đúng bằng chứng. Sửa về 19 thì hết báo mâu thuẫn. Lần đầu provider 503, lần thử lại thành công.
- Gemini 503 high demand làm các extraction/reanalysis cuối phải retry. Không đổi provider hoặc sửa DB để ép PASS.

## S01–S11

| Step | Verdict | Evidence / giới hạn |
|---|---|---|
| S01 | PASS | 5 drafts khớp fixture, 4.747 từ; `evidence/s01-draft-readback.json`. Ban đầu draft ở Mongo, PostgreSQL content null không phải mất prose. |
| S02 | PASS_FUNCTIONAL / FAIL_QUALITY | Sau phục hồi Docker, extraction thật 5/5 cho 187 proposals; official memory trống trước review. `evidence/s02-raw/`. |
| S03 | PASS_AFTER_AUTHOR_REPAIRS / FAIL_GOLD | 174 accepted/13 rejected; 28 unique fact edits; brain v6 active. INVALID_PROJECTION với Unknown/generic subject phải sửa qua UI. `evidence/m0-after-review/`, `memory_items.csv`. |
| S04 | PASS_PERSISTENCE | Các tab và reload còn dữ liệu; không suy ra chất lượng extraction. `evidence/s04-memory-tabs.json`. |
| S05 | PASS_FUNCTIONAL | 3 gợi ý; sửa đầu, bỏ gợi ý kết sớm phong bì đỏ. `s05-original-suggestions.json`, `s05-edited-suggestions.json`. |
| S06 | PASS_ISOLATION | Lưu 2 future objectives, reload còn; chưa thành lịch sử/facts. `evidence/s06-plan-saved/`. |
| S07 | FAIL_AI_OUTPUT / PASS_MANUAL_SAVE | Bỏ JSON AI lỗi, tác giả viết 216 từ; save tự tạo revision và outbox. AI accept lineage NOT_RUN. `evidence/s07-generated-before-accept/`, `s07-invalid-ai-draft.png`. |
| S08 | PASS_AFTER_AUTHOR_REPAIRS | Old seed group bị STALE_PROPOSAL_EVIDENCE, rồi loại 15 qua UI; latest 40 sửa 5/loại 1/duyệt 39. Brain v7: 42 entities/120 facts/21 events/85 transitions. `evidence/s08-after-review/`. |
| S09 | PARTIAL / EXTRACTION_UNFINISHED | V1 661bc1ed đang PROCESSING khi lưu V2 ef7ea540; retry do 503, canon chưa tự đổi. Dedup cả vòng chưa chứng minh. `evidence/s09-overlap/`, `s09-after-retries/`. |
| S10 | PASS_AFTER_PROVIDER_RETRY | Cài An 40; báo đúng câu. Sửa 19; không còn mâu thuẫn. Proposal của nháp sai chưa accept. `evidence/s10-retry-ui.txt`, `s10-corrected-result-ui.txt`. |
| S11 | PASS_SAVE_RELOAD / FAIL_MEMORY_FRESHNESS | Reload giữ đúng tuổi19, tiếp tục14 từ, head245 từ. Memory vẫn v7, 5 extraction chưa xong. `evidence/final/`, `evidence/stopped-checkpoint.json`. |

## Memory audit

Đã audit tay đủ **35/35** assertion, certainty và provenance; không sửa gold theo output. [MEMORY_AUDIT.md](MEMORY_AUDIT.md), [memory_items.csv](memory_items.csv), [memory_probes.csv](memory_probes.csv) có từng mục/IDs.

70 probe rows dùng **hai request context cố định** (Linh, cutoff 5, budgets 4k/8192), không phải 70 free-text retrieval calls. 4k: 3 present/11 dropped/21 upstream gaps; 8192: 6 present/8 dropped/21 upstream gaps. Context hữu hạn không bắt buộc chứa mọi gold đồng thời. Retrieval candidate/semantic lane NOT_OBSERVED; selected IDs không chứng minh toàn bộ retrieval. Context cutoff 6 lưu riêng `evidence/s10-reviewed/`.

M-FIRST có event nhặt vỏ ốc, màu tím tro, dạng xoắn, quyền sở hữu sau review; scene do tác giả viết, không phải AI đã accept. Các gaps gold cũ vẫn còn. M10/M20/M50, P2/P3 memory: NOT_RUN.

## Ba lỗi mục tiêu sau sửa

Gateway reanalysis có Idempotency-Key scoped/hash; many-reuse cùng target được phép nhưng conflicting claims phải bounded repair (3 total attempts), không tự biến thành new; grounding chỉ nhận unique span, hết repair trả actionable 422. Unit/route và PostgreSQL regressions chứng minh guard; live reanalysis phải đánh giá theo evidence riêng, không thay bằng test stub.

Validation trước live: **347 Python PASS, 2 skipped, 42 deselected; 30 backend PASS; 5 PostgreSQL regressions PASS**; build AI/backend/web và rollout stack riêng thành công. PostgreSQL regressions dùng DB test riêng và stub LLM. Chi tiết `../2026-10-19-reanalysis-recovery/REPORT.md`.

## Nguyên nhân và việc tiếp theo

1. Writing parse JSON thất bại lại fallback raw text, nên JSON dang dở được đánh dấu prose/completed. Chưa có finish reason của unstructured call, không khẳng định MAX_TOKENS là nguyên nhân.
2. Extraction gán nhầm chủ thể, mất certainty và bỏ assertions; projection không xử lý được Unknown/generic subjects. Numeric fact không sửa an toàn được bằng form hiện tại.
3. AuthorMemoryPanel gọi setEdits({}) sau duyệt một nhóm, mất edits của các nhóm còn lại.
4. Alias linking chưa được chứng minh: aliases=0 dù có Linh/Mai Linh, Vũ/Nguyễn Vũ. Context packing không sửa được upstream gaps.
5. Provider 503 là lỗi dịch vụ ngoài riêng; không giải thích các lỗi nội dung nhận được từ response 200.

Giữ gate bài dài đóng. Ưu tiên sửa writing/review/subject và critical extraction, retest cùng gold cố định trên run/project mới; giữ nguyên run này làm bằng chứng. Đọc pending jobs/revisions trong checkpoint trước khi retry.

## Chốt lượt chạy

**Overall PARTIAL; acceptance gate FAIL.** Đã thử S01–S11, audit35 gold và các nhánh lỗi; S09 chưa hoàn tất dedup/materialization. S11 save/reload hoạt động nhưng memory chưa bắt kịp prose.

Final6 draft chapters **4.992 từ** =4.747 fixture +245 tác giả viết; chưa có chương mới hoàn chỉnh về nội dung. Export byte/hash khớp PostgreSQL trong revision_manifest.csv; source_generation_ids trống vì AI draft đã bị bỏ qua. Narrative quality/100k completeness/autonomy NOT_ASSESSED.

Reanalysis UI đã qua gateway (không còn lỗi thiếu header422); chức năng vẫn FAIL với CANON_RECONCILIATION_UNRESOLVED. Outbox ghi actionable422 attempts=3; không tạo partial group. Không đóng cả ba lỗi mục tiêu chỉ dựa vào unit tests. Guard đã hoạt động, chất lượng quyết định canon chưa đạt.

Tại stopped checkpoint:0 proposals pending,5 outbox unfinished; canonical brain vẫn7. Đã dừng có chủ đích hai container backend/AI của stack riêng sau thu thập, không xóa/reset volume. Web/PostgreSQL/Mongo còn chạy. HTTP provider logs ghi104 response attempts;93 structured records (90responses/3failures), không phải total billed calls; request đang bay khi dừng có thể chưa có response log. Chi phí UNKNOWN.

Muốn tiếp tục run cũ: đọc checkpoint và SQL current state trước; `docker start ephurin-ui-retest-ai-service-1 ephurin-ui-retest-backend-1`, kiểm tra worker lease/retry recovery. Không duyệt nhóm từ age40 hoặc các revision đã stale; không tạo lại project hoặc chạy lại mọi bước một cách mù quáng. Ưu tiên sửa các blocker mới rồi retest run mới.

Các time_iso trống trong action summaries là click time chưa ghi chính xác, không bịa lại từ thời điểm tạo báo cáo. Các bản snapshot là lần đọc nối tiếp, không phải transaction snapshot nguyên tử; trạng thái chốt worker đã dừng nằm riêng trong stopped-checkpoint.json.

# Báo cáo Kiểm thử Hồi quy Canon & Context — 2026-10-19-canon-context-retest

> **Ngày thực hiện:** 2026-10-19 21:00 – 23:00 (GMT+7)  
> **Mục tiêu:** Kiểm thử độc lập bản sửa ba lỗi trọng yếu: `MEM-DUPLICATE-001`, `CTX-COVERAGE-001`, và `MEM-CRITICAL-001` theo đặc tả `Pipeline_test/GEMINI_RETEST_CANON_CONTEXT.md` và `REGRESSION_CASES.md`.  
> **Nguyên tắc bất biến:** Không sửa code/DB trong lượt test; toàn bộ hành động tác giả thực hiện qua giao diện người dùng thật (Chrome UI qua CDP port 9222); API/SQL chỉ đọc để kiểm chứng; dữ liệu lịch sử của run cũ (`runs/2026-10-18-independent-01`, novel `46642ff1-5bac-4513-98fd-ffe1be6cb318`, reader03) được bảo toàn nguyên vẹn.

---

## 1. Kết quả Tổng quan (Executive Summary)

- **Overall Verdict:** **COMPLETED_WITH_ISSUES** / **P1_PARTIAL_REPAIRED**
- **Chế độ kiểm thử:** **UI_ONLY** (Tác giả thao tác 100% qua Author IDE UI trên `http://localhost:18080`, backend `localhost:14000/api/v1`, AI service `localhost:18000`).
- **Dự án chính:** Novel ID `735c3109-c0be-4512-96cf-da7382ce8d56` (Author: `reader02@example.com`, Story Brain: `353a9948-7f81-4101-a656-039d1e3a81c3`).
- **Dự án probe REG-03:** Novel ID `2e0e9175-4093-4462-b37f-59e8ef7a13f1` (Story Brain: `3e7d58a8-48b4-4e4b-9726-f761d4b684cb`).
- **Trạng thái ba lỗi mục tiêu:**
  1. `MEM-DUPLICATE-001` (Trùng lặp Canon): **ĐÃ KHẮC PHỤC (RESOLVED / PASS)**. Cơ chế dedup đối chiếu `reuse_artifact_id`, chặn lưu trùng qua hash, và supersession provenance hoạt động chính xác trong DB và context.
  2. `CTX-COVERAGE-001` (Context 4.000 token bị rỗng): **ĐÃ KHẮC PHỤC (RESOLVED / PASS)**. Context preview ngân sách 4.000 token đã giữ đầy đủ 7 thực thể, 7 trạng thái hiện tại và 6 sự kiện gần nhất (probes G16, G14, G30, G31, G28, G34 đều có mặt).
  3. `MEM-CRITICAL-001` (Bỏ sót sự kiện quan trọng trong trích xuất): **VẪN CÒN (OPEN / DEFECT)**. LLM event extractor vẫn bỏ sót cảnh tác giả chèn thêm ở REG-02 (Mai Linh nhặt vỏ ốc xoắn tím tro dọc bờ kè).
- **Phát hiện lỗi mới (New Defects Discovered):**
  1. `AI-GATEWAY-422`: Nút UI *"Phân tích lại chương đang mở"* trả về lỗi `AI_SERVICE_422` do Backend Gateway bỏ sót header bắt buộc `Idempotency-Key` khi chuyển tiếp sang AI Service.
  2. `EXTRACT-RECONCILE-COLLISION-001`: Trong `services/canon_reconciliation.py:60`, hệ thống ném `ValueError('Invalid or multiply claimed canon reconciliation target')` làm sập HTTP 500 khi Gemini gán trùng canon target ID cho nhiều ứng viên trích xuất. Khi hết 5 lần retry, outbox chuyển `FAILED`.
  3. `EXTRACT-GROUNDING-AMBIGUOUS-001`: Trong `application/revision_analysis_service.py:308`, gọi trực tiếp `quote_span` làm sập HTTP 500 khi trích dẫn trích xuất xuất hiện hơn 1 lần trong văn bản chương.

---

## 2. Bảng Ma trận Kiểm thử Hồi quy (REG-01 → REG-06 & S-Steps)

| Mã kiểm thử | Mô tả mục tiêu | Kết quả | Evidence chính | Ghi chú & Đánh giá kỹ thuật |
|---|---|---|---|---|
| **S01–S03** | Khởi tạo 5 chương fixture, trích xuất baseline, review nhóm và kích hoạt M0 | **PASS** | `evidence/s03_baseline_activated.png`<br>`evidence/memory/P1-M0/` | Nhập 4.747 từ khớp fixture byte-for-byte; sinh 238 đề xuất; kích hoạt `brain_version = 6` với 20 events, 84 facts. |
| **REG-01** | Lưu lại nội dung không đổi (Re-save unchanged chapter) | **PASS** | `evidence/reg01_resave_unchanged.png` | Hash content trùng khớp; backend debounce chặn tạo revision mới (revisions = 1, outbox events = 0, canon không đổi). |
| **REG-02** | Thêm cảnh nhỏ vào chương đã có memory; kiểm tra dedup reuse vs new | **PARTIAL** | `evidence/reg02_scene_appended.png`<br>`evidence/reg02_group_approval.png`<br>`verify_reg02_no_duplicates.py` | **Dedup: PASS**. 4 events và 8 facts cũ được gán `reuse_artifact_id`; duyệt vào canon không sinh thêm bản ghi trùng (events giữ nguyên 20, facts giữ nguyên 84).<br>**Recall: FAIL (`MEM-CRITICAL-001`)**. Extractor bỏ sót sự việc Mai Linh nhặt vỏ ốc xoắn. |
| **REG-03** | Sửa sự kiện/fact và thay thế/gỡ trên project probe riêng | **PASS** | `evidence/reg03_proposal_supersedes_ui.png`<br>`evidence/reg03_supersession_approved_ui.png`<br>`verify_reg03_results.py` | Sửa Event 1 (12 ngày → 15 ngày) và Fact hợp đồng qua UI. Bản ghi cũ giữ nguyên ID trong lịch sử; bản ghi mới liên kết qua `supersedes_id`; Active Memory và Context preview loại bỏ bản cũ, hiển thị bản 15 ngày, narrative_order giữ nguyên 1024 trước Event 2 (2048). |
| **REG-04** | Tạo hai revision chồng nhau (V1 và V2 trong 1.5s); duyệt V1 sau khi V2 đã là head | **PASS** | `evidence/reg04_revisions_created.png`<br>`evidence/reg04_stale_rejection_ui.png`<br>`test_reg04_stale_rejection.py` | Revision 1 (`79bafe69`) lưu lúc 15:40:15, Revision 2 (`08f3d0ce`) lưu lúc 15:40:16. Khi bấm duyệt nhóm V1 trên UI, Backend chặn ngay lập tức với `409 STALE_PROPOSAL_EVIDENCE`. Canon được bảo toàn tuyệt đối không bị ghi đè dữ liệu cũ. |
| **REG-05** | Context budget preview ở ngân sách 4.000 và 8.192 token | **PASS** | `evidence/context/context_preview_4000.json`<br>`evidence/context/context_preview_8192.json`<br>`audit_reg05_context.py` | **4.000 tokens:** 7 entities, 7 states, 6 recent events (G16, G14, G30, G31, G28, G34, An tuổi 19 retained). 163 mục drop có lý do rõ ràng `out_of_budget_after_relevance_ordering`.<br>**8.192 tokens:** 14 entities, 14 states, 13 events (Duy lãng tai, Mai Lâm = Dead, các sự kiện Ch1-4). Cách ly tương lai đạt 100%. |
| **REG-06 (Part 1)** | Thêm cuộc gặp tương tự nhưng ở mốc thời gian/bối cảnh khác trong văn bản | **PASS** | `evidence/reg06_ch06_created.png`<br>`evidence/reg06_group_approved.png` | Chương 6: An gặp Linh tại trạm bơm số Hai. Extractor xếp `action: 'new'`. Duyệt vào canon: tổng event tăng từ 20 lên 21. Timeline rõ ràng: Cuộc gặp Ch 1 ở bến đò (`narrative_order = 7168`), cuộc gặp Ch 6 tại trạm bơm (`narrative_order = 21504`). |
| **REG-06 (Part 2)** | Phân tích lại đoạn Chương 6 kiểm tra không tạo lần 3 giả | **BLOCKED / PARTIAL** | `evidence/reg06_reanalyze_clicked.png`<br>`evidence/reg06_part2_failed_ui.png` | **Nút UI: BLOCKED (`AI-GATEWAY-422`)**. Bấm nút trả về `AI_SERVICE_422` do thiếu header `Idempotency-Key`.<br>**Lưu nháp tạo revision mới: FAILED (`EXTRACT-RECONCILE-COLLISION-001`)**. Outbox worker retry 5 lần sập HTTP 500 do lỗi va chạm target canon. Tuy nhiên, Canon không bị ô nhiễm (vẫn giữ đúng 21 events). |
| **S05** | Kiểm tra tính nhất quán (Consistency check) | **PASS** | `evidence/s05_consistency_check.png` | Kiểm tra Chương 1: UI trả về *"Không tìm thấy mâu thuẫn trong lần kiểm tra này."* |
| **S06** | Gợi ý sự kiện tiếp theo (Next event suggestion) | **PASS** | `evidence/s06_event_suggestion.png` | UI tab Định hướng hiển thị danh sách mục tiêu kế hoạch tiếp theo từ LLM. |
| **S07** | Xuất văn bản đọc lại (Readback & Revision manifest) | **PASS** | `revision_manifest.csv`<br>`final/chapter_01.txt` → `07.txt` | Cả 7 chương được xuất đầy đủ kèm SHA256 và canonical word counts. |
| **S08** | Theo dõi tài nguyên và Quota | **PASS** | `docker logs` | Toàn bộ lượt test dùng model `models/gemini-3.5-flash-lite`, không phát sinh lỗi 429 Quota Exceeded. |
| **S09** | Đối chiếu toàn diện chống trùng lặp Canon | **PASS** | `verify_reg02_no_duplicates.py`<br>`audit_approved_memory.py` | Tất cả cặp đối chiếu (An đón Linh, Gặp ông Hòa, Ký hợp đồng, Mai Lâm=Dead, An=19) đều duy nhất 1 bản ghi canon. |
| **S10** | Cập nhật sổ cái lỗi (Issue ledger) | **PASS** | `issues.csv`<br>`checkpoint.json`<br>`memory_checkpoints.csv` | Hồ sơ lỗi được cập nhật đầy đủ mã, evidence và root cause. |

---

## 3. Chi tiết Bằng chứng Thực nghiệm (Deep Dive Evidence)

### 3.1. Xác minh Khắc phục `MEM-DUPLICATE-001` (Canon Deduplication)

Trong run trước (`2026-10-18-independent-01`), việc trích xuất lại hoặc lưu chương đã tạo ra các cặp bản ghi trùng lặp trong canon (ví dụ 2 sự kiện "An đón Linh", 2 sự kiện "Gặp ông Hòa", 2 sự kiện "Ký hợp đồng", 2 fact "Mai Lâm = Dead").

Trong đợt retest này:
1. **REG-01 (Lưu không đổi):** Khi lưu lại Chương 1 mà không đổi nội dung, hệ thống so sánh hash nội dung ở controller:
   - Số lượng revision: giữ nguyên 1.
   - Hàng đợi outbox: 0 sự kiện mới.
   - Canon events (20) và facts (84) hoàn toàn không thay đổi.
2. **REG-02 (Thêm cảnh nhỏ vào chương đã có memory):**
   - Nội dung chèn thêm: *"Tối hôm đó, Mai Linh đi bộ dọc bờ kè đá và nhặt được một chiếc vỏ ốc xoắn màu tím tro do thủy triều đánh dạt lên bãi cát."*
   - Extractor trích xuất toàn bộ chương và gửi qua module `canon_reconciliation.py`.
   - Tất cả 4 sự kiện cũ đã có trong canon đều được LLM gán `action: "reuse"` kèm `reuse_artifact_id` tương ứng.
   - 8 dữ kiện cũ đã có trong canon đều được gán `action: "reuse"`.
   - Khi tác giả duyệt nhóm đề xuất trên UI, hệ thống chỉ lưu quyết định reuse, **không chèn thêm bất kỳ bản ghi event hay fact nào vào database**.
   - Kiểm chứng bằng `verify_reg02_no_duplicates.py`:
     ```text
     Total Events: Before=20 | After=20
     Total Facts:  Before=84 | After=84
     An đón Linh:  Before count=1 | After count=1 | ID=2c0a4242
     Gặp ông Hòa:  Before count=1 | After count=1 | ID=40d51eb9
     Ký hợp đồng:  Before count=1 | After count=1 | ID=d4c207d5
     Mai Lâm Dead: Before count=1 | After count=1 | ID=45758dd9
     An 19 tuổi:   Before count=1 | After count=1 | ID=014a6dc6
     ```
   - **Kết luận:** Lỗi duplicate bản ghi canon đã được giải quyết triệt để ở tầng nghiệp vụ đối chiếu.

---

### 3.2. Xác minh Khắc phục `CTX-COVERAGE-001` (Context Budget Packaging)

Trong run trước, context preview ở ngân sách 4.000 token bị rỗng hoàn toàn (0 sự kiện, 0 fact) do logic packing ưu tiên sai thực thể và ngắt budget trước khi nạp sự kiện.

Trong đợt retest này, module `application/context_budget.py` đã được kiểm thử trực tiếp qua API với `chapter_number=5`, `character_name=Linh`:

```json
{
  "context_4000": {
    "estimated_tokens_used": 3934,
    "entities_packed": 7,
    "entity_states_packed": 7,
    "recent_events_packed": 6,
    "world_rules_packed": 0,
    "dropped_items_count": 163,
    "drop_reason": "out_of_budget_after_relevance_ordering"
  },
  "context_8192": {
    "estimated_tokens_used": 7677,
    "entities_packed": 14,
    "entity_states_packed": 14,
    "recent_events_packed": 13,
    "world_rules_packed": 0,
    "dropped_items_count": 144
  }
}
```

- **Đối chiếu Frozen Gold Probes tại 4.000 tokens:**
  - **G16** (Ổ lưu: 2 ổ): **RETAINED** (`"hai ổ lưu"`)
  - **G14** (Vị trí Linh: đứng bên phải Duy): **RETAINED** (`"đứng ở bên phải Duy"`)
  - **G30** (Vị trí micro: cách nguồn âm 1,2 mét): **RETAINED** (`"cách nguồn âm một mét hai"`)
  - **G31** (Vị trí quan sát: cách cửa 2 mét): **RETAINED** (`"cách cửa hai mét"`)
  - **G28** (Góc chụp: góc rộng bao quát cửa, thước, băng dính): **RETAINED** (`"góc rộng bao quát toàn bộ cánh cửa, thước đo, nẹp gỗ..."`)
  - **G34** (Sọc màn hình máy đọc: 4 sọc ngang): **RETAINED** (`"bốn sọc ngang mờ"`)
  - **An tuổi 19:** **RETAINED** (`"An mười chín tuổi"`)
- **Tại 8.192 tokens:** Bổ sung thêm trạng thái lãng tai của Duy (G14), trạng thái Mai Lâm (`Dead`), và toàn bộ chuỗi sự kiện Chương 1 đến Chương 4.
- **Cách ly tương lai:** 0 sự kiện thuộc Chương 5 trở đi bị rò rỉ vào context cutoff.

---

### 3.3. Xác minh Cơ chế Kế thừa `REG-03` (Supersession & Provenance)

Trên project probe riêng (`2e0e9175-4093-4462-b37f-59e8ef7a13f1`), tác giả tạo 1 chương có dữ kiện:
- Event 1 (`955aebb2...`): *"An ký hợp đồng kiểm định trạm bơm với ông Hòa trong thời hạn mười hai ngày."* (`narrative_order = 1024`).
- Event 2 (`d46e8f91...`): *"Ông Hòa trao cho An chiếc chìa khóa đồng của kho vật tư."* (`narrative_order = 2048`).
- Fact 1 (`edbe4bbf...`): `contract_duration = 12`.

Tác giả chỉnh sửa Event 1 qua UI tab "Sự kiện" thành *"mười lăm ngày"*, hệ thống tạo đề xuất cập nhật:
- Đề xuất hiển thị nhãn: `"Đề xuất thay thế phiên bản cũ; vẫn giữ lịch sử. Nguồn cũ: 955aebb2-ca06-5f04-a9c0-d1aaeca8b9a4"`.
- Đề xuất fact hiển thị nhãn: `"Đề xuất thay thế phiên bản cũ; vẫn giữ lịch sử. Nguồn cũ: edbe4bbf-48f5-42cf-a8b4-c8e0d0c46a4b"`.
- Sau khi duyệt qua UI (`brain_version` tăng từ 2 lên 3):
  1. Trong database: Event cũ `955aebb2` vẫn tồn tại ở vị trí `1024`. Event mới `7a65725f` có `supersedes_id = 955aebb2` và kế thừa vị trí trước Event 2 (`d46e8f91` ở 2048).
  2. Fact cũ `edbe4bbf` được liên kết bởi Fact mới `2cb8f93f` qua `supersedes_id`. 6 facts còn lại không bị thay đổi ID.
  3. Khi gọi `GET /context-preview`, thế hệ ngữ cảnh **chỉ chứa Event 15 ngày mới và Event 2; Event cũ 12 ngày hoàn toàn bị loại bỏ, không sinh bản ghi trùng**.

---

### 3.4. Xác minh Kiểm soát Chồng lấn `REG-04` (Overlapping Revisions & Stale Evidence)

Tác giả thực hiện lưu nhanh 2 revision trên Chương 7 của dự án chính:
- Revision 1 (`79bafe69-1545-405a-928c-a06dfe8621f6`) tạo lúc `15:40:15.276`.
- Revision 2 (`08f3d0ce-f94e-4cae-bb92-01c73e7fa312`) tạo lúc `15:40:16.809` (khi Revision 1 vừa vào hàng đợi trích xuất).
- Khi cả hai hoàn tất trích xuất, hàng đợi review hiển thị 2 nhóm riêng biệt. Revision 2 là `head`.
- Tác giả bấm *"Duyệt nhóm đã kiểm tra"* cho nhóm của Revision 1 trên giao diện.
- **Hệ thống phản hồi:** Backend chặn ngay lập tức qua `assertCurrentProposalEvidence` với lỗi:
  ```text
  409 STALE_PROPOSAL_EVIDENCE: Source chapter changed. Reject outdated proposals and review the latest extraction.
  ```
- Canon không bị thay đổi (`events = 21`, `facts = 95`, `brain_version = 8`). Giao diện hiển thị cảnh báo đỏ yêu cầu loại bỏ nhóm đề xuất cũ và duyệt bản mới nhất.

---

### 3.5. Sự việc lặp lại ở mốc thời gian khác `REG-06` (Part 1 vs Part 2)

1. **Part 1 (Thêm hành động tương tự ở bối cảnh khác - PASS):**
   - Tác giả viết Chương 6: *"Sáng hôm sau, An lại gặp Mai Linh tại trạm bơm số Hai. Cậu đưa cho cô một gói cơm nắm bọc lá chuối..."*
   - LLM nhận diện đúng đây là một lần gặp mới xảy ra sau đó, không bị gộp vào lần gặp ở bến đò trong Chương 1.
   - Đề xuất được gán `action: 'new'` và duyệt vào canon.
   - Timeline narrative order:
     - Lần gặp Chương 1 (bến đò): `narrative_order = 7168`.
     - Lần gặp Chương 6 (trạm bơm số Hai): `narrative_order = 21504`.
     - Tổng số sự kiện tăng chính xác từ 20 lên 21.

2. **Part 2 (Phân tích lại Chương 6 - PHÁT HIỆN 3 LỖI MỚI):**
   - **Lỗi 1 (`AI-GATEWAY-422`):** Khi bấm nút UI *"Phân tích lại chương đang mở"*, backend `reanalyseSavedChapterController` gọi `aiGatewayService.forwardRequest` tới `/v1/revisions/{id}/analyses`. Do thiếu header `Idempotency-Key` mà FastAPI bắt buộc, hệ thống trả về lỗi:
     ```json
     {"detail":[{"type":"missing","loc":["header","Idempotency-Key"],"msg":"Field required","input":null}]}
     ```
     Làm tác giả không thể kích hoạt phân tích lại từ nút bấm trên thanh công cụ.
   - **Lỗi 2 (`EXTRACT-RECONCILE-COLLISION-001`):** Khi tác giả chỉnh sửa nhẹ văn bản Chương 6 để autosave tạo Revision 2 (`29ac41b8`), outbox event `e4f3becd` được kích hoạt. Quá trình đối chiếu ném ngoại lệ:
     ```python
     # ai-service/services/canon_reconciliation.py:60
     if not old or old['kind'] != proposal.proposal_type or d.target_id in targets:
         raise ValueError('Invalid or multiply claimed canon reconciliation target')
     ```
     Nguyên nhân: Gemini trả về nhiều ứng viên fact trích xuất cùng tham chiếu đến một fact target ID đã có.
     Hậu quả: Worker retry liên tục 5 lần đều sập HTTP 500, sau đó chuyển trạng thái `FAILED`. Giao diện hiện thông báo: *"Chương 6: Trích xuất thất bại · đã thử lại 5 lần"*.
   - **Lỗi 3 (`EXTRACT-GROUNDING-AMBIGUOUS-001`):** Trong lần thử thứ 4, hàm `quote_span` ném ngoại lệ chưa được bắt:
     ```python
     # ai-service/services/source_grounding.py:24
     if text.find(quote, start + 1) >= 0:
         raise ValueError("Evidence quote is ambiguous; include more surrounding text")
     ```
     Khi trích dẫn bằng chứng của fact xuất hiện nhiều hơn 1 lần trong văn bản chương, hàm làm sập tiến trình phân tích thay vì gọi retry hoặc mở rộng ngữ cảnh.

---

## 4. Bảng Tổng hợp Sổ cái Lỗi (Defect Ledger)

| Mã lỗi | Mức độ | Phân loại | Trạng thái | Tác động thực tế | Hướng dẫn sửa đề xuất cho đội kỹ thuật |
|---|---|---|---|---|---|
| **MEM-DUPLICATE-001** | HIGH | canon_dedup | **RESOLVED** | Trước đây gây phình to và sai lệch dữ liệu canon khi trích xuất nhiều lần. | Đã xác nhận: các cơ chế reuse và supersession hoạt động chính xác. |
| **CTX-COVERAGE-001** | HIGH | context_packing | **RESOLVED** | Trước đây làm mất toàn bộ event/fact trong context 4k của model viết tiếp. | Đã xác nhận: packing theo độ ưu tiên relevance và probe gold được bảo tồn. |
| **MEM-CRITICAL-001** | HIGH | extraction_recall | **OPEN** | Extractor bỏ sót sự việc mới (vỏ ốc tím tro) trong REG-02. Tác giả phải tự tạo thủ công qua `AuthorMemoryRepair`. | Cải thiện prompt extraction của LLM để quét kỹ các đoạn văn mới bổ sung ở cuối chương. |
| **AI-GATEWAY-422** | HIGH | api_gateway | **OPEN** | Nút UI "Phân tích lại chương đang mở" hoàn toàn tê liệt, báo lỗi `AI_SERVICE_422`. | Trong `backend/src/modules/ai/ai-gateway.controller.ts:20`, bổ sung header `'Idempotency-Key': 'reanalyse-' + revision.revisionId` vào `forwardRequest`. |
| **EXTRACT-RECONCILE-COLLISION-001** | HIGH | canon_reconciliation | **OPEN** | Sập HTTP 500 khi LLM gán 1 canon target cho nhiều ứng viên trích xuất; outbox thất bại sau 5 lần retry. | Trong `canon_reconciliation.py`, khi phát hiện `d.target_id in targets`, tự động phân loại ứng viên thứ hai trở đi thành `action: 'new'` hoặc gom nhóm thay vì `raise ValueError`. |
| **EXTRACT-GROUNDING-AMBIGUOUS-001** | MEDIUM | source_grounding | **OPEN** | Sập HTTP 500 khi quote xuất hiện nhiều lần trong văn bản chương. | Trong `revision_analysis_service.py:308`, bọc `quote_span` bằng try-catch hoặc sử dụng hàm `resolve_grounded_quote` đã có sẵn cơ chế retry mở rộng ngữ cảnh. |

---

## 5. Kết luận & Khuyến nghị Cổng Nghiệm thu (Gate Conclusion)

1. **Về mục tiêu sửa chữa cốt lõi:**
   - Hai vấn đề kiến trúc nghiêm trọng nhất là **chống trùng lặp Canon (`MEM-DUPLICATE-001`)** và **độ phủ ngữ cảnh ngân sách nhỏ (`CTX-COVERAGE-001`)** đã được sửa chữa thành công và kiểm chứng đạt 100% qua dữ liệu thực nghiệm UI.
   - Cơ chế bảo vệ dữ liệu cũ (`REG-04` Stale handling) và cơ chế phiên bản hóa lịch sử (`REG-03` Supersession) vận hành rất vững chắc, ngăn chặn hoàn toàn việc ghi đè sai lệch dữ liệu vào Canon.
2. **Về tính sẵn sàng triển khai (Rollout Readiness):**
   - **CHƯA ĐỦ ĐIỀU KIỆN ĐỂ MỞ CỔNG CHẠY BÀI 100K HOẶC MỞ TOÀN DIỆN P2/P3.**
   - Nguyên nhân: Lỗi `AI-GATEWAY-422` và `EXTRACT-RECONCILE-COLLISION-001` làm đứt gãy luồng trích xuất tự động khi tác giả biên tập liên tục trên các chương sau. Nếu chạy 100k từ, hàng đợi outbox sẽ bị tắc nghẽn (`FAILED`) do va chạm target đối chiếu canon.
3. **Kế hoạch tiếp theo:**
   - Chuyển giao ngay ba lỗi mới (`AI-GATEWAY-422`, `EXTRACT-RECONCILE-COLLISION-001`, `EXTRACT-GROUNDING-AMBIGUOUS-001`) cho đội phát triển backend và AI service.
   - Sau khi đội kỹ thuật áp dụng bản vá cho 3 lỗi trên, tiến hành xác minh nhanh (smoke test) lại nút "Phân tích lại chương đang mở" và outbox retry của Chương 6 trước khi mở cổng nghiệm thu P2/P3.

# Narrative memory audit — <pipeline>-<checkpoint>

Status: NOT_RUN. Áp dụng NARRATIVE_MEMORY_AUDIT.md; đây là template chưa đo.

- Run/project/pipeline, timestamp, code SHA, nhãn M0/M-FIRST/M10/M20/M50/M-FINAL: `<...>`
- Số chương hoàn chỉnh / chapter cutoff / revision manifest: `<...>`
- Expected-items hash và thời điểm đóng băng trước khi xem actual: `<...>`
- Extraction model requested/effective, LLM/rule/fake/fallback theo loại, job/call/trace IDs: `<...>`
- Snapshot trước review/correction và sau materialization; brain version: `<...>`
- Evidence dùng chung từ pipeline nào, phần nào là lần chạy độc lập: `<...>`

| Stage | Verdict | n/N / evidence | Giới hạn |
|---|---|---|---|
| LLM execution thật gắn đúng input | NOT_ASSESSED | | |
| Raw extraction quality | NOT_ASSESSED | | |
| Memory materialization trước sửa tay | NOT_ASSESSED | | |
| Context/retrieval | NOT_ASSESSED | | |
| Post-correction quality | NOT_ASSESSED | | |
| Overall memory | NOT_RUN | | |

## Đối chiếu theo loại

| Loại | Expected | Đúng | Output reviewed/total | Output đúng | Provenance đúng/checked | Critical đúng/tổng | Missing/unsupported/duplicate |
|---|---|---|---|---|---|---|---|
| Entity/alias | | | | | | | |
| Event/timeline | | | | | | | |
| Fact/world rule | | | | | | | |
| Relationship | | | | | | | |
| State/ownership | | | | | | | |
| Certainty/attribution | | | | | | | |

Sample recall `<n/N>`, sample precision `<n/N>`, critical recall `<n/N>`, provenance accuracy `<n/N>`. Tách raw / persisted-before-correction / after-correction; không lấy số sau sửa làm điểm extractor. Mẫu nhỏ, loại unsupported và phần không đọc: `<...>`.

Future leaks `<...>`, stale state `<...>`, unsupported critical assertions `<...>`, extraction errors/fallback `<...>`, analysis latency `<...>`. Không biết thì ghi UNKNOWN.

## Probes và giữ thông tin dài hạn

Link memory_probes.csv; mô tả thông tin mới, seed/long-range, state đổi, uncertainty và future-negative probes. Lưu retrieved/packed IDs. Nếu chỉ có câu trả lời mà không có context evidence thì không kết luận retrieval PASS.

## Vấn đề và quyết định tiếp tục

Issue IDs, nguồn sai đầu tiên (extraction/review/materialization/retrieval/packing), repro, before/after correction, intervention của tác giả, retest. Mốc tiếp theo và hành động còn pending. Nếu không đạt mốc 50, ghi lý do NOT_APPLICABLE hoặc NOT_RUN đúng theo kế hoạch, không tự PASS.

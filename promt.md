# Active Agent Handoff — Ephurin Novel Platform

> File này chỉ chứa context đang hoạt động cho coding agent.
> Lịch sử Phase 6/6.5 đã archive tại:
> `docs/development/archive/promt-history-through-P6.5-R6-2026-09-21.md`
>
> Không đọc archive cho task thường ngày trừ khi cần audit quyết định cũ.

---

## 1. Vai trò và quy tắc

- **Astra = planner/reviewer.**
- **Gemini = worker.**
- Gemini chỉ làm đúng lô đang active, không tự mở scope/phase.
- Test pass không đồng nghĩa nghiệm thu; Astra/người dùng quyết định ACCEPT.
- Không reset/clean/force-push, không xóa thay đổi hiện có.
- Không gọi mock/unit test là integration/system evidence.
- Báo cáo chi tiết + evidence đặt dưới `docs/development/`.
- `promt.md` chỉ giữ active state + bàn giao ngắn.

Đọc tối thiểu trước khi sửa code:

1. `SKILL/AGENTS.md`
2. `SKILL/AI_CODING_STANDARDS.md`
3. `SKILL/ARCHITECTURE.md`
4. `ai-service/docs/IMPLEMENTATION_PLAN.md`
5. `ai-service/docs/ADRS.md`
6. `ai-service/docs/DATA_MODEL.md`
7. Tài liệu module liên quan trong `docs/`

---

## 2. Trạng thái phase

### Phase 6 / 6.5 — ACCEPTED

**Accepted:** 2026-09-21.

Project owner đã xác nhận root Compose/web flow chạy ổn định và cho phép kết thúc Phase 6.

Các invariant đã đóng:

- Browser/Frontend → Node AI Gateway → AI Service.
- Ownership + service credential boundary.
- Protected FastAPI routes fail closed.
- Canonical revision/chapter provenance; không fallback chapter 1.
- Temporal cutoff chặn future fact/event/state leakage.
- Structured context + context hash + generation trace.
- Accept-time freshness: **fail-closed availability + best-effort freshness**.
- Transactional outbox + retry + lease + fencing token.
- Mongo reconciliation không overwrite newer manual draft.
- PostgreSQL narrative repository + migration integration.
- Legacy `/suggest-next` không còn independent writer path.

Phase 6/6.5 không reopen trừ khi Phase 7 làm lộ correctness regression trực tiếp.

---

## 3. Phase 7 — Semantic Retrieval

### Kiến trúc đã chốt

Theo `IMPLEMENTATION_PLAN.md`, `ADRS.md`, `DATA_MODEL.md`:

- Semantic memory là **derived/rebuildable index**, không phải source of truth.
- Dùng PostgreSQL + **pgvector**, chưa dùng vector DB riêng.
- Không index pending/rejected proposals như canonical memory.
- Không retrieve raw novel text mặc định.
- Embedding/model version phải traceable và rebuildable.
- Hybrid ranking gồm:
  - semantic score;
  - entity overlap;
  - temporal relevance;
  - importance;
  - relationship relevance.
- Phase 7 exit criterion quan trọng: hybrid retrieval phải tốt hơn recent-only baseline trên labeled queries.

**Phase 7 gate:** chốt embedding model + vector dimension bằng benchmark trước khi freeze migration/vector column.

---

## 4. ACTIVE TASK — P7-01-EMBEDDING-BENCHMARK-ADR

**Loại:** architecture/evaluation gate.  
**Không triển khai full semantic retrieval trong lô này.**

### Mục tiêu

Chọn embedding model + dimension cho Phase 7 bằng benchmark có thể tái hiện, sau đó ghi ADR chính thức.

### Frozen evaluation corpus — READY

Astra consolidated the real-novel corpus on 2026-09-21:

- Dataset version: `aethelgard-retrieval-eval-v1.0.0`
- Manifest: `.data/Frozen_v1/story_manifest.json`
- Benchmark corpus: `.data/Frozen_v1/memory_chunks_canonical.json` (**216 canonical memories**)
- Primary queries: `.data/Frozen_v1/core_gold_queries.json` (**21 core-gold queries**)
- Secondary diagnostics: `.data/Frozen_v1/challenge_queries.json` (**19 challenge queries**)
- Report: `.data/Frozen_v1/dataset_report.md`

**Do not concatenate Batch_1..Batch_7**; they are cumulative working snapshots. Do not regenerate/relabel the frozen dataset unless a concrete defect is found. Primary embedding-ADR metrics use the core-gold split only.


### Phạm vi bắt buộc

1. **Inventory current retrieval baseline**
   - xác định current SQL/recent-only context path;
   - không thay behavior production;
   - ghi rõ baseline query/ranking hiện tại.

2. **Dùng frozen real-novel evaluation corpus**
   - dùng `.data/Frozen_v1/memory_chunks_canonical.json` làm corpus chính;
   - dùng `.data/Frozen_v1/core_gold_queries.json` làm primary benchmark;
   - dùng `.data/Frozen_v1/challenge_queries.json` chỉ cho secondary diagnostics;
   - enforce `chapter_number <= chapter_cutoff` trước ranking;
   - không concatenate các Batch cũ và không tự relabel dataset.

3. **Embedding candidate benchmark**
   - benchmark ít nhất 2 candidate phù hợp với deployment hiện tại.
   - ghi:
     - model;
     - dimension;
     - provider/runtime;
     - latency;
     - batch behavior;
     - multilingual/Vietnamese behavior;
     - retrieval quality.
   - nếu candidate cần paid/external API, benchmark phải tách rõ cost/network dependency.
   - không hard-code lựa chọn trước khi có kết quả.

4. **Metrics**
   Tối thiểu:
   - Recall@K;
   - MRR hoặc nDCG@K;
   - latency;
   - index/storage footprint estimate.

5. **Baseline comparison**
   - so embedding-only và recent-only baseline.
   - nếu practical, prototype offline hybrid scoring.
   - không claim Phase 7 exit criterion chỉ từ vài anecdotal examples.

6. **ADR**
   Tạo ADR mới, ví dụ:
   `ai-service/docs/ADR-012-EMBEDDING-MODEL.md`

   ADR phải ghi:
   - decision;
   - model/version;
   - dimension;
   - distance metric;
   - normalization policy;
   - versioning/reindex policy;
   - fallback/rollback;
   - benchmark evidence;
   - rejected alternatives.

7. **Schema recommendation**
   - đề xuất `memory_chunks` fields/index dựa trên model đã chọn;
   - chưa freeze/apply pgvector migration nếu benchmark chưa đủ kết luận.

### Guardrails

- Không multi-agent.
- Không specialized vector DB.
- Không auto-index rejected/pending proposals.
- Không đổi canonical Story Brain semantics.
- Không lưu raw chain-of-thought.
- Không rewrite Phase 6 context builder.
- Không thêm production migration trước khi ADR kết luận model/dimension.
- Không tối ưu premature ANN index nếu dataset chưa đủ lớn để justify.

---

## 5. Evidence P7-01

Tạo:

- `docs/development/P7-01-EMBEDDING-BENCHMARK-ADR-report.md`
- `docs/development/P7-01-EMBEDDING-BENCHMARK-ADR/`

Evidence tối thiểu:

- `dataset.md` hoặc machine-readable fixture + README;
- `baseline-results.md`;
- `candidate-results.md`;
- `benchmark-command.txt`;
- `decision-summary.md`.

Benchmark phải reproducible; nếu API/provider bên ngoài không khả dụng thì ghi BLOCKED/PARTIAL, không fabricate số liệu.

---

## 6. Acceptance criteria P7-01

P7-01 chỉ được bàn giao khi:

```text
labeled retrieval dataset exists
AND
recent-only baseline measured
AND
>=2 embedding candidates measured
AND
quality + latency + dimension are recorded
AND
ADR selects one model/dimension with evidence
AND
reindex/version policy is explicit
AND
no production pgvector schema is frozen before the decision
```

Nếu benchmark không có winner rõ:
- bàn giao INCONCLUSIVE;
- nêu thêm evidence cần thu;
- không tự chọn model theo cảm tính.

---

## 7. Format bàn giao Gemini

Append ngắn:

```markdown
---

### Gemini bàn giao — P7-01-EMBEDDING-BENCHMARK-ADR

Status: Completed, awaiting Astra review
# hoặc: Partial / Blocked / Inconclusive

- Dataset: <count queries / artifact classes>
- Baseline: <metric summary>
- Candidate A: <model, dim, quality, latency>
- Candidate B: <model, dim, quality, latency>
- Decision: <model + dimension | inconclusive>
- ADR: <path>
- Report: <path>
- Evidence: <directory>
- Production code changes: none | <very small benchmark-only hooks>
- Remaining blocker: none | <exact blocker>
```

Không paste raw benchmark logs dài vào `promt.md`.

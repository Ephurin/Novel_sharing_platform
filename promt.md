# Active Agent Handoff — Ephurin Novel Platform

> **File này cố ý ngắn.** Chỉ chứa context đang hoạt động cho coding agent.
> Lịch sử đầy đủ đã archive tại:
> `docs/development/archive/promt-history-through-P6.5-R6-2026-09-21.md`
>
> **Không đọc archive cho task thường ngày** trừ khi cần audit một quyết định cũ.

---

## 1. Vai trò và quy tắc làm việc

- **Astra = planner/reviewer.** Đọc code/report/evidence, chia lô, xác định invariant và nghiệm thu.
- **Gemini = worker.** Chỉ triển khai/verify đúng lô đang được giao; không tự mở phase hoặc scope mới.
- Test pass **không đồng nghĩa nghiệm thu**. Gemini bàn giao ở trạng thái chờ review; Astra/người dùng quyết định ACCEPT.
- Không reset/clean/force-push, không xóa thay đổi đang có, không sửa module ngoài scope.
- Không commit/push thay người dùng trừ khi được yêu cầu rõ.
- Không gọi mock/unit test là integration/system evidence.
- Báo cáo chi tiết + logs/evidence đặt dưới `docs/development/`; `promt.md` chỉ giữ trạng thái/tóm tắt hiện hành.
- Khi bàn giao, **append ngắn** vào cuối file này. Không chép lại toàn bộ lịch sử cũ.

### Tài liệu bắt buộc trước khi sửa code

Đọc tối thiểu:

1. `SKILL/AGENTS.md`
2. `SKILL/AI_CODING_STANDARDS.md`
3. `SKILL/ARCHITECTURE.md`
4. `ai-service/docs/IMPLEMENTATION_PLAN.md`
5. Tài liệu module liên quan trong `docs/`

Các quy tắc kiến trúc/security trong `SKILL/` là source of truth; file này chỉ điều phối task.

---

## 2. Trạng thái hiện tại

### Phase 6.5 — Integration Hardening

**Code-level status: ACCEPTED.**

Implementation chính gần nhất:
- `086d8b8596d3d348adebf3df07b03e7795c2fc65` — Phase 6.5.6 / R5 implementation.
- Review sau R5: code-level accepted; chỉ còn environment/package verification của root Compose.

Các invariant đã được review và coi là đóng ở code-level:

- Browser/Frontend đi qua Node AI Gateway.
- Gateway kiểm tra ownership và inject service credential.
- FastAPI protected routes fail closed khi auth thiếu/sai cấu hình.
- Canonical chapter cutoff + temporal provenance không fallback chapter 1.
- Future event/fact/state bị chặn khỏi old-chapter context theo provenance.
- Writing generation lưu brain/context trace và dùng canonical context hash.
- Accept-time Story Brain policy: **fail-closed availability + best-effort freshness**; không claim distributed atomic freshness.
- Transactional outbox có startup recovery, retry, lease + fencing token.
- Mongo reconciliation không overwrite newer manual draft; no-draft recovery có ownership metadata.
- Legacy `/suggest-next` không còn independent writer fallback.
- PostgreSQL migration/provenance path đã có real integration tests.
- R5 live-native probes đã xác nhận Gateway → AI, service auth, PostgreSQL repository và Mongo reconciliation.

Evidence gần nhất:
- `docs/development/P6.5-R5-FINAL-VERIFICATION-01-report.md`
- `docs/development/P6.5-R5-FINAL-VERIFICATION-01/`

### Gate duy nhất còn mở

**Root Docker Compose packaging/topology chưa được verify bằng actual Docker boot.**

R5 chạy live native processes vì Docker Desktop trên workstation không khả dụng. Điều này xác nhận functional runtime path nhưng chưa xác nhận:

- Dockerfile build tại HEAD;
- Alembic/backend migrations trong container;
- internal DNS `backend ↔ ai-service ↔ postgres ↔ mongodb`;
- Compose health/dependency ordering;
- container environment propagation.

**Không sửa lại các subsystem đã accepted nếu Compose không lộ defect cụ thể.**

---

## 3. ACTIVE TASK — P6.5-R6-ROOT-COMPOSE-ACCEPTANCE-VERIFICATION-01

**Loại:** verification-only.  
**Không phải feature batch.**

### Mục tiêu

Trên environment có Docker Engine hoạt động, chứng minh root Compose thực sự boot và các service giao tiếp đúng.

### Bắt buộc verify

```text
docker compose down -v
docker compose build
docker compose up -d
docker compose ps
```

Phải xác nhận:

1. PostgreSQL healthy.
2. MongoDB healthy.
3. AI service healthy.
4. Backend chạy ổn định.
5. Web chạy.
6. AI Alembic head applied.
7. Backend migrations gồm outbox claim-token migration applied.
8. AI runtime dùng `NARRATIVE_REPOSITORY=postgres`.
9. AI service auth qua live container network:
   - `/health` 200;
   - protected route thiếu token → 401;
   - wrong token → 403;
   - valid service token → expected response.
10. Node Gateway → AI:
    - authorized author;
    - Story Brain request pass;
    - context preview pass;
    - nếu practical, fake-provider writing generation pass.
11. Outbox processor gọi AI được qua container network.
12. Backend container read/write Mongo được.
13. Cleanup bằng `docker compose down -v`.

### Không được làm

- Không Phase 7.
- Không pgvector/embedding/semantic retrieval.
- Không multi-agent/planning/editing.
- Không refactor architecture.
- Không sửa code chỉ để “làm evidence đẹp hơn”.
- Nếu Compose lộ lỗi thật, chỉ sửa root cause tối thiểu rồi rerun verification.

### Nếu Docker không khả dụng

Bàn giao chính xác:

```text
Status: BLOCKED BY ENVIRONMENT
Reason: Docker Engine unavailable / insufficient permissions
Code-level Phase 6.5: accepted
Root-Compose packaging gate: unverified
```

Không fabricate PASS.

Project owner có thể **explicitly waive** gate này; nếu chưa có quyết định waive rõ ràng thì Phase 7 vẫn chưa được mở.

---

## 4. Evidence R6

Tạo:

- `docs/development/P6.5-R6-ROOT-COMPOSE-ACCEPTANCE-VERIFICATION-01-report.md`
- `docs/development/P6.5-R6-ROOT-COMPOSE-ACCEPTANCE-VERIFICATION-01/`

Evidence tối thiểu:

- `compose-build.txt`
- `compose-ps.txt`
- `container-migrations.txt`
- `compose-http-smoke.txt`
- `gateway-compose-smoke.txt`
- `outbox-container-smoke.txt`
- `evidence-summary.md`

Evidence phải là command/output thật; không thay `docker compose up` bằng `docker compose config`.

---

## 5. Format bàn giao Gemini

Khi R6 xong, chỉ append một mục ngắn:

```markdown
---

### Gemini bàn giao — P6.5-R6-ROOT-COMPOSE-ACCEPTANCE-VERIFICATION-01

Status: Verified, awaiting Astra acceptance
# hoặc: Blocked by environment

- Compose build/boot: PASS|BLOCKED|FAIL
- Container migrations: PASS|BLOCKED|FAIL
- AI auth smoke: PASS|BLOCKED|FAIL
- Gateway → AI smoke: PASS|BLOCKED|FAIL
- Outbox container smoke: PASS|BLOCKED|FAIL
- Mongo container smoke: PASS|BLOCKED|FAIL
- Code changes: none | <root-cause files only>
- Report: <path>
- Evidence: <directory>
- Remaining blocker: none | <exact blocker>
```

Không paste log dài vào `promt.md`.

---

## 6. Quyết định sau R6

Nếu actual root Compose boot + container-network smoke pass và không xuất hiện correctness regression:

```text
Phase 6.5 = ACCEPTED
Phase 7 may begin according to ai-service/docs/IMPLEMENTATION_PLAN.md
```

Nếu Compose lộ defect, sửa defect tối thiểu và bàn giao lại.

Nếu environment bị block, chờ project owner verify/waive; không tự chuyển Phase 7.

---

## 7. Lịch sử/audit

Chỉ khi cần truy nguyên quyết định cũ mới đọc:

- Full coordination history:
  `docs/development/archive/promt-history-through-P6.5-R6-2026-09-21.md`
- Reports/evidence từng batch:
  `docs/development/P6.5-*/`

**Không copy lịch sử archive trở lại file này.**

# Active Handoff — Ephurin Novel Platform

> Repo: `Ephurin/Novel_sharing_platform`  
> Branch of truth: `main`  
> File này chỉ giữ **active context**. Không nhét lịch sử phase dài vào đây.
>
> Lịch sử/acceptance/evidence đã có dưới `docs/development/` và các tài liệu kiến trúc trong `ai-service/docs/`.

---

## 1. Workflow hiện tại

- **User = Supervisor / final decision maker**
  - điều hướng scope;
  - quyết định ACCEPT cuối cùng;
  - mở phase/slice mới.

- **ChatGPT/Astra = developer / architect / reviewer**
  - thiết kế;
  - sửa code;
  - review;
  - chuẩn bị test/evidence contract;
  - không tự tuyên bố ACCEPT thay Supervisor.

- **Gemini = local execution / verification worker**
  - chạy test thật trên máy local có Docker;
  - chạy Compose/live integration;
  - ghi lại command + kết quả thật;
  - không tự mở scope;
  - không tự sửa kiến trúc nếu chưa có lỗi tái hiện rõ ràng.

Quy tắc chung:

- Test pass != acceptance.
- Không reset/clean/force-push.
- Không xóa dữ liệu người dùng.
- Không commit secret/key/local credential.
- Không gọi mock/unit test là live integration evidence.
- Không fabricate PASS.
- Nếu test fail: giữ nguyên log, xác định command fail + lỗi đầu tiên có ý nghĩa, rồi handoff cho ChatGPT/Astra xử lý.
- `promt.md` chỉ chứa active state + active task.

---

## 2. Frozen architecture invariants

### Phase 6 / 6.5 — ACCEPTED

Giữ nguyên:

- Browser/Mobile -> Node Platform API / AI Gateway -> FastAPI AI Service.
- Browser/mobile không gọi FastAPI trực tiếp.
- Node gateway giữ auth/role/ownership boundary.
- Protected FastAPI fail closed.
- Canonical revision/chapter provenance.
- Temporal cutoff chống future leakage.
- Context hash + generation trace.
- Accept-time freshness.
- Transactional outbox + lease/fencing.
- Mongo reconciliation.
- PostgreSQL là production narrative repository.

### Phase 7 — ACCEPTED / CLOSED

Giữ nguyên:

- canonical Story Brain là authoritative truth;
- semantic memory là derived/rebuildable;
- embedding:
  - model: `gemini-embedding-2`
  - dimension: `768`
  - explicit L2 normalization
  - cosine distance `<=>`
  - version: `gemini-embedding-2-768-v1`;
- temporal filter chạy trước semantic ranking;
- stale/wrong-version/future semantic rows không được vào candidate set;
- hybrid rank = deterministic rerank;
- context packing = deterministic whole-artifact selection/dedup;
- protected canonical artifacts không silent truncate;
- không ANN/specialized vector DB trong accepted MVP.

Chi tiết xem:

- `ai-service/docs/ADR-012-EMBEDDING-MODEL.md`
- `docs/development/P7-*/`

---

## 3. Phase 8 — CUTOVER AND CLEANUP

Safety invariant:

```text
cut over only after parity evidence
retain rollback path through stability window
delete legacy write paths only after explicit final cleanup gate
```

Không tự động xóa JSON source hoặc PostgreSQL data.

### P8-01 — ACCEPTED

JSON -> PostgreSQL dry-run migration + canonical snapshot parity.

- PR #5
- merge commit: `d639979f59b7867ee4863e886afb6065214b4f7d`
- evidence:
  - `docs/development/P8-01-JSON-POSTGRES-MIGRATION-PARITY-report.md`
  - `docs/development/P8-01-JSON-POSTGRES-MIGRATION-PARITY/`

### P8-02 — ACCEPTED

Frontend/API canonical cutover verification.

- PR #6
- merge commit: `12a0dc57186472c72c5318d8f3bde5185d33f307`
- accepted boundary:

```text
Browser / mobile
  -> Platform API (/api/v1)
  -> Node AI Gateway (/api/v1/ai/*)
  -> service-authenticated FastAPI
```

- evidence:
  - `docs/development/P8-02-FRONTEND-API-CANONICAL-CUTOVER-report.md`
  - `docs/development/P8-02-FRONTEND-API-CANONICAL-CUTOVER/`

### Remaining slices

```text
P8-03  legacy deprecation + JSON read-only production mode
P8-04  rollback rehearsal + cleanup readiness
P8-05  destructive legacy removal — deferred until post-release stability gate
```

**P8-03 is NOT ACTIVE yet.**

---

# 4. ACTIVE TASK — GEMINI LOCAL DOCKER FULL PHASE 8 VERIFICATION

## Purpose

GitHub Actions đã pass cho P8-01/P8-02, nhưng Supervisor yêu cầu một vòng xác nhận độc lập trên máy local có Docker trước khi mở P8-03.

Gemini phải chạy **toàn bộ verification hiện có của Phase 8 trên `main`**, sử dụng Docker/local runtime thật.

Không sửa code trước khi có failure tái hiện được.

## 4.1 Preflight

1. Checkout/pull `main`.
2. Ghi lại:
   - commit SHA;
   - Docker version;
   - Docker Compose version;
   - Python version;
   - Node/npm version.
3. Xác nhận không có secret/key bị staged hoặc chuẩn bị commit.
4. Đọc:
   - `.github/workflows/p8-cutover.yml`
   - `docs/development/P8-01-JSON-POSTGRES-MIGRATION-PARITY-report.md`
   - `docs/development/P8-02-FRONTEND-API-CANONICAL-CUTOVER-report.md`

Local verification phải bám sát workflow CI hiện tại, nhưng chạy bằng Docker/local machine thật.

## 4.2 Static/client cutover verification

Chạy:

```bash
python scripts/check_p8_frontend_api_cutover.py
```

Phải PASS và không phát hiện:

- browser/mobile direct FastAPI :8000;
- `VITE_AI_SERVICE_BASE_URL`;
- `VITE_AI_TENANT_ID`;
- public service token;
- direct `/v1/story-brains`;
- direct `/v1/writing/generations`;
- direct `/internal/v1/*`.

## 4.3 Web / backend / mobile deterministic verification

### Web

```bash
cd web
npm ci
npm run build
cd ..
```

Sau build, scan `web/dist` để bảo đảm không có direct FastAPI/public-AI references như P8 workflow.

### Backend

Chạy typecheck + deterministic tests theo contract trong `.github/workflows/p8-cutover.yml`.

Không gọi các file `*.live.test.ts` / `*.postgres.test.ts` là deterministic evidence.

Phải bao gồm Node AI Gateway tests.

### Mobile

```bash
cd mobile
npm ci
npm run typecheck
cd ..
```

## 4.4 AI-service regression

Trong `ai-service/`:

```bash
pip install -r requirements.txt pytest httpx
pytest -q
```

Ghi số passed/skipped/deselected thực tế.

Không dùng kết quả CI cũ thay cho local result.

## 4.5 Live PostgreSQL + pgvector integration

Khởi động PostgreSQL 16 + pgvector thật hoặc dùng Compose/service tương đương local.

Chạy PostgreSQL integration suite:

```bash
cd ai-service
pytest -o addopts= -q -m postgres_integration
cd ..
```

Phải xác nhận tối thiểu:

- pgvector extension tồn tại;
- `VECTOR(768)` behavior còn đúng;
- wrong dimension bị reject;
- semantic temporal/version/stale isolation regressions vẫn pass;
- P8 migration/parity tests vẫn pass.

## 4.6 Root Docker Compose full smoke

Dùng root `docker-compose.yml`.

Trước khi chạy, **không xóa volume/dữ liệu user hiện có**. Nếu cần môi trường sạch để test, dùng project name/volume test riêng.

Khởi động production-path stack:

```text
postgres
mongodb
ai-service
backend
web
```

Dùng test-safe environment, ví dụ fake LLM/embedding theo workflow; không cần real external model key cho smoke.

Phải verify:

1. PostgreSQL healthy.
2. MongoDB healthy.
3. AI service healthy.
4. Backend health OK.
5. Web/nginx serve được.
6. pgvector extension tồn tại.
7. Browser path qua nginx:
   `/api/v1/ai/*`
   chạm Node auth boundary và unauthenticated request trả 401.
8. Built/deployed web assets không chứa direct FastAPI/public-AI reference.
9. Direct FastAPI protected route:
   - missing service credential -> 401;
   - invalid credential -> 403;
   - valid test credential -> 200.

## 4.7 P8-01 migration/parity local replay

Dùng fixture/test data, **không apply committed/user JSON thật vào production DB**.

Phải replay:

1. committed legacy StoryKB inventory dry-run;
2. tất cả committed inventory được phân loại đúng;
3. synthetic/scoped JSON dry-run -> safe/ready;
4. explicit apply vào target test sạch;
5. canonical parity = true;
6. source JSON SHA-256 trước/sau không đổi;
7. apply lần hai idempotent;
8. unrelated tenant/novel rows không bị thay đổi;
9. conflicting non-empty target bị từ chối;
10. không truncate/drop schema/table/volume.

## 4.8 P8-02 local cutover replay

Phải xác nhận lại end-to-end:

```text
web/nginx
 -> /api/v1
 -> Node backend
 -> /api/v1/ai/*
 -> service-authenticated FastAPI
```

Và xác nhận browser/mobile không cần biết:

- FastAPI port 8000;
- service token;
- tenant service header;
- direct Story Brain FastAPI route.

## 4.9 Evidence Gemini phải ghi

Tạo/update:

```text
docs/development/P8-LOCAL-FULL-VERIFICATION-report.md
docs/development/P8-LOCAL-FULL-VERIFICATION/
  environment.txt
  static-cutover.txt
  web-build.txt
  backend-tests.txt
  mobile-typecheck.txt
  ai-service-regression.txt
  postgres-integration.txt
  p8-01-migration-parity.txt
  p8-02-gateway-cutover.txt
  compose-smoke.txt
```

Mỗi evidence file phải ghi:

- command thực sự đã chạy;
- exit code;
- kết quả/tổng test;
- lỗi/warning quan trọng;
- timestamp;
- commit SHA được test.

Không paste secret.

## 4.10 Failure protocol

Nếu bất kỳ bước nào fail:

1. **dừng tuyên bố PASS**;
2. lưu exact command + relevant log;
3. xác định failure là:
   - environment/setup;
   - deterministic regression;
   - PostgreSQL/pgvector integration;
   - Compose/runtime;
   - P8-01 parity;
   - P8-02 gateway boundary;
4. không tự sửa rộng;
5. báo lại ChatGPT/Astra với file/log cụ thể để sửa;
6. sau fix phải rerun gate bị fail và các regression liên quan.

## 4.11 Handoff Gemini phải append vào cuối file này

Sau khi chạy xong, chỉ append block ngắn:

```markdown
---

### Gemini Local Verification — Phase 8

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Environment: <short summary>

- Static cutover guard: <result>
- Web build/assets: <result>
- Backend deterministic/gateway tests: <result>
- Mobile typecheck: <result>
- AI-service regression: <result>
- PostgreSQL + pgvector integration: <result>
- P8-01 migration/parity replay: <result>
- P8-02 gateway cutover replay: <result>
- Root Compose smoke: <result>
- Source JSON unchanged: <result>
- User/prod data modified: NO
- Report: docs/development/P8-LOCAL-FULL-VERIFICATION-report.md
- Evidence: docs/development/P8-LOCAL-FULL-VERIFICATION/
- Remaining blocker: none | <exact blocker>
```

Do not open P8-03. Supervisor will decide the next step after reviewing this local evidence.

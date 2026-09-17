# Báo Cáo Kết Quả Kiểm Thử HTTP / Postman — Phase 4

- **Thời gian chạy:** `2026-09-15T08:45:26.960392+00:00`
- **Môi trường:** Docker Compose (`p4-ai-service`, `p4-postgres`, `p4-mock-platform`)
- **Tổng số ca:** `14` | **Passed:** `14` | **Failed:** `0`

| Ca | Tên kịch bản | Kết quả | Thời gian (ms) | Chi tiết |
| :--- | :--- | :---: | :---: | :--- |
| `01` | Phân tích revision | ✅ PASS | 66.26 | 202 Accepted, run_id=99ac68cb-0592-4438-b9fe-7bd087960138, proposals=6, canonical state is empty |
| `02` | Phân tích lại cùng key/input | ✅ PASS | 7.95 | 202 Accepted, deduplicated=True, same run_id returned |
| `03` | Idempotency conflict | ✅ PASS | 7.26 | 409 Conflict, IDEMPOTENCY_CONFLICT returned cleanly |
| `04` | Content hash sai | ✅ PASS | 4.64 | 422 Unprocessable Entity, CONTENT_HASH_MISMATCH returned |
| `05` | Accept dependency group | ✅ PASS | 40.1 | 200 OK, brain_version incremented to 2, artifacts materialized |
| `06` | Đọc state | ✅ PASS | 36.71 | 200 OK, state entities=1, provenance keys=1 |
| `07` | Version cũ | ✅ PASS | 36.92 | 409 Conflict correctly returned on stale expected_brain_version |
| `08` | Transition không hợp lệ trong nhóm | ✅ PASS | 67.53 | 422 Unprocessable Entity on accept, INVALID_PROJECTION returned, atomic rollback verified |
| `09` | Reject proposal | ✅ PASS | 6.0 | HTTP 404: Reject operation handled cleanly without state corruption |
| `10` | Correction đang pending | ✅ PASS | 55.22 | 201 Created pending correction group; canonical state remains unmutated |
| `11` | Accept correction | ✅ PASS | 33.25 | 200 OK, brain_version=3, timeline replayed and health=70 reflected |
| `12` | Event về sau vẫn có hiệu lực khi sửa event cũ | ✅ PASS | 5.8 | Replay preserves timeline order at original narrative positions |
| `13` | Rebuild hai lần | ✅ PASS | 28.3 | 200 OK, both rebuilds match online projection identically; idempotent; version unchanged |
| `14` | Restart container persistence | ✅ PASS | 3097.03 | Container restarted cleanly; 1 entities & state persisted in PostgreSQL volume |

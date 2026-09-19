# Báo Cáo Kết Quả Kiểm Thử HTTP / Postman — Phase 4

- **Thời gian chạy:** `2026-09-17T02:30:12.431698+00:00`
- **Môi trường:** Docker Compose (`p4-ai-service`, `p4-postgres`, `p4-mock-platform`)
- **Tổng số ca:** `14` | **Passed:** `14` | **Failed:** `0`

| Ca | Tên kịch bản | Kết quả | Thời gian (ms) | Chi tiết |
| :--- | :--- | :---: | :---: | :--- |
| `01` | Phân tích revision | ✅ PASS | 102.25 | 202 Accepted, run_id=49e43dae-0df2-455a-8608-3d99ad72b87a, proposals=6, canonical state is empty |
| `02` | Phân tích lại cùng key/input | ✅ PASS | 12.7 | 202 Accepted, deduplicated=True, same run_id returned |
| `03` | Idempotency conflict | ✅ PASS | 19.52 | 409 Conflict, IDEMPOTENCY_CONFLICT returned cleanly |
| `04` | Content hash sai | ✅ PASS | 13.73 | 422 Unprocessable Entity, CONTENT_HASH_MISMATCH returned |
| `05` | Accept dependency group | ✅ PASS | 84.49 | 200 OK, brain_version incremented to 2, artifacts materialized |
| `06` | Đọc state | ✅ PASS | 7.41 | 200 OK, state entities=1, provenance keys=1 |
| `07` | Version cũ | ✅ PASS | 16.94 | 409 Conflict correctly returned on stale expected_brain_version |
| `08` | Transition không hợp lệ trong nhóm | ✅ PASS | 99.67 | 422 Unprocessable Entity on accept, INVALID_PROJECTION returned, atomic rollback verified |
| `09` | Reject proposal | ✅ PASS | 63.81 | Rejected a real pending proposal; state and provenance are unchanged |
| `10` | Correction đang pending | ✅ PASS | 55.69 | 201 Created; complete state and provenance snapshot is unchanged |
| `11` | Accept correction | ✅ PASS | 53.08 | 200 OK, brain_version=4; correction accepted and later health=40 remains effective |
| `12` | Event về sau vẫn có hiệu lực khi sửa event cũ | ✅ PASS | 32.46 | Final health=40 and provenance point to the accepted later event |
| `13` | Rebuild hai lần | ✅ PASS | 55.44 | 200 OK, both rebuilds match online projection identically; idempotent; version unchanged |
| `14` | Restart container persistence | ✅ PASS | 2800.97 | PostgreSQL and API restarted; state, provenance, and rejected proposals match their snapshots |

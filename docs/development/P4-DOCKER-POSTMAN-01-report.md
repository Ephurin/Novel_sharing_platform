# Báo cáo nghiệm thu P4-DOCKER-POSTMAN-01

**Ngày chạy:** 2026-09-17

**Trạng thái:** Hoàn thành và đã nghiệm thu cục bộ trên Docker Desktop Linux

**Phạm vi:** Narrative Memory Phase 4 — revision, proposal review, event sourcing, projection, correction, rebuild và persistence

## Kết quả

| Bộ kiểm thử | Kết quả |
| --- | --- |
| Unit/contract mặc định | **98 passed, 2 skipped, 7 deselected** |
| PostgreSQL integration | **7 passed** trên database Compose cô lập |
| Newman HTTP collection | **27 requests, 36 assertions, 0 failed** |
| Python orchestration runner | **14/14 passed**, gồm restart PostgreSQL và API |

Hai test bị skip trong suite mặc định là các ca SQL không áp dụng cho SQLite. Bảy test PostgreSQL được đánh marker và cố ý deselect khỏi suite mặc định; lệnh integration riêng bắt buộc URL PostgreSQL, timeout kết nối ngắn và fail rõ khi database không sẵn sàng.

## Môi trường đã kiểm chứng

- Docker Desktop 4.49.0, engine 28.5.1, Linux containers.
- API và mock harness dùng python:3.12.10-slim-bookworm.
- API database và integration database dùng postgres:16.4-alpine3.20.
- p4-postgres, p4-ai-service và p4-mock-platform đều healthy sau build và sau restart.
- PostgreSQL của API chỉ nằm trong Compose network. Mock Platform publish ở loopback 127.0.0.1:8081 để Newman và orchestration runner trên host đăng ký revision động; API publish ở 127.0.0.1:8000.
- Python packages vẫn dùng constraints trong requirements.txt; đây không phải lockfile dependency đầy đủ.

## Các điểm review đã khắc phục

1. **Database integration tách biệt:** postgres-integration dùng database disposable riêng, không chạy downgrade/upgrade trên database của API/Postman.
2. **Không skip giả:** integration invocation thiếu URL hoặc không kết nối được sẽ báo pytest.UsageError; Compose dùng REQUIRE_POSTGRES_INTEGRATION=true.
3. **Replay có event về sau:** collection và runner tạo, phân tích và accept revision thứ hai có transition health=40; sau khi correction event cũ thành health=70, state cuối vẫn là 40 và provenance trỏ đúng event thứ hai.
4. **Reject proposal thật:** reject một proposal pending thật, yêu cầu HTTP 200/status rejected, so sánh toàn bộ state và provenance trước/sau.
5. **Persistence thật:** runner snapshot state, provenance và rejected proposals; restart p4-postgres rồi p4-ai-service; các snapshot sau restart khớp hoàn toàn.
6. **Concurrency mạnh hơn:** thread phải kết thúc, lỗi được thu thập, version cuối và state/provenance được kiểm tra sau concurrent accept/rebuild.
7. **Image pin cụ thể:** Python và PostgreSQL dùng patch/minor tags cụ thể; báo cáo không tuyên bố package Python đã được lock hoàn toàn.

## 14 ca HTTP bắt buộc

| Ca | Điều được chứng minh | Kết quả |
| --- | --- | :---: |
| 01 | Analysis tạo proposal, canonical state còn rỗng | PASS |
| 02 | Cùng key/input trả kết quả deduplicated | PASS |
| 03 | Cùng key nhưng input khác trả IDEMPOTENCY_CONFLICT | PASS |
| 04 | Sai content hash trả CONTENT_HASH_MISMATCH | PASS |
| 05 | Accept dependency group materialize atomically, version lên 2 | PASS |
| 06 | State có attributes và provenance | PASS |
| 07 | Version cũ trả conflict | PASS |
| 08 | Transition sai trả INVALID_PROJECTION, rollback toàn nhóm | PASS |
| 09 | Reject proposal thật không đổi canonical snapshot | PASS |
| 10 | Pending correction không đổi state/provenance | PASS |
| 11 | Accept correction tăng version lên 4 | PASS |
| 12 | Event về sau vẫn thắng khi replay; health 40 và provenance đúng | PASS |
| 13 | Rebuild hai lần cho kết quả giống nhau, version không tăng | PASS |
| 14 | Restart PostgreSQL và API vẫn giữ state/provenance/proposal decision | PASS |

## Lệnh tái lập

    cd ai-service
    docker-compose up -d --build
    docker-compose --profile test run --build --rm integration-test
    npx -y newman run tests/postman/Narrative_Memory_Phase_4.postman_collection.json -e tests/postman/Narrative_Memory_Phase_4.postman_environment.json
    python tests/postman/run_postman_tests.py
    python -m pytest -q

Không dùng docker-compose down -v trong quy trình nghiệm thu vì thao tác đó xóa volume API.

## Bằng chứng

- [Newman terminal output](P4-DOCKER-POSTMAN-01/newman-results.txt)
- [Newman JSON](P4-DOCKER-POSTMAN-01/newman-results.json)
- [PostgreSQL integration output](P4-DOCKER-POSTMAN-01/postgres-integration-results.txt)
- [Python runner report](P4-DOCKER-POSTMAN-01/postman-report.md)
- [Python runner JSON](P4-DOCKER-POSTMAN-01/postman-results.json)
- [Unit/contract output](P4-DOCKER-POSTMAN-01/pytest-all-results.txt)

Fake LLM và Mock Platform chỉ phục vụ kiểm thử xác định. Kết quả này nghiệm thu logic Phase 4 và hạ tầng test; nó không kiểm chứng chất lượng output của provider LLM thật hoặc tuyên bố production-ready cho authentication/public multi-tenancy.

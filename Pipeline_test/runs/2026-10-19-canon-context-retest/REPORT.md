# Báo cáo Pipeline test — <run-id>

> MẪU CHƯA THỰC THI. Thay các placeholder bằng số liệu/evidence thật. Dùng UNKNOWN, NOT_RUN hoặc NOT_ASSESSED khi thiếu dữ liệu; không mặc định PASS.

## 1. Kết quả chính

- Overall verdict: `<NOT_RUN / COMPLETED_WITH_ACCEPTANCE / COMPLETED_PENDING_REVIEW / COMPLETED_WITH_ISSUES / PARTIAL / BLOCKED>`
- Chế độ: `<AUTHOR_ASSISTED_HYBRID / UI_ONLY / AUTONOMOUS_100K>`
- Truyện cuối: `<đường dẫn>`, số từ `<...>` / mục tiêu 100.000 (95–105k), chương hoàn chỉnh `<...>`.
- Vấn đề nghiêm trọng nhất và tác động: `<...>`.
- Có hoàn tất như tác giả thật không, cần can thiệp gì: `<...>`.
- Phạm vi chưa chứng minh: `<...>`.

| Trục | Verdict | Evidence | Giới hạn |
|---|---|---|---|
| Artifact completion | NOT_RUN | | |
| Pipeline functionality | NOT_RUN | | |
| UI coverage | NOT_RUN | | |
| Autonomy | NOT_ASSESSED | | |
| Literary quality | NOT_ASSESSED | | |
| Review independence | NOT_ASSESSED | | |

## 2. Môi trường và đầu vào

Run ID, bắt đầu/kết thúc có timezone, code SHA/dirty state, fixture version/manifest hash, các project IDs, URL, cấu hình runtime, model requested/effective, embedding/routing, output limit, fallback, ngân sách đã duyệt. Link run_config và preflight evidence. Không ghi secrets.

Seed words `<...>`; generated/edited words `<...>`; canonical final words `<...>`. Nêu cách attribution nếu có sửa đè. Bốn chương seed có giữ nguyên không? Chương 5 được nối từ đâu? Những deviation của blueprint và quyết định tác giả tương ứng?

## 3. Coverage ba pipeline

| Gate | Project | Provider thật/fake/disabled | Kết quả | Evidence |
|---|---|---|---|---|
| P1 import → review → baseline | | | NOT_RUN | |
| P1 generate → reject/accept → revision → outbox → memory | | | NOT_RUN | |
| P2 idea → world bible → brain → first chapter | | | NOT_RUN | |
| P2 plan/version/current objective/future-canon isolation | | | NOT_RUN | |
| P3 probe nhiều objective, stop, resume, terminal | | | NOT_RUN | |
| P3 autonomous tạo đủ truyện 100k | | | NOT_ASSESSED | |
| P1 narrative memory: M0/M-FIRST/10/20/50/final | | | NOT_RUN | |
| P2 narrative memory: M0/M-FIRST/10/20/50/final | | | NOT_RUN | |
| P3 narrative memory: M0/M-FIRST/10/20/50/final | | | NOT_RUN | |
| Semantic memory real-provider path | | | NOT_ASSESSED | |
| Toàn hành trình UI | | | NOT_RUN | |

Đối chiếu riêng T01–T15 trong AGENT_GUIDE: kết quả, bằng chứng, lý do bỏ qua. Phân biệt fault injection và lỗi tự nhiên.

### Narrative memory — LLM extraction có thực sự hoạt động?

Link `memory_checkpoints.csv`, `memory_items.csv`, `memory_probes.csv` và từng `evidence/memory/<pipeline>-<checkpoint>/MEMORY_AUDIT.md`. Ghi pipeline/project, source revision/hash, observed extraction model và call trace; nếu chỉ biết generation model hoặc counts thì ghi chưa chứng minh extraction.

| Pipeline / mốc | Cutoff / completed chapters | LLM execution | Raw extraction recall/precision n/N | Critical/provenance n/N | Materialization | Context retrieval | After correction | Evidence / issues |
|---|---|---|---|---|---|---|---|---|
| P1 / M0 | | NOT_RUN | | | | | | |
| P2 / M0 + M-FIRST | | NOT_RUN | | | | | | |
| P3 / M0 + M-FIRST | | NOT_RUN | | | | | | |
| `<pipeline> / 10` | | NOT_RUN | | | | | | |
| `<pipeline> / 20` | | NOT_RUN | | | | | | |
| `<pipeline> / 50` | | NOT_RUN | | | | | | |
| `<pipeline> / FINAL` | | NOT_RUN | | | | | | |

Thêm dòng mọi mốc 10 chương thực đến hạn (bao gồm 30/40), M-FIRST P1 và final từng pipeline. Mốc 50 của plan 40 chương = NOT_APPLICABLE; plan >=50 bị dừng sớm = NOT_RUN. Probe ngắn không có coverage dài hạn; không lấy main audit để tuyên bố đã chạy P2/P3 dài.

Nêu missing facts/events, sai alias/entity, state/relationship cũ, certainty bị nâng thành fact, future leak, provenance sai, regex/fallback và lỗi extraction thật. Tách kết quả trước/sau tác giả sửa. Dẫn chứng LLM call + nguồn đúng + output + memory/context; không suy từ COMPLETED hoặc brain_version tăng. Phần không quan sát được và ảnh hưởng tới verdict: `<...>`.

## 4. Hành trình tác giả

Mô tả diễn biến thực: import, sửa proposal, lên kế hoạch, viết cảnh/chương, đọc và reject, sửa tay, đổi plan, xử lý lỗi, resume, export. Link actions.csv/interventions.csv. Liệt kê mọi lần phải dùng API thay UI và lý do; đừng kể một hành trình lý tưởng thay thực tế.

| Chỉ số | Giá trị | Nguồn/cách đo |
|---|---|---|
| Generation attempts / accepted / rejected | UNKNOWN | |
| Retry / provider errors / timeouts | UNKNOWN | |
| Lượt nhắc lại canon vì quên | UNKNOWN | |
| Lượt sửa tay / ước lượng từ sửa | UNKNOWN | |
| Thời gian tác giả đọc, sửa, xử lý lỗi | UNKNOWN | |
| Tổng elapsed / latency p50,p95 và sample n | UNKNOWN | |
| Tokens / chi phí / ngân sách còn lại | UNKNOWN | |
| Lần controller completed nhưng chương chưa đủ | UNKNOWN | |

## 5. Đánh giá toàn truyện

Reviewer `<...>`, độc lập `<yes/no>`, toàn văn đã đọc `<yes/no>`, phạm vi/chương chưa đọc `<...>`. Self-review không được đổi thành independent review.

| Tiêu chí | Điểm 0–4 | Dẫn chứng chapter/revision | Nhận xét |
|---|---|---|---|
| Đáp ứng blueprint | | | |
| Nhân quả/continuity | | | |
| Nhân vật | | | |
| Cấu trúc/nhịp | | | |
| Setup–payoff | | | |
| Văn phong/đối thoại | | | |
| Hoàn chỉnh/kết thúc | | | |

Hard gates 1–6 của EVALUATION: `<từng gate và evidence>`. PF01–PF12: `<chapter payoff, excerpt, verdict từng mục>`. Nêu lỗi lặp văn, tóm tắt thay cảnh, mất canon hoặc kết thúc vội. Có hai ví dụ tốt và hai điểm yếu cụ thể nếu thực sự quan sát được; không bịa đủ số.

## 6. Những vấn đề gặp phải

| Issue | Mức độ | Subsystem | Expected → Actual | Evidence/repro | Workaround | Trạng thái |
|---|---|---|---|---|---|---|
| `<ISS-...>` | | | | | | |

Bao gồm lỗi đã workaround. Phân biệt lỗi seed, lỗi prompt/tác giả, lỗi model, context/retrieval, persistence, UI, controller và provider. Nếu chưa biết nguyên nhân, ghi nghi vấn; không kết luận từ suy đoán.

## 7. Artifact và kiểm chứng

- final/novel.md và final/chapters/: `<...>`
- revision_manifest.csv và hash/readback: `<...>`
- final-word-count.json: `<...>`
- actions, issues, interventions, chapter_reviews, continuity: `<...>`
- memory_checkpoints, memory_items, memory_probes và audit theo checkpoint: `<...>`
- screenshots / sanitized requests-responses / trace: `<...>`
- Fixture integrity trước/sau: `<...>`

## 8. Nếu chưa hoàn thành

Blocker/budget/time limit `<...>`. Đã đạt `<...>` từ, `<...>` chương; còn `<...>`. Link checkpoint, pending jobs, thao tác kế tiếp an toàn. Điều kiện để tiếp tục hoặc retest. Không che kết quả thiếu bằng một kết luận “pipeline PASS”.

## 9. Kết luận trong đúng phạm vi

Hệ thống đã chứng minh được gì, chưa chứng minh được gì, có thể dùng cho tác giả ở mức nào, cần sửa gì trước lượt tiếp theo. Không thay đổi production code trong run; đề xuất fix/retest riêng với issue IDs.

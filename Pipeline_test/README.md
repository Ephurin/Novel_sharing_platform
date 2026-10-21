# Pipeline test — từ bản thảo dở đến tiểu thuyết 100.000 từ

Fixture ID: `PT-CV-001` · Fixture version: `1.0.0` · Task revision: `1.3` · Ngôn ngữ: tiếng Việt.

**Chạy trên máy khác:** checkout nhánh `codex/ai-copilot-pipeline-test`, dùng
[PROMPT_RUN_TEST.md](PROMPT_RUN_TEST.md) giao agent dựng môi trường và test;
sau đó dùng [PROMPT_REVIEW_PIPELINE.md](PROMPT_REVIEW_PIPELINE.md) để đánh giá
code/evidence theo contract và map. Prompt không phụ thuộc đường dẫn máy cũ;
keys, `.env`, DB/volumes và browser session phải chuẩn bị cục bộ.

**Nguồn chuẩn cho ba use case:** [WORKFLOW_CONTRACT.md revision1.4,2026-10-21](WORKFLOW_CONTRACT.md).
P1 = bản thảo có sẵn; P2 = ý tưởng/thiết lập; P3 = controller tự động. Đã bổ sung
optional hints → tác giả duyệt entity → event/fact; P3 phải chờ entity review khi
bật mode mới và không được báo fully autonomous. Code mới opt-in, migration0012,
chưa live retest: [hướng dẫn hiện hành](GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md).
Các bản sửa/môi trường bên dưới là lịch sử, không phải preflight của code hiện tại.

**Bản sửa 2026-10-19:** xem [báo cáo canon/context](runs/2026-10-19-canon-context-repair/REPORT.md)
và [hướng dẫn giao Gemini retest](GEMINI_RETEST_CANON_CONTEXT.md). Stack retest ở
`http://localhost:18080`, migration `0010_fact_supersession`. Dùng project/run mới;
giữ nguyên canon trùng và các queue của run cũ làm bằng chứng.

**Cập nhật 2026-10-18:** đọc [WORKFLOW_CONTRACT.md](WORKFLOW_CONTRACT.md) trước;
đây là luồng đã được người dùng xác nhận và ưu tiên khi khác hướng dẫn cũ.
Lượt tiếp theo chạy [SHORT_LOOP_TEST.md](SHORT_LOOP_TEST.md) trước bài 100k.
Xem [WORKFLOW_GAP_AUDIT.md](WORKFLOW_GAP_AUDIT.md) để biết khoảng trống đã tìm
thấy qua code; chưa phải bằng chứng UI E2E. API hybrid không thay được UI gate.

Bản sửa theo luồng đã thống nhất và bằng chứng regression nằm tại
[workflow-repair/REPORT.md](runs/2026-10-18-workflow-repair/REPORT.md).

Đây là một task kiểm thử có thể chạy lại, không phải báo cáo hệ thống đã pass. **Khi bộ fixture/template gốc được tạo thì chưa có test nào chạy; đến 2026-10-21 đã có nhiều lượt test lịch sử**, nhưng P1 S01–S11 chưa được nghiệm thu live UI và P2/P3/100k chưa PASS. Chỉ kết luận theo report/evidence của đúng SHA và run tương ứng. Không cần tạo chat mới để sử dụng.

**Đầu ra nghiệm thu cuối bắt buộc của P3:** một tiểu thuyết hoàn chỉnh **100.000–105.000 từ**, đọc lại từ revision canonical đã lưu trong sản phẩm; gồm ending, provenance, narrative-memory audit, đánh giá độc lập và báo cáo mức can thiệp. Band 95.000–105.000 thuộc task assisted lịch sử, **không áp dụng làm P3 PASS v1.4**. Bản thảo đầu vào là phần mở đầu viết dở, **không phải nửa truyện 50.000 từ**. Không dùng dàn ý, tóm tắt hay lặp văn để bù độ dài.

## Bắt đầu

1. Đọc `TASK.md`, `AGENT_GUIDE.md`, `NARRATIVE_MEMORY_AUDIT.md` và `EVALUATION.md`.
2. Kiểm tra fixture: `python Pipeline_test/tools/task_tool.py verify`.
3. Tạo lượt chạy riêng: `python Pipeline_test/tools/task_tool.py init --run-id 2026-10-17-author-01`.
4. Giao nội dung `TASK.md` cho testing agent, chỉ định thư mục run vừa tạo. Điền cấu hình và ngân sách trước khi gọi model thật.
5. Chạy P1 S01–S11 qua UI trước, rồi P2 idea→first chapter, P3 controller probe (có/không plan), **sau cùng P3_HITL_CONTROLLER_100K** trên project/run riêng. `AUTHOR_ASSISTED_HYBRID` chỉ là đối chứng/chế độ có hỗ trợ, không thay P3 acceptance; mọi lần gọi provider thật cần cửa sổ ngân sách riêng đang hiệu lực.
6. Đếm bản xuất cuối: `python Pipeline_test/tools/task_tool.py count --directory Pipeline_test/runs/<run-id>/final/chapters`.

## Các tài liệu

| Tệp/thư mục | Vai trò |
|---|---|
| `TASK.md` | Prompt nhiệm vụ có thể giao nguyên văn cho agent |
| `AGENT_GUIDE.md` | Trình tự thao tác, bằng chứng, resume, giới hạn quyền |
| `API_ADAPTER.md` | Ánh xạ dữ liệu vào API hiện có; phải kiểm tra lại theo SHA khi chạy |
| `input/manuscript/` | 4 chương mở đầu hoàn chỉnh và chương 5 viết dở; 4.747 từ văn xuôi gốc theo quy ước bộ đếm |
| `input/BLUEPRINT.md` | Ý đồ tác giả, nhân vật, kết thúc, phong cách; có spoiler tương lai |
| `input/chapter_plan.csv` | 40 chương dự kiến, mục tiêu và tiêu chí hoàn thành |
| `input/main_story_plan.template.json` | Payload đầy đủ cho plan chương 5–40; bind IDs trước khi gửi |
| `input/CANON_AT_START.md` | Sự kiện đã xảy ra và tri thức nhân vật tại điểm dừng |
| `input/PAYOFF_LEDGER.csv` | Các chi tiết gieo trước và khoảng chương cần giải quyết |
| `input/manifest.json` | Số từ thực, trạng thái chương và SHA-256 đầu vào |
| `EVALUATION.md` | Rubric toàn truyện và điều kiện verdict |
| `P3_100K_EVALUATION_PROTOCOL.md` | Giao thức nghiệm thu P3 bắt buộc 100k, đối chứng công bằng và full-book blind review |
| `architecture/CURRENT_DELTA_2026-10-21.md` | Bản đối chiếu architecture/map lịch sử với code/evidence mới; không tự nâng trạng thái LIVE PASS |
| `NARRATIVE_MEMORY_AUDIT.md` | Kiểm tra LLM extraction → proposals → memory → context cho P1/P2/P3 sau bootstrap, mỗi 10 chương, audit sâu mốc 20/50 và cuối run |
| `templates/` | Cấu hình run, báo cáo, nhật ký, lỗi, tiến độ, đánh giá chương |
| `tools/task_tool.py` | Công cụ offline: kiểm tra integrity, tạo run, đếm từ |
| `runs/` | Mỗi lần chạy một thư mục; không ghi đè evidence cũ |

## Quy ước đếm từ

Với tiếng Việt, “từ” trong task là **đơn vị cách nhau bằng khoảng trắng có ít nhất một chữ hoặc số**, sau chuẩn hóa Unicode NFC. Loại dòng tiêu đề Markdown bắt đầu `#`; không đếm metadata, báo cáo, blueprint, ghi chú hay bản nháp bị loại. Đây không phải bộ tách từ ngôn ngữ học và không phải token của model. Dùng cùng thuật toán cho đầu vào và đầu ra.

40 chương là bố cục mặc định. Bốn chương seed ngắn được giữ nguyên; phần còn lại cần dài hơn trung bình 2.500 từ để tổng đạt mục tiêu. Agent phải tính số từ còn thiếu theo thực tế, chia thành nhiều lượt viết/cảnh mỗi chương. Cho phép điều chỉnh phân bổ chương nếu ghi lại quyết định tác giả; không rút đích 100k xuống để báo pass.

## Phạm vi ba pipeline

- `P1`: import bản thảo, review/activate, viết tiếp, reject/accept, sửa thủ công, lưu và cập nhật bộ nhớ.
- `P2`: smoke riêng trên một dự án rỗng từ idea; trên dự án chính kiểm tra Story Plan hướng dẫn viết mà không làm tương lai thành lịch sử.
- `P3`: trước tiên probe controller nhiều objective trên dự án riêng; **sau probe đạt mới chạy nghiệm thu cuối bắt buộc `P3_HITL_CONTROLLER_100K`** đến kết thúc truyện 100.000–105.000 từ trên dự án/run riêng. Khi flag Human Entity Review bật phải dừng tại gate tác giả và ghi đúng mức can thiệp.

`P3_UNATTENDED_AUTONOMOUS_100K` là thí nghiệm/claim **riêng chưa có policy auto entity review được chấp nhận**, không tự chuyển flag OFF để lấy nhãn fully autonomous. Truyện assisted hybrid hoàn chỉnh không thay bằng chứng P3 controller. Đối chứng cần cùng seed/model/config/budget/rubric và khai báo intervention khác biệt.

Mỗi pipeline có audit narrative memory riêng sau bootstrap/import và accepted revision đầu tiên. Run dài kiểm tra tại 10/20/30/40/50… chương; bội số 20/50 có audit sâu. Run mặc định 40 chương ghi mốc 50 NOT_APPLICABLE; probe ngắn phải audit cuối và khai báo chưa có coverage dài hạn. Các template `memory_checkpoints.csv`, `memory_items.csv`, `memory_probes.csv` và `MEMORY_AUDIT.md` được sao khi init run. Run cũ muốn áp dụng task revision 1.1 phải thêm các template còn thiếu và ghi migration trong report; không ghi đè evidence cũ.

Tất cả dữ liệu tạo bởi task phải nằm dưới `Pipeline_test/`, trừ dữ liệu được lưu trong chính ứng dụng/DB phục vụ test. Không đưa mật khẩu, cookie, JWT, API key hay toàn bộ HTTP header vào evidence.

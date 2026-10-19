# Pipeline test — từ bản thảo dở đến tiểu thuyết 100.000 từ

Fixture ID: `PT-CV-001` · Fixture version: `1.0.0` · Task revision: `1.2` · Ngôn ngữ: tiếng Việt.

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

Đây là một task kiểm thử có thể chạy lại, không phải báo cáo hệ thống đã pass. Chưa thực thi lượt test nào khi tạo bộ tài liệu này. Không cần tạo chat mới để sử dụng.

**Đầu ra bắt buộc của lượt chạy đầy đủ:** một tiểu thuyết hoàn chỉnh khoảng **100.000 từ (95.000–105.000)** được đọc lại từ dữ liệu lưu trong sản phẩm, cùng báo cáo chất lượng, hành trình tác giả, mức can thiệp và mọi vấn đề gặp phải. Bản thảo đầu vào là phần mở đầu viết dở, **không phải nửa truyện 50.000 từ**. Không dùng dàn ý, tóm tắt hay lặp văn để bù độ dài.

## Bắt đầu

1. Đọc `TASK.md`, `AGENT_GUIDE.md`, `NARRATIVE_MEMORY_AUDIT.md` và `EVALUATION.md`.
2. Kiểm tra fixture: `python Pipeline_test/tools/task_tool.py verify`.
3. Tạo lượt chạy riêng: `python Pipeline_test/tools/task_tool.py init --run-id 2026-10-17-author-01`.
4. Giao nội dung `TASK.md` cho testing agent, chỉ định thư mục run vừa tạo. Điền cấu hình và ngân sách trước khi gọi model thật.
5. Chạy vòng ngắn theo `SHORT_LOOP_TEST.md` qua UI trước. Sau đó dùng `AGENT_GUIDE.md` cho bài dài; `AUTHOR_ASSISTED_HYBRID` chỉ đo năng lực có hỗ trợ API, không chứng minh hành trình UI đầy đủ.
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
- `P3`: probe riêng trên dự án dùng một lần để kiểm tra controller tự động; không coi probe này là đã viết tự động toàn bộ 100k.

Một run assisted hoàn thành truyện không chứng minh P3 tự động đạt 100k. Nếu yêu cầu chứng minh điều đó, chạy chế độ `AUTONOMOUS_100K` riêng trên dự án mới, cùng đầu vào và rubric, giữ nguyên giới hạn can thiệp đã khai báo.

Mỗi pipeline có audit narrative memory riêng sau bootstrap/import và accepted revision đầu tiên. Run dài kiểm tra tại 10/20/30/40/50… chương; bội số 20/50 có audit sâu. Run mặc định 40 chương ghi mốc 50 NOT_APPLICABLE; probe ngắn phải audit cuối và khai báo chưa có coverage dài hạn. Các template `memory_checkpoints.csv`, `memory_items.csv`, `memory_probes.csv` và `MEMORY_AUDIT.md` được sao khi init run. Run cũ muốn áp dụng task revision 1.1 phải thêm các template còn thiếu và ghi migration trong report; không ghi đè evidence cũ.

Tất cả dữ liệu tạo bởi task phải nằm dưới `Pipeline_test/`, trừ dữ liệu được lưu trong chính ứng dụng/DB phục vụ test. Không đưa mật khẩu, cookie, JWT, API key hay toàn bộ HTTP header vào evidence.

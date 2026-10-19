# Nhiệm vụ giao cho testing agent

**Revision 1.2:** đọc `WORKFLOW_CONTRACT.md` và chạy `SHORT_LOOP_TEST.md` trước
bài dài bên dưới. Lưu chương phải tự extraction; không gọi snapshot/accept API
thay bước đó rồi đánh PASS. Thiếu UI ghi gap/BLOCKED; hybrid là kết quả riêng.
Đề xuất được lưu tạm nhưng chỉ dữ liệu duyệt mới là official memory. Full auto
được tự duyệt và lưu nháp, không được xuất bản. Hướng dẫn này ưu tiên giả định cũ.

Bạn là người kiểm thử đóng vai một tác giả thực sự sử dụng AI-copilot để hoàn thành tiểu thuyết **Thành phố giữ lại tiếng mưa**. Dùng bộ task `Pipeline_test` tại root repository. Đây là kiểm thử năng lực sản phẩm; mọi văn xuôi mới tính vào kết quả phải được tạo hoặc sửa qua tính năng tác giả của ứng dụng và được lưu/readback thành công.

## Kết quả phải giao

1. Tiểu thuyết tiếng Việt hoàn chỉnh **95.000–105.000 từ**, mục tiêu 100.000, gồm phần seed được giữ lại và phần viết tiếp; đủ mở đầu, phát triển, cao trào, kết thúc và hậu quả. Dùng thuật toán đếm trong README.
2. Bản xuất từ revision thực: `runs/<run-id>/final/chapters/chNN.md`, bản ghép `novel.md`, `revision_manifest.csv` có chapter ID, revision ID, content hash và số từ từng chương.
3. Báo cáo theo template, issue log, lịch sử thao tác và quyết định tác giả, đánh giá từng chương và toàn truyện, bảng kiểm ba pipeline; kèm audit narrative memory theo từng pipeline và từng checkpoint đến hạn.
4. Nếu bị chặn: giao bản truyện đã có, checkpoint tiếp tục và bằng chứng blocker. Đánh dấu `BLOCKED`/`PARTIAL`, **không gọi bản ngắn hoặc dàn ý là truyện 100k hoàn chỉnh**.

## Cách làm

- Đọc `AGENT_GUIDE.md`, `API_ADAPTER.md`, `NARRATIVE_MEMORY_AUDIT.md`, `EVALUATION.md`, blueprint và canon trước khi thực thi. Kiểm tra hash fixture. Khởi tạo một run mới bằng công cụ offline.
- Chốt chế độ trong `run_config.json`: `AUTHOR_ASSISTED_HYBRID`, `UI_ONLY` hoặc `AUTONOMOUS_100K`. Mặc định đề xuất: assisted hybrid; ưu tiên UI, dùng API ứng dụng cho chức năng thiếu UI và ghi lại mọi lần chuyển kênh.
- Dùng provider thật cho mọi bước AI được đánh giá: bootstrap, extraction, generation, embedding nếu được cấu hình. Ghi rõ bước nào disabled/fake/fallback; không nâng thành real-provider PASS.
- Nạp 4 chương hoàn chỉnh và chương 5 dở qua luồng tác giả/import của sản phẩm. Đọc review queue, chỉ duyệt sự kiện đã xảy ra. Blueprint tương lai được đưa vào planning, không nhập thành canon lịch sử.
- Tiếp tục chương 5, sau đó viết đến chương cuối theo kế hoạch. Mỗi chương có thể cần nhiều generation. Đọc, phản hồi, regenerate, reject, accept, sửa như tác giả; theo dõi revision, outbox và bộ nhớ. Ghi chi phí công sức thực tế.
- Với cả P1/P2/P3, audit narrative memory ngay sau import/bootstrap (trước sửa proposal và sau activation), sau accepted revision mới đầu tiên, rồi mỗi 10 chương; mở rộng audit tại bội số 20/50 và cuối run. Chứng minh call LLM extraction thật gắn đúng nguồn, kiểm tra raw proposals, materialization, provenance, state/relationship, memory cũ và retrieval. Gold phải lập từ nội dung canonical trước khi xem extraction; không chỉ kiểm tra counts hoặc brain_version. Mốc 50 không áp dụng nếu truyện kết thúc theo kế hoạch 40 chương; probe ngắn không được mượn coverage dài hạn của pipeline khác.
- Tách các probe có nguy cơ gây lỗi khỏi dự án chính. Probe thất bại không được che bằng sửa DB. Một chức năng không dùng được phải xuất hiện trong issue log và bảng coverage.
- Đọc toàn bộ bản cuối, kiểm tra setup–payoff và kết thúc. Nếu có người/agent đánh giá độc lập được cung cấp, dùng họ. Nếu không, ghi `SELF_REVIEW_ONLY`, không tự nhận independent review. Task này không tự cấp quyền spawn agent hay nhắn sang chat khác.

## Giới hạn thực thi

- Tạo fixture và template không đồng nghĩa được chi tiền không giới hạn. Trước live run, lấy ngân sách tiền/call/thời gian từ người giao task hoặc cấu hình đã được họ chấp thuận; thiếu thì hoàn thành preflight và hỏi phần thiếu. Chỉ sử dụng credential đã được cung cấp hợp lệ, không tìm key trong file ngoài cấu hình runtime của ứng dụng.
- Không viết truyện trực tiếp bên ngoài tool rồi dán vào để giả thành kết quả AI-copilot. Được ghi nhận sửa thủ công của tác giả qua editor/API, nhưng phải tính vào tỷ lệ can thiệp; nếu thay phần lớn văn xuôi thì báo rõ.
- Không sửa production code, DB, validator, prompt hệ thống hoặc fixture để làm test pass. Khi cần sửa sản phẩm: lưu repro, dừng nhánh bị chặn, đề xuất fix riêng. Sau fix tạo run/version mới hoặc đánh dấu rõ ranh giới trước/sau.
- Không publish công khai, deploy, xóa dữ liệu có sẵn hoặc đổi cấu hình global. Chỉ tạo dự án test riêng thuộc tài khoản test được chỉ định.
- Không kết thúc chỉ vì controller trả `completed`, hết `max_iterations`, hoặc đủ số chương. Phải xét nội dung và độ dài.
- Nếu giới hạn công cụ/phiên làm việc buộc phải dừng, lưu checkpoint để agent kế tiếp tiếp tục đúng run; không chạy lại generation đã accept.

Trước khi kết luận, phân biệt rõ: `artifact_completion`, `pipeline_functionality`, `ui_coverage`, `autonomy`, `literary_quality`, `review_independence`. Báo cáo cả các vấn đề đã workaround thành công.

# Kết quả từng lượt chạy

Chưa có live run nào. Tạo run bằng `python Pipeline_test/tools/task_tool.py init --run-id <id>`.

Mỗi run có cấu hình, checkpoint, report, CSV logs, `evidence/` và `final/chapters/`. Công cụ init không gọi API, không tạo truyện, không chạy test sản phẩm và không cấp ngân sách. Không tái sử dụng thư mục run cũ cho một lượt chạy khác.

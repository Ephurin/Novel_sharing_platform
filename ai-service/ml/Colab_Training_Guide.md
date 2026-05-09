# Hướng dẫn Training trên Google Colab

## Nhiệm vụ của mô hình
Mô hình Machine Learning (Random Forest) trong hệ thống đóng vai trò là **Bộ lọc nhiễu (Noise Filter)** cho quy trình Hybrid NER. 
Nhiệm vụ cụ thể:
- **Phân loại ứng viên:** Sau khi hệ thống Rule-based trích xuất các cụm từ viết hoa (candidates), mô hình ML sẽ đánh giá xác suất cụm từ đó có thực sự là một thực thể (Tên riêng, địa danh, vật phẩm...) hay chỉ là từ viết hoa đầu câu/từ thông thường.
- **Tăng độ chính xác (Precision):** Loại bỏ các từ gây nhiễu như "Anh ấy", "Cả hai", "Tại vì"... thường bị nhầm là thực thể do viết hoa đầu câu.
- **Tối ưu hóa LLM:** Giảm số lượng thực thể giả gửi đến LLM, giúp tiết kiệm token và tăng tốc độ xử lý.

Để huấn luyện mô hình phân loại thực thể (Entity Classifier) mà không tốn tài nguyên máy cục bộ, hãy làm theo các bước sau:

### Bước 1: Chuẩn bị dữ liệu
Bạn cần một file `dataset.csv` với các cột:
- `length`: Số lượng từ trong cụm từ.
- `is_sentence_start`: 1 nếu đứng đầu câu, 0 nếu không.
- `has_digit`: 1 nếu chứa số, 0 nếu không.
- `char_count`: Độ dài ký tự.
- `label`: 1 (là thực thể) hoặc 0 (không phải).

### Bước 2: Chạy script trên Colab
1. Mở [Google Colab](https://colab.research.google.com/).
2. Tạo Notebook mới.
3. Copy nội dung từ file `ml/train_script.py` vào một ô mã (Code cell).
4. Upload file `dataset.csv` vào Colab (biểu tượng Folder bên trái).
5. Chạy ô mã.

### Bước 3: Tải Model về máy
Sau khi chạy xong, Colab sẽ tạo ra file `entity_classifier.pkl`.
1. Tải file này về.
2. Copy vào thư mục dự án: `ai-service/ml/models/`.

### Bước 4: Khởi động lại Backend
Backend sẽ tự động nhận diện file `.pkl` và kích hoạt tính năng ML Enhancement.

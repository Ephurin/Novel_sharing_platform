# **Module AI: Trợ lý Sáng tác Thông minh (AI Writing Co-pilot)**

## **1\. Giới thiệu tổng quan**

Trong các hệ thống chia sẻ truyện truyền thống, tác giả thường gặp khó khăn trong việc duy trì tính nhất quán của cốt truyện khi tác phẩm kéo dài (Plot-hole). Module AI này không chỉ đóng vai trò gợi ý văn bản đơn thuần mà còn hoạt động như một "quản lý dữ liệu sáng tạo", giúp cấu trúc hóa toàn bộ thế giới trong truyện thành các đối tượng có thể truy vấn.

## **2\. Các thành phần cốt lõi (Core Features)**

### **2.1. Trích xuất Thực thể & Ánh xạ Đối tượng (Entity Extraction & Mapping)**

* **Chức năng:** Tự động nhận diện và phân loại các thực thể như Nhân vật (Character), Tổ chức (Organization), Địa điểm (Location) và Vật phẩm (Item) từ nội dung chương mới.  
* **Công nghệ:** Sử dụng mô hình **PhoBERT/viBERT Fine-tuned** cho bài toán Nhận diện thực thể có tên (NER).  
* **Đầu ra:** Một tệp cấu trúc **JSON/Markdown** lưu trữ thuộc tính và quan hệ giữa các thực thể (Ví dụ: Nhân vật A là kẻ thù của Tổ chức B).

### **2.2. Gợi ý Cốt truyện dựa trên Ngữ cảnh (Context-Aware Plot Suggestion)**

* **Chức năng:** Đưa ra các gợi ý tình tiết tiếp theo dựa trên trạng thái hiện tại của các đối tượng trong Đồ thị tri thức.  
* **Cơ chế:** Thay vì gợi ý ngẫu nhiên, AI sẽ đọc "bản đồ quan hệ" để đảm bảo tính logic (Ví dụ: Không gợi ý nhân vật A xuất hiện nếu vị trí hiện tại của A đang ở quá xa).  
* **Tùy biến:** Tác giả có thể điều chỉnh "Mood" (Hồi hộp, Lãng mạn, Bi kịch) để định hướng gợi ý của AI.

### **2.3. Kiểm tra tính Nhất quán & Phát hiện Plot-hole**

* **Chức năng:** Đối chiếu tình tiết mới viết với cơ sở dữ liệu đối tượng để phát hiện các mâu thuẫn logic.  
* **Ví dụ:** Cảnh báo nếu một nhân vật đã bị thương nặng ở chương trước nhưng lại chiến đấu bình thường ở chương sau mà không có lời giải thích.

## **3\. Kiến trúc Triển khai (Technical Architecture)**

* **Dữ liệu:** Thu thập và tiền xử lý từ Corpus truyện tiếng Việt.  
* **Huấn luyện:** Thực hiện Fine-tuning trên Google Colab với PyTorch và HuggingFace.  
* **Tích hợp:** AI Service chạy độc lập, giao tiếp với Web Editor thông qua REST API (FastAPI/NestJS).


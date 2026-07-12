# 💡 Ý tưởng Cập nhật & Nâng cấp (Possible Updates)

Tài liệu này lưu trữ các ý tưởng cải tiến hệ thống AI Story Co-Pilot dựa trên quá trình phát triển và phản hồi thực tế.

## 1. 🧠 Cơ chế Heuristic Thích ứng (Adaptive Heuristics)
Tự động mở rộng bộ quy tắc gán nhãn dựa trên dữ liệu thực tế mà không cần can thiệp vào mã nguồn.

- **Cơ chế học từ LLM**: Khi LLM gán nhãn cho một thực thể mới, hệ thống sẽ phân tích tiền tố/hậu tố (ví dụ: "Phủ", "Động", "Cung") và tích lũy vào bộ nhớ tạm.
- **Ngưỡng tin cậy (Confidence Threshold)**: Chỉ chính thức thêm từ khóa vào Heuristic sau khi nó xuất hiện và được xác nhận trên ít nhất 5 thực thể khác nhau.
- **Phân cấp lưu trữ**:
    - `story_keywords.json`: Từ khóa đặc thù cho từng bộ truyện.
    - `global_keywords.json`: Từ khóa phổ biến cho toàn hệ thống.
- **Lợi ích**: Tăng tốc độ xử lý, giảm phụ thuộc vào LLM và cá nhân hóa trải nghiệm cho từng tác giả.

## 2. 📚 Quản lý Ngữ cảnh Dài hạn (RAG - Vector Database)
Giải quyết vấn đề giới hạn context window của LLM khi truyện kéo dài hàng trăm chương.

- **Vector Storage**: Lưu trữ tóm tắt các sự kiện, trạng thái thực thể vào Vector DB (như ChromaDB hoặc Pinecone).
- **Context Retrieval**: Khi phân tích chương mới, hệ thống tự động tìm kiếm các thông tin liên quan từ quá khứ (ví dụ: "Nhân vật này đã chết ở chương 50") để đảm bảo tính nhất quán cao nhất.

## 3. 📖 Hệ thống Wiki Động (Dynamic Wiki-style Lorebook)
Chuyển đổi giao diện hiển thị Knowledge Graph sang dạng danh sách thả xuống (dropdown/accordion) đa cấp thân thiện với tác giả, giống cấu trúc các trang Fandom Wiki.

- **Entity Profiles**: Hiển thị hồ sơ chi tiết cho từng thực thể dưới dạng thẻ thông tin (trạng thái hiện tại, vật phẩm sở hữu, lịch sử vị trí).
- **Relational Dropdowns**: Quản lý mối quan hệ bằng danh sách thả xuống và liên kết chéo (Ví dụ: mục "Kẻ thù" hiển thị danh sách tên nhân vật, click vào sẽ chuyển sang hồ sơ của người đó).
- **Timeline Events**: Danh sách các sự kiện theo dòng thời gian mà thực thể đã tham gia.
- **Conflict Highlighting**: Cảnh báo mâu thuẫn logic bằng cách bôi đỏ hoặc gắn cảnh báo ngay trên thẻ hồ sơ (ví dụ: "⚠️ Cảnh báo: Nhân vật này đang được ghi nhận ở 2 địa điểm khác nhau").

## 4. 🎭 Tự động Gợi ý Phát triển Nhân vật (Character Growth Suggestion)
Phân tích sự thay đổi trạng thái (Entity State) để đưa ra gợi ý sáng tạo.

- **Growth Tracking**: Theo dõi sự thay đổi về sức mạnh, tâm trạng của nhân vật.
- **Plot Hole Detection**: Cảnh báo nếu nhân vật có hành động trái ngược hoàn toàn với thiết lập tính cách hoặc sức mạnh đã có trước đó.

## 5. 📊 Bảng điều khiển Phân tích Sáng tạo (Creative Analytics Dashboard)
Thay thế khái niệm "Đánh giá mức độ phụ thuộc AI" bằng hệ thống đo lường trung tính, tập trung vào vai trò làm chủ của tác giả (Creative Ownership). Tránh việc phán xét và khuyến khích sự sáng tạo độc lập.

- **Đo lường đa chiều (Creative Independence Metrics):** Thay vì một điểm số duy nhất, hệ thống theo dõi nhiều chỉ số:
  - *Human Contribution Ratio:* Tỷ lệ nội dung do người trực tiếp viết.
  - *AI Acceptance/Override Ratio:* Tỷ lệ chấp nhận/bác bỏ gợi ý từ AI.
  - *Manual Worldbuilding/Planning Ratio:* Tỷ lệ tự xây dựng thiết lập thế giới và dàn ý.
- **Kiến trúc hướng Sự kiện (Event-driven Tracking):** Lưu trữ hành động của tác giả dưới dạng event logs với trọng số (Ví dụ: tự tạo nhân vật `+`, chấp nhận AI sinh nguyên bản `-`, tranh luận/viết lại văn bản AI `+`) thay vì tính điểm cộng/trừ trực tiếp. Các event này sẽ được Analytics Engine xử lý thành dữ liệu cho Dashboard.
- **Phân loại Hồ sơ Tác giả (Author Archetypes):** Dựa trên dữ liệu để xếp loại phong cách sáng tác (Ví dụ: *Traditional Writer, AI-Assisted Writer, AI Collaborator, AI Director, AI-First Creator*). Thông tin này mang tính trực quan và giúp cá nhân hóa công cụ hỗ trợ cho từng loại tác giả.

---
*Tài liệu này sẽ được cập nhật liên tục trong quá trình phát triển dự án.*

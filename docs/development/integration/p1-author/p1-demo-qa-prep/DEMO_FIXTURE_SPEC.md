# P1 Author Experience — Reusable Demo Fixture Specification

**Document Version:** 1.0  
**Target Demo Date:** 09/11/2026  
**Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`  
**Execution Authority:** Standard Authorized Production API Paths (Direct SQL strictly labeled for diagnostic readback only)

---

## 1. Narrative Design & World Setup

- **Novel Title:** *Đại Lục Tinh Thần* (The Astral Continent)
- **Genre:** Tiên hiệp / Huyền huyễn, thế giới tu chân cổ điển.
- **Author Persona:** `author_demo_p1` (`author_demo_p1@example.invalid`)

### Entities Summary (Minimum Required: 2 Characters, 1 Location, 1 Item)

| Entity Name | Type | Initial Canonical State (Chapter 1) | Subsequent Evolution |
|---|---|---|---|
| **Lâm Phong** | `CHARACTER` | Thiếu niên kiên nghị 16 tuổi, đệ tử ngoại môn Lâm gia tại Trấn Thanh Phong. Mang theo ngọc bội gia truyền. | Chiến đấu tại Hang Hắc Long, bảo vệ Diệp Linh Nhi, phát hiện ngọc bội bị vỡ. |
| **Diệp Linh Nhi** | `CHARACTER` | Nữ đệ tử thanh tú, thiên phú đan đạo, bạn thanh mai trúc mã của Lâm Phong. | Cùng Lâm Phong vào Hang Hắc Long tìm linh dược, thu thập nửa mảnh ngọc bội vỡ. |
| **Trấn Thanh Phong** | `LOCATION` | Thị trấn biên thùy yên bình nằm dưới chân dãy núi Hắc Long. Nơi Lâm gia cư ngụ. | Khởi điểm của cuộc hành trình. |
| **Ngọc Bội Huyết Long** | `ITEM` | Miếng ngọc bội cổ xưa màu đỏ thẫm hình rồng cuộn, nguyên vẹn không tì vết, tỏa nhiệt ấm áp. | **STATE CHANGE in Ch 2:** Bị vỡ đôi trong trận chiến. Lâm Phong giữ nửa long đầu, Diệp Linh Nhi giữ nửa long vĩ. |

---

## 2. Chapter Structure & Narrative Flow

### Chương 1 — *Khởi Đầu Tại Trấn Thanh Phong*
- **Role:** Establish Baseline Canon (Characters, Location, Initial Item State).
- **Prose Content:**
  > Ánh hoàng hôn buông xuống Trấn Thanh Phong, nhuộm đỏ những mái ngói rêu phong của các gia tộc tu chân nơi biên thùy. Tại một góc sân luyện võ, Lâm Phong khẽ lau đi mồ hôi trên trán, đưa tay chạm vào chiếc Ngọc Bội Huyết Long đeo trước ngực. Miếng ngọc bội gia truyền màu đỏ thẫm nguyên vẹn, bề mặt khắc họa hình rồng cuộn tinh xảo, tỏa ra luồng khí ấm áp dịu dàng.
  > 
  > Từ ngoài cổng viện, tiếng bước chân thanh thoát vang lên. Diệp Linh Nhi mỉm cười bước vào, trên tay cầm theo một hộp đan dược do nàng tự tay luyện chế: "Lâm Phong ca ca, ngày mai chúng ta phải tiến vào Hang Hắc Long tìm Hắc Huyết Thảo rồi, huynh đã chuẩn bị xong chưa?" Lâm Phong gật đầu, ánh mắt kiên định nhìn về phía dãy núi mờ xa.
- **Canonical Facts Established:**
  - `Lâm Phong` là thiếu niên tu sĩ tại `Trấn Thanh Phong`.
  - `Diệp Linh Nhi` là nữ đệ tử đan đạo thân thiết với Lâm Phong.
  - `Ngọc Bội Huyết Long` là vật phẩm gia truyền của Lâm Phong, trạng thái ban đầu: `INTACT` (nguyên vẹn).

---

### Chương 2 — *Biến Cố Hang Hắc Long*
- **Role:** State Change Event (Item condition changes from Intact to Broken).
- **Prose Content:**
  > Trong lòng Hang Hắc Long ẩm ướt và tối tăm, luồng yêu khí nồng nặc bốc lên. Đột nhiên, một con Hắc Long Xà khổng lồ lao ra từ vách đá, đuôi rắn mang theo kình phong xé toạc không khí quét thẳng về phía Diệp Linh Nhi. Trong khoảnh khắc ngàn cân treo sợi tóc, Lâm Phong không ngần ngại lao mình che chắn trước mặt nàng.
  > 
  > Một tiếng nổ chát chúa vang lên khi đòn tấn công va chạm thẳng vào ngực Lâm Phong. Chiếc Ngọc Bội Huyết Long phát ra ánh sáng đỏ chói lòa chống đỡ một phần uy lực, nhưng dưới áp lực khủng khiếp, tiếng rạn nứt vang lên giòn giã. Miếng ngọc bội vỡ làm đôi. Lâm Phong ôm ngực thổ huyết đẩy lui con yêu thú. Sau khi thoát khỏi hang động, Lâm Phong giữ lại nửa mảnh có hình long đầu, còn nửa mảnh vỡ mang hình long vĩ rơi vào tay Diệp Linh Nhi khi nàng đỡ lấy hắn.
- **State Change Event:**
  - `canon_event`: "Trận chiến Hang Hắc Long: Ngọc Bội Huyết Long bị vỡ làm đôi. Lâm Phong giữ nửa long đầu, Diệp Linh Nhi giữ nửa long vĩ."
  - `temporal_state`: Trạng thái của `Ngọc Bội Huyết Long` chuyển thành `BROKEN_TWO_HALVES` từ mốc Chương 2 trở đi.

---

### Chương 3 — *Bí Mật Lâm Gia*
- **Role:** Author Private Secret Note & Reviewable Correction Proposal.
- **Prose Content:**
  > Trở về Trấn Thanh Phong sau trận tử chiến, Lâm Phong ngồi tĩnh tọa trong căn phòng nhỏ, nhìn nửa mảnh ngọc bội long đầu nằm trong lòng bàn tay. Diệp Linh Nhi sau khi bôi thuốc cho hắn đã mang nửa mảnh long vĩ về đan phòng để nghiên cứu thành phần ngọc thạch kỳ lạ này. Cả hai đều không hề hay biết rằng, sự vỡ vụn của miếng ngọc chính là bước đầu tiên mở ra một bí mật long trời lở đất.
- **Author Private Secret Note (Confidential — Strictly NOT Canon):**
  - *Note Field:* `author_private_lore`
  - *Text:* `"BÍ MẬT TÁC GIẢ (CHỈ DÀNH CHO OUTLINE): Ngọc Bội Huyết Long không phải bảo vật bình thường mà là phong ấn nhốt một sợi tàn hồn của Cổ Đại Thần Ma. Khi bị vỡ làm đôi, phong ấn bắt đầu suy yếu. Chỉ khi máu của hậu duệ Thần Ma nhỏ vào đêm trăng tròn, phong ấn mới hoàn toàn giải trừ. Lâm Phong chính là huyết mạch Ma Thần duy nhất còn sót lại tại thế gian. Tuyệt đối không tiết lộ trong Canon hay context của độc giả trước Chương 50."`
  - *Contract Constraint:* Must NEVER leak into Context Assembly for LLM generation or public Reader views.
- **Reviewable Correction Proposal:**
  - *Raw AI Proposal:* AI trích xuất nhầm: `"Diệp Linh Nhi là người sở hữu và đeo miếng ngọc bội vỡ."`
  - *Author Correction Action:* Tác giả sửa proposal thành: `"Lâm Phong giữ nửa ngọc bội long đầu, Diệp Linh Nhi chỉ tạm thời giữ nửa long vĩ để khảo sát đan liệu."`
  - *Status:* Proposal ở trạng thái `PENDING_REVIEW` sẵn sàng để tác giả demo thao tác duyệt/sửa trong UI.

---

### Chương 4 — *Vết Tích Cổ Sơn* (Writing Loop Demonstration Chapter)
- **Role:** Live Writing Loop in Author IDE.
- **Initial Draft Text:**
  > Sáng sớm hôm sau, Lâm Phong mang theo nửa mảnh ngọc long đầu bước ra khỏi Trấn Thanh Phong, hướng về phía Cổ Sơn...
- **Interactive UI Journey Demo:**
  1. Author types new paragraphs in real-time.
  2. Automatic debounce save & instant revision snapshot.
  3. Author triggers "Ask AI Copilot" / "Consistency Check".
  4. Consistency check verifies temporal state: confirms `Ngọc Bội Huyết Long` is broken in Chapter 4 context without flagging false contradictions.
  5. Copilot suggestion honors private note boundary: generates continuation without leaking author's confidential Ma Thần secret.

---

## 3. Production API Seeding Path vs Direct SQL Readback

To guarantee authentic behavior, all fixture creation must execute via official HTTP endpoints using authenticated author credentials:

```
[Register Author]   --> POST /api/v1/auth/register
[Login Author]      --> POST /api/v1/auth/login -> Receive JWT
[Create Novel]      --> POST /api/v1/novels -> Receive novelId
[Create Ch 1..3]    --> POST /api/v1/novels/{novelId}/chapters
[Snapshot Revisions]--> POST /api/v1/chapters/{chapterId}/revisions/snapshot
[Bootstrap Brain]   --> POST /api/v1/ai/story-brains/bootstrap/from-manuscript
[Review Entities]   --> POST /api/v1/ai/story-brains/{novelId}/entity-reviews/{runId}/review
[Freeze & Continue] --> POST /api/v1/ai/story-brains/{novelId}/entity-reviews/{runId}/continue
[Activate Baseline] --> POST /api/v1/ai/story-brains/{novelId}/baseline/activate
[Inject Secret Note]--> POST /api/v1/ai/story-brains/{novelId}/notes (private scope)
[Seed Proposal]     --> POST /api/v1/ai/story-brains/{novelId}/proposals/mock-candidate
[Create Ch 4 Draft] --> POST /api/v1/novels/{novelId}/chapters (Draft state)
```

**Direct SQL Usage Rule:**
- Direct SQL execution (`psql`) is strictly reserved for:
  1. Role escalation: `UPDATE users SET role='AUTHOR' WHERE user_id='...'` (system administration prerequisite).
  2. Readback verification queries (`SELECT ... FROM canon_entities / canon_events / revision_outbox_events`).
- Direct SQL must NEVER be used to bypass UI/API endpoints for entity creation or proposal commits.

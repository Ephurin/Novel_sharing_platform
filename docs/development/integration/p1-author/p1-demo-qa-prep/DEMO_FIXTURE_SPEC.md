# P1 Author Experience — Reusable Demo Fixture Specification

**Document Version:** 1.1  
**Target Demo Date:** 09/11/2026  
**Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`  
**Execution Authority:** Standard Authorized Production API Paths (Direct SQL strictly labeled for diagnostic readback only)

---

## 1. Narrative Design & World Setup

- **Novel Title:** *Đại Lục Tinh Thần* (The Astral Continent)
- **Genre:** Tiên hiệp / Huyền huyễn, thế giới tu chân cổ điển.
- **Author Persona:** `author_demo_p1` (`author_demo_p1@example.invalid`)

### Entities Summary (Minimum Required: 2 Characters, 1 Location, 1 Item)
*Entity types strictly adhere to domain enum: `PER`, `LOC`, `ORG`, `ITEM`, `SKILL`.*

| Entity Name | Type | Initial Canonical State (Chapter 1) | Subsequent Evolution |
|---|---|---|---|
| **Lâm Phong** | `PER` | Thiếu niên kiên nghị 16 tuổi, đệ tử ngoại môn Lâm gia tại Trấn Thanh Phong. Mang theo ngọc bội gia truyền. | Chiến đấu tại Hang Hắc Long, bảo vệ Diệp Linh Nhi, phát hiện ngọc bội bị vỡ. |
| **Diệp Linh Nhi** | `PER` | Nữ đệ tử thanh tú, thiên phú đan đạo, bạn thanh mai trúc mã của Lâm Phong. | Cùng Lâm Phong vào Hang Hắc Long tìm linh dược, thu thập nửa mảnh ngọc bội vỡ. |
| **Trấn Thanh Phong** | `LOC` | Thị trấn biên thùy yên bình nằm dưới chân dãy núi Hắc Long. Nơi Lâm gia cư ngụ. | Khởi điểm của cuộc hành trình. |
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
  - `Lâm Phong` (`PER`) là thiếu niên tu sĩ tại `Trấn Thanh Phong` (`LOC`).
  - `Diệp Linh Nhi` (`PER`) là nữ đệ tử đan đạo thân thiết với Lâm Phong.
  - `Ngọc Bội Huyết Long` (`ITEM`) là vật phẩm gia truyền của Lâm Phong, trạng thái ban đầu: `INTACT` (nguyên vẹn).
- **Snapshot Purpose:** `MANUSCRIPT_BOOTSTRAP`

---

### Chương 2 — *Biến Cố Hang Hắc Long*
- **Role:** State Change Event (Item condition changes from Intact to Broken).
- **Prose Content:**
  > Trong lòng Hang Hắc Long ẩm ướt và tối tăm, luồng yêu khí nồng nặc bốc lên. Đột nhiên, một con Hắc Long Xà khổng lồ lao ra từ vách đá, đuôi rắn mang theo kình phong xé toạc không khí quét thẳng về phía Diệp Linh Nhi. Trong khoảnh khắc ngàn cân treo sợi tóc, Lâm Phong không ngần ngại lao mình che chắn trước mặt nàng.
  > 
  > Một tiếng nổ chát chúa vang lên khi đòn tấn công va chạm thẳng vào ngực Lâm Phong. Chiếc Ngọc Bội Huyết Long phát ra ánh sáng đỏ chói lòa chống đỡ một phần uy lực, nhưng dưới áp lực khủng khiếp, tiếng rạn nứt vang lên giòn giã. Miếng ngọc bội vỡ làm đôi. Lâm Phong ôm ngực thổ huyết đẩy lui con yêu thú. Sau khi thoát khỏi hang động, Lâm Phong giữ lại nửa mảnh có hình long đầu, còn nửa mảnh vỡ mang hình long vĩ rơi vào tay Diệp Linh Nhi khi nàng đỡ lấy hắn.
- **State Change Event:**
  - `narrative.events`: "Trận chiến Hang Hắc Long: Ngọc Bội Huyết Long bị vỡ làm đôi. Lâm Phong giữ nửa long đầu, Diệp Linh Nhi giữ nửa long vĩ."
  - `temporal_state`: Trạng thái của `Ngọc Bội Huyết Long` chuyển thành `BROKEN_TWO_HALVES` từ mốc Chương 2 trở đi.
- **Snapshot Purpose:** `AUTHOR_SNAPSHOT`

---

### Chương 3 — *Bí Mật Lâm Gia*
- **Role:** Author Lore Setup & Event Correction Candidate.
- **Prose Content:**
  > Trở về Trấn Thanh Phong sau trận tử chiến, Lâm Phong ngồi tĩnh tọa trong căn phòng nhỏ, nhìn nửa mảnh ngọc bội long đầu nằm trong lòng bàn tay. Diệp Linh Nhi sau khi bôi thuốc cho hắn đã mang nửa mảnh long vĩ về đan phòng để nghiên cứu thành phần ngọc thạch kỳ lạ này. Cả hai đều không hề hay biết rằng, sự vỡ vụn của miếng ngọc chính là bước đầu tiên mở ra một bí mật long trời lở đất.
- **Author Private Note (AX-01 PostgreSQL Storage — Strictly Excluded from Canon):**
  - *Storage:* Stored in PostgreSQL column `narrative.entities.private_author_notes TEXT` and audited in `narrative.entity_profile_audits`.
  - *Text:* `"BÍ MẬT TÁC GIẢ (CHỈ DÀNH CHO OUTLINE): Ngọc Bội Huyết Long không phải bảo vật bình thường mà là phong ấn nhốt một sợi tàn hồn của Cổ Đại Thần Ma. Khi bị vỡ làm đôi, phong ấn bắt đầu suy yếu. Chỉ khi máu của hậu duệ Thần Ma nhỏ vào đêm trăng tròn, phong ấn mới hoàn toàn giải trừ. Lâm Phong chính là huyết mạch Ma Thần duy nhất còn sót lại tại thế gian. Tuyệt đối không tiết lộ trong Canon hay context của độc giả trước Chương 50."`
  - *Contract Constraint:* Must NEVER leak into Story Brain Context Assembly for LLM generation or public Reader views.
- **Event Correction Journey:**
  - Existing approved event corrected via production endpoint `POST /api/v1/ai/story-brains/{novelId}/events/{eventId}/corrections`.
  - Yields pending correction proposals in review queue.
  - Finalized via `POST /api/v1/ai/proposal-groups/{groupId}/accept` with `expected_brain_version`.
- **Snapshot Purpose:** `AUTHOR_SNAPSHOT`

---

### Chương 4 — *Vết Tích Cổ Sơn* (Writing Loop Demonstration Chapter)
- **Role:** Live Writing Loop in Author IDE.
- **Initial Draft Text:**
  > Sáng sớm hôm sau, Lâm Phong mang theo nửa mảnh ngọc long đầu bước ra khỏi Trấn Thanh Phong, hướng về phía Cổ Sơn...
- **Interactive UI Journey Demo:**
  1. Author types new paragraphs in real-time.
  2. Automatic debounce save & instant revision snapshot.
  3. Author triggers "Ask AI Copilot" / "Context Preview".
  4. Consistency check verifies temporal state: confirms `Ngọc Bội Huyết Long` is broken in Chapter 4 context without flagging false contradictions.
  5. Copilot suggestion honors private note boundary: generates continuation without leaking author's confidential Ma Thần secret.

---

## 3. Production API Seeding Path vs Direct SQL Readback

All fixture creation must execute strictly via official HTTP production endpoints using authenticated author credentials:

```
[Register Reader]       --> POST /api/v1/auth/register (Role: READER)
[Login Reader]          --> POST /api/v1/auth/login -> Receive reader token
[Promote to Author]     --> POST /api/v1/auth/become-author -> Receive new AUTHOR accessToken
[Create Novel]          --> POST /api/v1/novels -> Receive novelId
[Create Ch 1..3]        --> POST /api/v1/novels/{novelId}/chapters
[Snapshot Revisions]    --> POST /api/v1/chapters/{chapterId}/revisions/snapshot
                            - Ch 1: purpose = MANUSCRIPT_BOOTSTRAP
                            - Ch 2: purpose = AUTHOR_SNAPSHOT
                            - Ch 3: purpose = AUTHOR_SNAPSHOT
[Create Ch 4 Draft]     --> POST /api/v1/novels/{novelId}/chapters (Initial unsaved writing loop draft)
[Bootstrap Brain]       --> POST /api/v1/ai/story-brains/bootstrap/from-manuscript (Pending HITL)
[Review Entities]       --> POST /api/v1/ai/story-brains/{novelId}/entity-reviews/{runId}/review
[Freeze & Continue]     --> POST /api/v1/ai/story-brains/{novelId}/entity-reviews/{runId}/continue
[Activate Baseline]     --> POST /api/v1/ai/story-brains/{novelId}/baseline/activate
[Event Correction]      --> POST /api/v1/ai/story-brains/{novelId}/events/{eventId}/corrections
[Accept Proposal Group] --> POST /api/v1/ai/proposal-groups/{groupId}/accept (Atomic dependency group)
```

**Fixture Stage Separation:**
- `BASIC_FIXTURE_READY`: Account + Author promotion + Novel + 4 Chapters + 3 Revisions created and readback verified via HTTP.
- `CANON_FIXTURE_READY`: Story Brain bootstrap, entity review freeze/continue, and proposal group acceptance executed via production paths. (Remains `CANON_FIXTURE_PENDING_HITL` until executed).

**Direct SQL Usage Rule:**
- Direct SQL execution (`psql`) is strictly reserved for readback verification queries:
  `SELECT ... FROM narrative.entities`
  `SELECT ... FROM narrative.events`
  `SELECT ... FROM narrative.facts`
  `SELECT ... FROM narrative.proposals`
  `SELECT ... FROM chapter_revisions, revision_outbox_events`
- Direct SQL must NEVER be used to bypass UI/API endpoints for account role escalation, entity creation, or proposal commits.

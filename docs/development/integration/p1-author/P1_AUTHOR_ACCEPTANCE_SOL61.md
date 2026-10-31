# P1-AUTHOR-ACCEPTANCE-02 — Sol 6.1

**Verdict: P1_AUTHOR_ACCEPTANCE_PARTIAL**

Ngày kiểm thử: 31/10/2026, Asia/Ho_Chi_Minh. Target demo: 09/11/2026.

Canon/HITL và chỉnh sửa entity/event trước/sau duyệt đã hoạt động qua UI, bền vững sau reload và đăng xuất/đăng nhập. Chưa xác nhận được accept/reject draft: draft Gemini cũ vẫn còn trong DB nhưng UI mở lại không khôi phục nó. **0 BLOCKER đã tái hiện; 1 MAJOR UX/functionality gap, 1 MINOR.** Không đồng nghĩa các test NOT_RUN đã PASS.

## Phạm vi, môi trường và giới hạn

- Repo Ephurin/Novel_sharing_platform; checkout `C:\Users\Laptop\OneDrive\Documents\testproject\.gemini-p1-free`.
- Branch gemini/p1-live-free-tier-01; SHA đầu/cuối `59b0fcb54863391081cbf6d0ed5b5c56e441e487`.
- Backend, ai-service, frontend, gateway HTTP 200; PostgreSQL/pgvector 0.8.6 hoạt động.
- Tài khoản sol61, đăng nhập bằng mật khẩu đọc cục bộ không hiển thị. Đã thực hiện logout/login bằng UI.
- Truyện QA Huyết Ngọc Bội: 09167bb0-e6b0-4aca-bf55-20fc94b35e8a; chương 7144ea09-a77a-43cd-a804-e67a69e6bd82.
- Manuscript 346 từ giữ nguyên hoàn toàn so với smoke; không chứa đoạn draft chưa được accept.
- Mọi thay đổi dữ liệu thực hiện qua giao diện. SQL chỉ SELECT/đọc schema; không INSERT/UPDATE/DELETE để tạo PASS. Không sửa source, rebuild, merge, PR mới, reset ledger hoặc bật forwarding.

| Provider boundary | Trước | Sau |
|---|---:|---:|
| Ledger smoke real-smoke-01 / tổng dispatch lịch sử | 6 | 6 |
| Outbound audit POST lịch sử | 6 | 6 |
| Ledger Free Tier dormant / RPD | 0 | 0 |
| New Gemini calls của vòng này | 0 | **0** |
| LIVE_FREE_TIER_ENABLED effective | false | false |
| LIVE_UPSTREAM_FORWARDING effective | false | false |
| In-flight | 0 | 0 |

Gateway từ chối model-list có worker token với 503 trước provider; không gọi Google để kiểm tra trạng thái. File final-provider-boundary.txt xác minh counts và flags trong container. Một alert lịch sử “Trích xuất thất bại · đã thử lại 5 lần” đã tồn tại khi mở review; không bấm reanalysis, consistency check hoặc Full auto. Alert không được quy thành lỗi Gemini mới; không có real dispatch phát sinh.

## Fixtures thực tế và cách kiểm thử

Lúc bắt đầu: Brain v1 active nhưng entities/events/facts/candidates đều trống. Native extraction JSON từ smoke chỉ là bằng chứng request, chưa phải candidate trong application workflow. Draft writing có 1 job completed/passed, không có draft thứ hai.

UI hỗ trợ tạo fixture thủ công không provider:

1. Chờ duyệt → Khai báo thực thể thế giới: tạo Lâm Phong PER và Tô Mặc PER.
2. Kiểm tra Canon còn trống; reject riêng Tô Mặc; Canon không đổi.
3. Approve riêng Lâm Phong; chỉ Lâm Phong xuất hiện trong Canon.
4. Hồ sơ Codex: thêm mô tả/ngoại hình, rồi thêm tính cách, rồi ghi chú QA giả lập; từng lần save/readback thành công.
5. Reload trang, mở lại hồ sơ; dữ liệu còn nguyên.
6. Tạo event thủ công bằng quote duy nhất từ bản lưu: “Cả hai thống nhất chưa kể chuyện này cho bất cứ ai.” Sửa summary trong proposal rồi approve.
7. Tab Sự kiện → Đề xuất chỉnh sửa: ánh xạ Lâm Phong về UUID Canon, gửi correction; event cũ chưa thay đổi trước approve. Approve correction; UI hiển thị nội dung mới, DB giữ bản cũ với supersedes_id ở bản mới.
8. Logout/login; đọc lại profile và event, Brain v6 và dữ liệu còn nguyên.
9. Khai báo Huyết Ngọc Bội ITEM và approve; UI Vật phẩm hiển thị đúng, Brain v7.

Đây là nghiệm thu HITL với **proposal do tác giả nhập thủ công**, không phải chứng minh extraction AI hoặc checkpoint identity từ extraction. Tô Mặc được cố ý reject làm fixture; không bị tự động Canon hóa. Trấn Thanh Phong nằm trong manuscript/event source, chưa tạo entity LOC riêng.

## Test cases

| Test | Result | Evidence / phạm vi |
|---|---|---|
| A01 — Danh sách entities | PASS | UI Nhân vật hiển thị Lâm Phong PER; Vật phẩm hiển thị Huyết Ngọc Bội ITEM sau manual approval; Tô Mặc rejected không xuất hiện Canon |
| A02 — Sửa ngoại hình | PASS | Sau duyệt, lưu “Dáng cao gầy, tóc đen buộc gọn, mặc áo xanh sẫm.”; đọc lại thành công |
| A03 — Thêm tính cách | PASS | “Thận trọng, trọng tình bạn và kiên quyết giữ lời hứa.”; mô tả/ngoại hình giữ nguyên |
| A04 — Ghi chú/trạng thái | PASS (ghi chú) | Ghi chú giả lập lưu/readback/reload/login thành công; Profile v2→v3, Brain giữ v4. Historical state transition chưa thử |
| A05 — Sửa sự kiện | PASS | Sửa summary trước duyệt và Event Correction sau duyệt; UUID mapping bắt buộc; chỉ áp dụng khi approve |
| A06 — Reject candidate | PASS | Tô Mặc rejected; Brain v1, 0 entities/events/facts trước/sau; hash Canon không đổi |
| A07 — Accept candidate | PASS | Lâm Phong và ITEM được approve riêng; chỉ proposal accepted áp dụng |
| B01 — Chưa duyệt không vào Canon | PASS | Entity pending và event correction pending không đổi counts/hashes/Brain |
| B02 — Approve đúng phạm vi | PASS | Chỉ thêm entity/event/correction đã chọn; proposal-decisions.txt |
| B03 — Reject giữ Canon | PASS | pending-before-reject.txt và after-reject-before-approve.txt giống nhau ở counts/hashes/Brain |
| B04 — Reload | PASS | Profile/notes và manuscript còn nguyên; không reset hoặc ghi trực tiếp DB |
| B05 — Logout/login | PASS | Phiên mới đọc lại profile v3 và event hiện hành, Brain v6; hashes trước/sau phiên giống nhau |
| B06 — Sửa sau duyệt | PASS | Profile save trực tiếp do tác giả xác nhận; event sửa bằng correction pending→approve, giữ lịch sử |
| B07 — Không AI call mới | PASS | Smoke ledger/audit 6→6; dormant ledger 0→0; flags false |
| C01 — Draft visibility/separation | FAIL (restore); PASS (separation) | Draft cũ 428 ký tự vẫn completed/passed trong DB nhưng UI mở lại không hiển thị; manuscript 346 từ khớp nguyên bản, draft chưa tự chèn |
| C02 — Reject draft | NOT_RUN | NOT_RUN_UI_DRAFT_RECOVERY: không có nút reject cho draft cũ trong tab mở lại; không tạo/reinject job mới |
| C03 — Accept draft thứ hai | NOT_RUN | NOT_RUN_INSUFFICIENT_FIXTURES; chỉ một job cũ và không có UI phục hồi nó |
| C04 — No-provider boundary | PASS | Mở AI panel/reload/login không tạo job Writing mới hoặc Gemini dispatch; DB vẫn 1 job, lịch sử6 calls giữ nguyên |

## Canon trước/sau và audit

Các checkpoint SQL được ghi trước mỗi mutation quan trọng. Hash là MD5 của JSON rows đã sort để đối chiếu snapshot, không phải hash credential.

| Checkpoint | Brain | Entities | Event rows | Ý nghĩa |
|---|---:|---:|---:|---|
| before-actions / pending-before-reject | 1 | 0 | 0 | Candidate không thành Canon |
| after-reject-before-approve | 1 | 0 | 0 | Reject không đổi Canon |
| after-approve-before-profile | 2 | 1 | 0 | Chỉ Lâm Phong approved |
| after-appearance-before-personality | 3 | 1 | 0 | Profile v1 |
| after-personality-before-notes | 4 | 1 | 0 | Profile v2, appearance còn nguyên |
| after-notes-before-reload | 4 | 1 | 0 | Notes-only không tăng Brain; Profile v3 |
| event-pending-before-edit-approve | 4 | 1 | 0 | Event candidate không tự ghi |
| after-event-approved | 5 | 1 | 1 | Summary đã sửa được áp dụng |
| event-correction-pending | 5 | 1 | 1 | Summary/hash event giữ nguyên trong lúc pending |
| after-event-correction-before-session | 6 | 1 | 2 | Một bản cũ + một correction; UI chỉ 1 event hiện hành |
| after-relogin-before-draft-check | 6 | 1 | 2 | Hash entities/events/facts khớp trước đổi phiên |
| item-pending-before-approve | 6 | 1 | 2 | ITEM chưa Canon |
| final-canon | 7 | 2 | 2 | Lâm Phong PER + Huyết Ngọc Bội ITEM; 1 event hiện hành, 1 lịch sử |

Event gốc 37fae82f-b9e3-57b5-aca3-453372a59d89 vẫn còn; correction 9f0cdd85-b01f-4740-bbce-c6a74f8bc11f có event_metadata.supersedes_id trỏ đúng event gốc. UI hiển thị summary mới: “Lâm Phong quyết định giữ kín Huyết Ngọc Bội và trở lại nơi phát hiện vào sáng hôm sau.”

entity_profile_audits có ba records với actor QA, timestamp và before/after: Profile 0→1, 1→2, 2→3; Brain 2→3, 3→4, 4→4. Audit được xác minh read-only trong DB; không khẳng định UI có timeline lịch sử profile đầy đủ. Ghi chú thay đổi entity row hash vì row chứa private fields; không được diễn giải hash đổi này là Canon event bị thay đổi. Tất cả ghi chú nhập ở vòng này là dữ liệu giả lập, không phải thông tin riêng tư thật.

## AI draft: giới hạn thực nghiệm

Job duy nhất: d651e39b-f08c-564a-91ca-5c151c83646d, completed/passed, 428 ký tự, MD5 4dcf92571e2a20dfca3004a7b3f65052; nội dung giữ nguyên trong toàn bộ lượt. Không sửa, nhân bản hay chèn lại qua DB/API để làm test PASS.

Tab từ smoke vẫn có trong inventory nhưng công cụ không bind/đọc được tab cũ (`browser.user is unavailable`). Đã giữ tab cũ và mở tab QA mới làm fallback; không cố reload hoặc thao tác reject trên tab cũ. Tab mới, reload và phiên đăng nhập mới đều không khôi phục draft. Lịch sử bản thảo chỉ có snapshot manuscript 346 từ, không có Writing job để review. Không có action UI đã biết để mở job cũ theo job ID.

Vì vậy chưa thực hiện được luồng Reject hoặc Accept trong lượt 0-provider này. Source contract bổ trợ cho quan sát: AuthorWritingIde reset currentJob/aiSuggestion khi đổi chapter và lưu chúng trong state của component; không dùng source inspection thay cho test thực tế accept/reject. Không kết luận backend đã mất draft hoặc reject/accept làm sai Canon. Draft vẫn còn DB và evidence smoke vẫn nguyên.

## UX observations

- Candidate và Canon có lời giải thích rõ: đề xuất chưa duyệt không là sự thật; số pending, nhóm phụ thuộc và Brain version dễ đối chiếu.
- Approve/reject theo nhóm làm rõ phạm vi; khi sửa proposal có badge “ĐÃ CHỈNH SỬA BỞI TÁC GIẢ”, nút đổi thành duyệt nhóm đã sửa và có hoàn tác.
- Profile sau duyệt hỗ trợ ngoại hình/tính cách/ghi chú riêng; feedback “Đã lưu và đọc lại ... từ máy chủ” hữu ích. Không bắt tác giả tạo lại chương để sửa profile.
- Event Correction giải thích pending vs Canon, yêu cầu UUID mapping để tránh nhầm tên, giữ lịch sử. Workflow sửa đúng nhưng khá nhiều thuật ngữ kỹ thuật (UUID, Brain, Canon, Codex) và nhiều bước; nên chuẩn bị ví dụ demo đơn giản.
- Nguồn manual proposal bị gắn nhãn “Gốc từ AI” khi tác giả sửa; xem bug AA-02.
- Draft không được phục hồi khi mở lại là trở ngại lớn nhất với việc review mà không gọi lại AI.

## Bugs / gaps đã tái hiện

### AA-01 — Không có đường khôi phục Writing draft đã lưu sau mở lại

**Severity: MAJOR.** C01 acceptance/UX gap; không phải mất dữ liệu DB hay tự accept.

- Repro: dùng chương QA có completed/passed Writing job chưa accept → mở lại IDE ở tab mới hoặc reload → mở AI Hỗ trợ viết → kiểm tra Lịch sử bản thảo.
- Expected theo C01: tác giả đọc lại gợi ý đã tạo và tiếp tục accept/reject mà không gọi provider lần nữa.
- Actual: panel chỉ hiện trạng thái sẵn sàng; không có draft hay accept/reject. Lịch sử chỉ chứa manuscript snapshot. DB vẫn giữ job/draft.
- HTTP/trace: không có lỗi HTTP khi mở panel; job ID ở trên. Đây là thiếu đường review/recovery, không suy diễn từ lỗi endpoint.
- Evidence: draft-missing-after-relogin.png/.txt, revision-history-dom.txt, event-history-draft.txt, final-fixtures.txt và screenshot/DOM smoke trước đó.
- Minimal fix đề xuất: khôi phục hoặc cung cấp danh sách chọn Writing job hoàn tất chưa quyết định theo novel/chapter, rồi mở lại review; kiểm tra revision/Brain stale trước accept. Không cần đổi kiến trúc dữ liệu.

### AA-02 — Proposal thủ công bị gắn “Gốc từ AI”

**Severity: MINOR.**

- Repro: tạo event bằng form “Bổ sung hoặc thay thế dữ liệu trích xuất” với quote bản lưu → sửa summary ở card pending.
- Expected: nhãn phản ánh nội dung gốc do tác giả nhập, hoặc dùng từ trung tính “Nội dung gốc”.
- Actual: UI hiện “Gốc từ AI” dù event_metadata.source_type=author, chưa có Gemini call.
- HTTP/trace: không có HTTP error; proposal gốc 37fae82f-b9e3-57b5-aca3-453372a59d89.
- Evidence: event-pending-edited-dom.txt, event-before-approve.png và event-history-draft.txt.
- Minimal fix đề xuất: đổi nhãn theo provenance hoặc dùng “Nội dung trước chỉnh sửa”.

**BLOCKER thực tế: 0.** Thiếu fixture hoặc thao tác cần Gemini không được nâng thành bug kiến trúc. C02/C03 chưa chạy, không khẳng định chúng đúng hay sai.

## Evidence index

Thư mục `evidence/p1-author-acceptance-02/`:

- pending-lam-phong.png và pending-lam-phong-dom.txt; after-candidate-reject-dom.txt.
- Snapshot Canon .txt theo tên checkpoint trong bảng phía trên.
- profile-before-reload.png/.txt; profile-after-reload.png/.txt; profile-after-relogin.png/.txt; profile-audit.txt.
- event-before-approve.png; event-pending-edited-dom.txt; event-correction-pending-dom.txt; event-after-correction.png; event-corrected-dom.txt; event-after-relogin.png/.txt.
- item-after-approve.png và item-after-approve-dom.txt; proposal-decisions.txt.
- draft-missing-after-relogin.png/.txt; revision-history-dom.txt; manuscript-unchanged.json.
- event-history-draft.txt; final-fixtures.txt; final-provider-boundary.txt.

Các file DOM có hậu tố đầy đủ `-dom.txt`; screenshot cho UI viewport hiện tại, nội dung dưới scroll được bổ sung bằng DOM/database readback. Credential scan thực hiện trước bàn giao. Không có API key, password hoặc operator/worker token trong báo cáo/evidence.

## Kết luận và tối đa 3 ưu tiên trước demo

1. **Entity/event có sửa trước và sau duyệt không? YES trong phạm vi đã thử.** Candidate summary đã được chỉnh; trường canonical_name có UI editable nhưng chưa thử đổi tên. Canon profile sửa/lưu trực tiếp theo quyền tác giả, event qua correction→review→approve. Không cần tạo lại chương. Pipeline extraction từ Gemini và entity-occurrence checkpoint chưa chạy lại vì ngân sách 0.
2. **Canon/HITL đúng và bền sau reload không? YES cho manual proposals/profile/event correction.** Pending/reject không tự ghi, approve đúng phạm vi; profile và event còn sau reload/logout/login, audit/history có bằng chứng.
3. **Có accept/reject Writing draft không? CHƯA XÁC NHẬN trong lượt này.** Buttons đã từng xuất hiện ở smoke, nhưng draft cũ không được UI khôi phục; không tạo draft mới hoặc giả fixture để vượt giới hạn.
4. **Đủ thuận tiện để demo giảng viên không? PARTIAL.** Có thể demo rõ luồng manual candidate→approve/reject→profile/event correction→reload. Chưa nên tuyên bố vòng draft accept/reject đã nghiệm thu; cần giải quyết/kiểm chứng AA-01 trước demo vòng đời trọn vẹn.

Ưu tiên sửa/kiểm chứng trước 09/11/2026: **(1) AA-01 khôi phục draft để review không gọi lại AI; (2) AA-02 sửa nhãn nguồn đề xuất.** Không mở hạng mục redesign hoặc giao việc cho agent khác.

# P1 demo presenter runbook V2 — sau PR #79

Source đã kiểm thử: `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`. Demo 09/11/2026. [Acceptance và evidence](P1_DEMO_POSTMERGE_79_ACCEPTANCE.md).

## Chuẩn bị trước khi lên màn hình

Người vận hành cấp URL frontend production build đang chạy cùng Gateway/DB demo và tài khoản Author qua kênh riêng. Stack QA hiện đã dừng; URL trong log test không phải dịch vụ luôn sẵn sàng. Không chiếu credentials hoặc dùng dữ liệu thật.

Cấu hình bắt buộc cho script này: **ENTITY_CANDIDATE_VERIFICATION_ENABLED=true**, fake provider local, không fallback/cloud. Default false có luồng bootstrap khác và chưa tổng duyệt trong task này. Không tự đổi cờ để đi tiếp.

Dùng novel hư cấu mới cho buổi trình bày; không chiếu private notes/credentials của fixture QA. Dành khoảng 10–15 phút hoặc hơn cho phần duyệt; đây là dự trù, không phải số đo của người dùng mới.

Nhãn evidence: **UI hiện tại** = thao tác browser đã chạy trên source khóa; **API/DB** = kiểm chứng kỹ thuật; **cần tập thủ công** = chưa lặp lại thao tác đó bằng người trình bày trong task này. Đăng ký/tạo novel/chapter trong các smoke hiện tại dùng API fixture; UI tạo tác phẩm đã có evidence ở rehearsal trước, không được biến thành claim đã lặp lại mọi bước trên source mới.

## Đoạn truyện và hồ sơ demo

Chương 1 — Cổng đá:

> Lâm Phong gặp Diệp Linh Nhi tại Cồn Vân. Cồn Vân có cổng đá.

Ba identity dự kiến: Lâm Phong = PER (nhân vật), Diệp Linh Nhi = PER, Cồn Vân = LOC (địa danh). Hai lần Cồn Vân trong đoạn này cùng chỉ một nơi; phải đọc ngữ cảnh trước khi bulk.

Hồ sơ Lâm Phong có thể dùng:

- Ngoại hình: Vết sẹo mảnh cắt ngang lông mày trái, ánh mắt sắc như chim ưng.
- Tính cách: Trầm tĩnh, cẩn trọng và không dễ tin người.
- Xuất thân: Đệ tử trẻ lớn lên gần Cồn Vân.
- Hiệu lực: chương 1.

Không cần nhập một life-status quote cho địa danh. Chỉ điền bằng chứng khi có trích dẫn phù hợp, nguyên văn; giữ trạng thái Unknown nếu không có bằng chứng. Không chép quote của occurrence này sang occurrence khác chỉ vì trùng tên.

## Các bước trình bày

| Bước / người trình bày bấm gì | Kết quả cần thấy | Tương tác | Nếu không đúng | Evidence |
|---|---|---|---|---|
| 1. Mở URL, Login bằng Author được cấp. | Đến ứng dụng đúng tài khoản. | 1 form | Kiểm tra URL/tài khoản với vận hành; không dùng credentials trên màn chiếu. | UI hiện tại |
| 2. Từ Tủ truyện/tác phẩm, tạo hoặc mở novel demo; thêm chương 1, nhập đoạn trên. | Nội dung có trong editor và “Đã lưu”. | 1–2 forms | Đợi autosave; không reload khi đang lưu. Sidebar tên cũ thì reload sau saved. | Tạo novel/chapter: API/DB hiện tại; UI cần tập thủ công |
| 3. Story Brain → Trích xuất → “Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu”. | Checkpoint danh tính xuất hiện. | 3–4 bấm + chờ | Nếu job lỗi, giữ bản thảo và dừng để vận hành kiểm tra fake service. | UI hiện tại |
| 4. Mở Chờ duyệt; đọc phần “Duyệt danh tính — trước bước duyệt đề xuất Canon”. | Thấy số occurrence chưa quyết định. Badge Canon có thể vẫn là 0. | 1–2 bấm | Đừng suy ra không có việc cần làm từ badge 0; xem checkpoint bên trong. | UI hiện tại |
| 5. Thêm khóa nhóm lam-phong, diep-linh-nhi, con-van. | Ba khóa kỹ thuật, tên truyện vẫn tiếng Việt. | 3 lần nhập + thêm | Chỉ A–Z/a–z/0–9/gạch ngang/gạch dưới, 1–64 ký tự. Không nhập tên có dấu vào ô khóa. | UI hiện tại |
| 6. Gán full-name Lâm Phong và Diệp Linh Nhi vào đúng nhóm. | Hai quyết định PER, không chỉ là gợi ý máy. | 2 dropdowns | Chọn đúng occurrence; không gán các mảnh tên/đại từ theo thói quen. | UI hiện tại |
| 7. Gán Cồn Vân vào con-van; kiểm tra LOC. Nếu cần, “Sửa thuộc tính” → “Loại thực thể” → LOC. | LOC xuất hiện trong quyết định/summary. | 1–3 bấm | Sửa trước Freeze. Gợi ý máy chưa phải Canon. | UI hiện tại + PG |
| 8. Nếu chỉnh tên/type/quotes, đọc thông báo draft. | Edit nằm trong nháp checkpoint ngay. | Theo số trường | Không tìm nút commit thuộc tính cũ: dùng “Lưu quyết định một phần” hoặc Freeze để lưu server. | UI hiện tại |
| 9. Ở Cồn Vân, bấm “Áp dụng quyết định này cho các vị trí phù hợp…”. | Hiện xác nhận, count và offsets; fixture này có 2 occurrences phù hợp. | 1 bấm để xem | Đọc cả hai ngữ cảnh. Trùng mặt chữ không đủ để coi là cùng identity. | UI hiện tại |
| 10. Bấm Hủy nếu chưa chắc; hoặc “Xác nhận gán toàn bộ” khi đúng. | Cancel giữ nguyên; confirm chỉ áp dụng target phù hợp. Quotes riêng vẫn thuộc occurrence riêng. | 1 bấm | UUID/nhóm khác hoặc quyết định loại đã rõ được bảo vệ; muốn đổi phải sửa riêng. | UI + request/PG hashes |
| 11. “Lưu quyết định một phần”, đợi hoàn tất, reload rồi mở lại checkpoint. | Nhóm, LOC và quotes đã lưu vẫn còn. | 2–4 bấm | F5 không phải lưu draft. Nếu 409, giữ lựa chọn, đọc server update rồi lưu lại có chủ đích; không spam save. | UI hiện tại + PG |
| 12. Xem mọi trang, loại các span thừa. | Với fake fixture này: 15/15 quyết định, 3 identity, 11 vị trí loại. | Cao: 3 trang, nhiều bấm | Không Freeze khi còn unresolved hoặc một nhóm có type/status không nhất quán. | UI hiện tại |
| 13. Đọc “Tóm tắt quyết định trước Freeze”; kiểm tra Lâm Phong PER, Diệp Linh Nhi PER, Cồn Vân LOC. Bấm Freeze. | UUID được bảo lưu; chưa tự approve Canon. | 1 kiểm tra + 1 bấm | Nếu sai trước Freeze, sửa nháp. Nếu đã Freeze sai, dừng để review; không sửa DB đi tắt. | UI + Gateway + PG |
| 14. “3. Tiếp tục trích xuất event/fact”; xem nhóm proposals rồi duyệt nguyên tử nhóm phù hợp. | 3 entity + 1 event ở fake fixture; Canon được ghi sau approval riêng. | 2–4 bấm + đọc | Không duyệt mù. Nếu nội dung sai hoặc cần sửa source mới đi tiếp, dừng demo. | UI hiện tại + provenance |
| 15. “Kích hoạt bộ nhớ sau duyệt”, reload. | Brain active, thực thể đã xác nhận còn đúng. | 1–2 bấm | Job phải được khởi tạo từ UI của phiên/tác phẩm này; không inject job ID/localStorage. | UI hiện tại |
| 16. Story Brain → Hồ sơ Codex → chọn Lâm Phong theo UUID; sửa ngoại hình/tính cách, cutoff 1; Lưu thay đổi. | Lưu thành công, đọc lại server; version cập nhật. | 1 form | Đúng UUID, đúng novel. Khi 409, giữ nháp và đối chiếu bản mới trước khi lưu tiếp. | UI hiện tại + audit/PG |
| 17. Reload, mở lại hồ sơ. Thêm một ghi chú riêng hư cấu nếu cần minh họa, lưu. | Canon fields và note lưu bền; note-only không tạo event/fact hay đổi Brain. | 2–4 bấm | Không chiếu note riêng, không paste note vào yêu cầu AI. | UI/API/DB hiện tại |
| 18. Mở chương tiếp theo có nội dung đã lưu; AI Hỗ trợ viết → Story Bible (Nhân vật & Sự kiện). Nhập yêu cầu dưới đây và bấm nút gửi. | Có writing job và bản thảo fake; profile được context chọn khi liên quan. | 3–5 bấm + chờ | Không cần bấm Context Preview riêng. Giữ bản thảo nếu lỗi; vận hành kiểm tra fake service. | UI hiện tại trên chương 4; chapter mới tạo là phần cần tập |
| 19. Đọc kết quả; với output fake tên mẫu không đúng, “Từ chối / Bỏ qua”. | Không chèn đoạn sai, Brain không đổi. | 1 bấm | Không accept chỉ để kết thúc demo. Badge kiểm định không phải chứng nhận chất lượng prose fake. | UI hiện tại + job/hash |
| 20. Kết thúc ở bản thảo/hồ sơ đã lưu; đăng xuất trên máy dùng chung. | Không để note/credentials trên màn hình. | 1–3 bấm | Quay về dashboard của mình, không mở URL tác giả khác. | Login/auth có evidence; logout cuối buổi cần tập |

Yêu cầu viết tự nhiên đã dùng qua UI trên source này:

> Viết tiếp cảnh Lâm Phong bước đi trong sương sớm, giữ tính cách đã xác nhận trong hồ sơ.

Không cần dùng correlation token của test. Người vận hành có proof job/context hash trong acceptance; không chiếu raw prompt, audit snapshots hoặc trace chứa private input.

## Thông điệp cần nói rõ

- Khóa nhóm là kỹ thuật; tên hiển thị và UUID là hai thứ khác nhau. Gợi ý máy không phải quyết định tác giả.
- Bulk không tự kết luận homonym cùng identity. Xem count/offsets và ngữ cảnh; quyết định khác UUID/nhóm được giữ.
- Source decision và evidence riêng của mỗi occurrence được bảo toàn. Source quote không tự lan sang occurrence khác.
- Profile là tri thức nền tác giả xác nhận. Thay đổi trong diễn biến dùng event/state correction hiện có, không sửa profile để giả lập lịch sử.
- Cutoff áp dụng cả snapshot, không tái dựng từng trường ở quá khứ. Ghi chú riêng không vào approved memory/prompt.
- Fake provider chứng minh luồng, context và persistence; không đánh giá live AI. Không bật cloud hoặc trả phí trong buổi này.

## Presenter phải tập thêm trước 09/11

1. UI tạo novel/chapter hoặc đường mở novel demo mới do vận hành chuẩn bị; các smoke hiện tại dùng API fixtures cho setup.
2. Thực hành trọn đường từ login đến generation trong cùng một novel demo; QA kỹ thuật dùng hai novel fixtures để tách checkpoint và Codex.
3. Xử lý 409 bằng người thật ở hai cửa sổ, thay vì chỉ dựa automated sessions.
4. Cách dừng khi chọn sai identity/type sau Freeze; không hứa undo/type correction chưa được tổng duyệt.
5. Logout cuối buổi và cách mở lại URL demo sau khi vận hành khởi động stack.

Không cần trình diễn in-flight cancel, chèn/accept output fake, publish/schedule, homonym creation API, mobile, hoặc flag=false. Các mục này không được chứng nhận trong acceptance này. Nếu migration/privacy/persistence lỗi hoặc phải sửa app để đi tiếp, dừng và báo review; không tự sửa DB hay deploy.

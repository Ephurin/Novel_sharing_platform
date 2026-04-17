# Tong ket Tuan 2 - Nghiep vu he thong va API nang cao

Tai lieu nay dung cho Ngay 7:
- Tong hop va ghi chep bao cao
- On tap kien thuc Tuan 2 de demo va bao ve

## 1) Muc tieu Tuan 2

- Hoan thien workflow xuat ban noi dung
- Xay dung co che duyet noi dung cho Editor
- Bo sung tuong tac nguoi dung: comment, rating, like
- Nang cap API cho web va mobile: pagination, search, filter, ordering
- Upload va quan ly anh bia truyen

## 2) Tong ket nghiep vu da trien khai

### 2.1 Workflow xuat ban (dang ap dung tren Chapter)

Trang thai Chapter:
- draft
- pending
- approved
- rejected
- published

Luong chinh:
1. Author tao chapter, he thong set mac dinh draft
2. Author submit chapter: draft -> pending
3. Editor approve: pending -> approved
4. Editor publish: approved -> published
5. Editor reject: pending -> rejected (bat buoc co review_note)

Ghi chu quan trong cho bao cao:
- Roadmap ghi trang thai tren Story, nhung implementation hien tai dat workflow tren Chapter de chi tiet va linh hoat hon.
- Story duoc xem la public khi co it nhat 1 chapter da approved/published.

### 2.2 Phan quyen role

Role he thong:
- reader: doc noi dung da duyet
- author: quan ly noi dung cua chinh minh
- editor: duyet va quan tri noi dung

Permission chinh:
- StoryPermission
  - SAFE methods: user dang nhap deu duoc doc
  - WRITE methods: author/editor
  - author chi sua story cua minh, editor sua moi story
- ChapterPermission
  - reader chi thay approved/published
  - author thay chapter cua minh + chapter da duyet
  - editor thay toan bo
- CommentPermission
  - user dang nhap duoc thao tac
  - sua/xoa comment cua minh
  - editor co quyen can thiep

### 2.3 Co che tuong tac nguoi dung

Comment:
- Comment vao story hoac chapter (chi duoc chon 1)
- Ho tro nested reply thong qua parent

Rating:
- User rate story 1 den 5
- Moi user chi co 1 rating tren 1 story (update_or_create)
- Co thong ke average_rating va ratings_count

Like:
- Moi user chi duoc like 1 lan tren 1 story
- Ho tro toggle like/unlike
- Co thong ke likes_count

## 3) Danh sach API chinh de dua vao bao cao

## 3.1 Auth

- POST /api/token/
- POST /api/token/refresh/

## 3.2 Story

CRUD:
- GET /api/stories/
- GET /api/stories/{id}/
- POST /api/stories/
- PATCH /api/stories/{id}/
- DELETE /api/stories/{id}/

Action:
- POST /api/stories/{id}/rate/
- DELETE /api/stories/{id}/rate/
- POST /api/stories/{id}/like/
- DELETE /api/stories/{id}/like/
- POST /api/stories/{id}/upload_cover/

List query params (Ngay 5):
- search: tim theo title
- genre: loc theo the loai
- status hoac chapter_status: loc theo trang thai chapter
- min_rating, max_rating: loc theo diem trung binh
- ordering: newest | oldest | most_viewed | top_rated
- page: phan trang

## 3.3 Chapter

CRUD:
- GET /api/chapters/
- GET /api/chapters/{id}/
- POST /api/chapters/
- PATCH /api/chapters/{id}/
- DELETE /api/chapters/{id}/

Action workflow:
- POST /api/chapters/{id}/submit_for_review/
- POST /api/chapters/{id}/approve/
- POST /api/chapters/{id}/reject/
- POST /api/chapters/{id}/publish/

## 3.4 Comment

- GET /api/comments/
- POST /api/comments/
- PATCH /api/comments/{id}/
- DELETE /api/comments/{id}/

Filter:
- story
- chapter
- parent

## 4) Upload anh bia truyen (Ngay 6)

Thanh phan chinh:
- Story.cover_image su dung ImageField
- MEDIA_URL = /media/
- MEDIA_ROOT = BASE_DIR / media
- Development URL map media khi DEBUG=True

Rule validate:
- Field bat buoc: cover_image
- Dinh dang hop le: jpg, jpeg, png, webp
- Content-Type phai la image/*
- Kich thuoc toi da 5MB

Duong dan luu file local:
- media/stories/covers/<ten_file>

## 5) Ket qua dau ra Tuan 2

- Co workflow duyet noi dung ro rang Author -> Editor
- Co role-based permission cho tung loai tai nguyen
- Co he thong comment, rating, like
- API list da ho tro pagination, search, filter, ordering
- Da upload anh bia va tra URL cho frontend
- API san sang cho web va mobile tich hop

## 6) On tap kien thuc Tuan 2

## 6.1 Khai niem can nho

- Serializer:
  - Chuyen doi du lieu Model <-> JSON
  - Validate du lieu dau vao
- ViewSet:
  - Gom CRUD vao 1 class
  - Co the mo rong bang @action cho endpoint nghiep vu
- Permission:
  - Kiem soat ai duoc xem/sua/xoa
- Selector/Queryset theo role:
  - Loc du lieu theo quyen truy cap
- Service layer:
  - Tach nghiep vu workflow ra khoi view
- Pagination:
  - Giam tai response, toi uu list cho mobile
- Annotate Avg:
  - Tinh diem trung binh rating trong query

## 6.2 Cau hoi tu kiem tra nhanh

1. Tai sao workflow dat o Chapter lai hop ly hon dat tren Story?
2. Khac nhau giua has_permission va has_object_permission?
3. Vi sao rating/like can unique constraint (user, story)?
4. Khi nao nen dung @action thay vi tao view rieng?
5. Tai sao can validate ca extension va content_type khi upload file?
6. Vi sao list API can pagination truoc khi tich hop mobile?
7. Neu query list cham, ban toi uu tu dau (select_related, prefetch_related, annotate)?

## 6.3 Flow demo 7-10 phut de bao ve

1. Dang nhap author, tao story + chapter (chapter o draft)
2. Submit chapter cho review (draft -> pending)
3. Dang nhap editor, approve hoac reject chapter
4. Publish chapter de reader thay duoc noi dung
5. Dang nhap reader, doc story/chapter da duyet
6. Reader comment, rate, like
7. Goi list stories voi search/filter/ordering/pagination
8. Upload anh bia cho story va hien thi URL image

## 6.4 Loi thuong gap va cach xu ly

- 403 Forbidden:
  - Kiem tra role cua user va permission endpoint
- 400 khi reject chapter:
  - Thieu review_note
- Upload that bai:
  - Sai key form-data, sai content-type, file qua 5MB, sai extension
- Story khong hien voi reader:
  - Chua co chapter approved/published

## 7) Ke hoach nang cap sau Tuan 2

- Bo sung test tu dong cho workflow, rating/like, upload
- Toi uu N+1 query cho story list co thong ke
- Bo sung logging va audit trail cho tac vu editor
- Chuan bi API contract cho frontend web/mobile

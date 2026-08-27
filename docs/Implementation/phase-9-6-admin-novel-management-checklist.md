# Phase 9.6 - Admin Novel Management Checklist

Phase 9.6 implements Admin management of platform novel records, including reversible soft removal and Author notification.

Related documents:

- `docs/SRS/admin-novel-management-service.md`
- `docs/API/admin-api.md`
- `docs/Frontend/routes-and-guards.md`
- `docs/Database/postgresql-schema.md`
- `docs/Database/mongodb-collections.md`

## 1. Scope

- Add Admin novel list/detail APIs.
- Add Admin soft-delete novel API.
- Add optional Admin restore novel API.
- Mark related PostgreSQL rows as deleted through transaction.
- Mark related MongoDB `draft_chapters` as deleted/archived.
- Send in-app notification to the owning Author.
- Add Admin UI pages reachable from the left sidebar.

## 2. Backend

- [x] Add `GET /api/v1/admin/novels`.
- [x] Add `GET /api/v1/admin/novels/:novelId`.
- [x] Add `DELETE /api/v1/admin/novels/:novelId`.
- [x] Add `POST /api/v1/admin/novels/:novelId/restore`.
- [x] Validate `confirm === true` for removal requests.
- [x] Require `ADMIN` role for all endpoints.
- [x] Load novel owner before removal so notification can be created after removal.
- [x] Wrap PostgreSQL soft delete/restore in a transaction.
- [x] Set `novels.deleted_at` on removal and clear it on restore.
- [x] Set related `chapters.deleted_at` on removal and clear it on restore when appropriate.
- [x] Mark MongoDB `draft_chapters` by `novelId` or chapter IDs as deleted/archived; do not physically delete drafts.
- [x] Create notification with type `NOVEL_REMOVED_BY_ADMIN`.
- [x] Optionally create notification with type `NOVEL_RESTORED_BY_ADMIN`.
- [x] Return `CONTENT_001` when target novel is missing.

## 3. Frontend

- [x] Add left sidebar item `Novels` for Admin.
- [x] Add `/admin/novels` list page.
- [x] Add `/admin/novels/:novelId` detail page.
- [x] Show title, author, status, chapter count, updated time, and removed state.
- [x] Add `Remove Novel` high-impact action.
- [x] Add `Restore Novel` action for soft-deleted records.
- [x] Show confirmation modal explaining that novel, chapters, and drafts will be hidden but preserved for restore.
- [x] Require Admin confirmation before calling removal API.
- [x] Redirect back to list after successful removal.

## 4. Review

- [ ] Admin can list novels.
- [ ] Admin can open novel detail.
- [ ] Admin can cancel removal confirmation without data changes.
- [ ] Admin can confirm removal and novel disappears from public/reader/author default list/search.
- [ ] Related chapters remain in PostgreSQL but have `deleted_at` set.
- [ ] Related drafts remain in MongoDB but are marked deleted/archived.
- [ ] Author receives notification: `Truyện đã bị gỡ bởi Admin`.
- [ ] Admin can restore the novel and clear deleted markers when needed.
- [ ] Reader public/search pages no longer show removed novel.
- [ ] Non-admin receives `AUTH_008` or route permission state.

## 5. Notes

- This is a soft-delete operational use case to support future restore.
- If audit is needed later, add a separate immutable admin audit log before implementation.
- This use case is not the same as moderation rejection/revision; those keep content records for author correction.

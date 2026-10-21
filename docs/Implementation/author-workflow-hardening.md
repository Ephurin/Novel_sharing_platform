# Author workflow hardening

Branch: `feat/author-workflow-hardening`, based on `UI` at `9806df6`.
The preceding author workspace changes are in PR #53. This branch adds the workflows below without changing the framework or installing dependencies.

## Implemented behavior

| Area | Behavior |
| --- | --- |
| Draft and VIP privacy | Public novel routes hide unpublished novels. Public chapter lists return published metadata with no prose. Draft reads and revision reads require an active owner/admin. Public prose uses the reading endpoint and checks paid access. Owners/admins can preview their published VIP chapters without paying or increasing views. |
| Autosave | Captured payloads save in sequence, with MongoDB version preconditions and PostgreSQL chapter locks. Stale writes return `409 DRAFT_CONFLICT`; prose writes without a version return `428 DRAFT_VERSION_REQUIRED`. Empty drafts can be saved but cannot be published. |
| Recovery | Per-account/per-chapter local backups, explicit recovery after reload, retry on errors, conflict feedback, before-unload protection and a route-change dialog. Leaving without saving retains the local backup. Export downloads the current manuscript as Markdown. |
| Revision history | Studio and Novel Manager expose existing revision APIs. Authors can save checkpoints, compare complete versions side by side and restore into the draft. Restoration checkpoints the outgoing content first. Publishing from Studio also creates a checkpoint. Snapshot creation no longer overwrites the active Mongo draft. |
| Chapter management | Archive, restore archived chapters to draft, soft delete archived chapters, reorder chapters, change access/price and submit saved drafts for publication. Chapters already unlocked by readers cannot be archived/deleted. Reordering validates the complete current list; numbering is serialized with chapter creation. |
| Author onboarding | An active reader opts in from My Profile. `POST /auth/become-author` promotes only READER to AUTHOR and issues a fresh session. Existing reader features remain available; the client cannot choose an administrative role. |
| Notifications | Approved comments notify authors; author replies notify the relevant reader. Publication moderation outcomes notify authors. Pending flags are stored with source records and delivered every five seconds using idempotent notification IDs. Retry preserves read status. The inbox supports filters, pagination and contextual links. The demo push-token registration form is removed. |
| Media | Authenticated image uploads check size/type signatures for PNG/JPEG/WebP (1 MB maximum). Cover/avatar controls use stored image URLs. Docker's `media_data` volume persists uploads across container replacement. Existing external image URLs remain supported. |
| Manuscript import | Stable request keys prevent duplicate chapters when retrying the same batch. Reusing a key for different content returns a conflict. Story Brain bootstrap receives actual revision IDs and content hashes instead of fabricated placeholders. |
| Reading format | Existing editor bold, italic, underline and strike markers render as React elements. Unknown HTML is escaped rather than inserted as executable markup. Light/Dark themes and reading typography are preserved. |

## Database and API changes

Apply migration `015_author_workflow.sql` before starting the new backend. It adds import identity fields/indexes and a moderation notification delivery flag. Existing rows are preserved; historical notifications are not backfilled.

Additional owner routes:

- `POST /chapters/:chapterId/archive`
- `POST /chapters/:chapterId/restore`
- `DELETE /chapters/:chapterId` (archived chapters only; soft deletion)
- `PUT /novels/:novelId/chapter-order` with the complete `chapterIds` list

Other additions:

- `POST /auth/become-author`
- `POST /media` with base64 image `data`; returns a stored image path
- `GET /media/:fileName` for public cover/avatar assets

All paths above are relative to `/api/v1`. Existing draft PATCH clients must pass the version from the latest draft response when modifying title/content. Trusted internal draft reconciliation remains available for the existing AI acceptance/outbox flow.

## Verification

- Backend TypeScript check and Docker production build passed.
- 51 backend tests passed, including PostgreSQL/MongoDB integration tests in isolated schemas/databases.
- Frontend TypeScript check, 12 existing frontend tests and production build passed.
- Chrome checks passed for chapter navigation with unsaved changes, offline recovery, version conflicts, checkpoint creation/comparison/restoration, blank draft creation, VIP pricing, authenticated image upload and public retrieval, safe text formatting, and reader-to-author session transition.
- Desktop Dark Mode, mobile Light Mode and horizontal overflow were checked for the new author controls. No uncaught browser exceptions occurred in those checks.
- Migration applied to the running database; backend/web containers rebuilt and recreated with demo seeding disabled.

## Boundaries

Revision history consists of explicit checkpoints and Studio publication checkpoints; every autosave is not retained as a permanent revision. Archive restoration returns a chapter to draft and requires another publication action. Soft-deleted chapters do not have a user-facing trash restoration flow.

Notifications are a persisted in-app inbox, not a Web Push integration. Uploads use the local Docker volume rather than external object storage. Import deduplication covers retries of the same selected batch. The manuscript renderer supports the existing editor markers rather than arbitrary Markdown/HTML.

PostgreSQL and MongoDB remain separate stores. Version checks and local recovery protect editing, but do not provide a distributed transaction across both stores. The live AI provider and external financial operations were not part of this verification; Wallet remains demo-only.

## Author launch checklist follow-up

Scheduled chapter publication, author banner/publishing schedule and review/follow/income notifications are now implemented. See [the launch checklist](author-launch-checklist.md) for behavior, migration 016 and verification.

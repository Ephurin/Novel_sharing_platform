# Phase 8.7 - Admin and Moderation Deepening Checklist

Goal: make moderation/report evidence inspectable from UI.

## Checklist

- [x] Add `/admin/moderation` route.
- [x] Add `/admin/moderation/:reviewId` detail route.
- [x] Add `/admin/reports` route or tab.
- [x] Show moderation target metadata.
- [x] Show content rule violation keywords/categories where available.
- [x] Show Mongo moderation evidence where available.
- [x] Link report targets to reader/admin context screens.
- [x] Keep approve/reject actions behind confirmation.
- [x] Ensure non-admin route access does not render admin data.
- [x] Run `npm.cmd --prefix web run typecheck`.
- [x] Run `npm.cmd --prefix web run build`.

Note: backend currently exposes user reports through moderation reviews with `source=USER_REPORT`, not a standalone `GET /reports` endpoint. The `/admin/reports` UI therefore filters the moderation queue by `USER_REPORT`.

Note: Mongo `moderation_evidence` is displayed through the safe `evidenceSummary` returned by backend, not by exposing raw Mongo documents to the browser.

## Review

1. Login as Admin.
2. Open moderation queue.
3. Open a moderation detail item.
4. Confirm evidence/reason/target IDs are visible.
5. Resolve the item and confirm status updates.
6. Open reports and inspect target navigation.
7. Login as non-admin and confirm admin routes are blocked.

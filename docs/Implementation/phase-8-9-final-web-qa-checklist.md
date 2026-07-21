# Phase 8.9 - Final Web QA Checklist

Goal: approve the official web UI before Phase 9 Mobile.

## Checklist

- [x] Review all routes from `docs/Frontend/sitemap.md`.
- [x] Review implemented APIs against `docs/Frontend/api-screen-matrix.md`.
- [x] Confirm every non-deferred database table/collection has either UI visibility or a documented reason.
- [x] Clean placeholder copy that is no longer accurate.
- [x] Confirm disabled AI actions do not call backend.
- [x] Check responsive layout on laptop and narrow desktop widths.
- [x] Check loading, empty, error, and permission states.
- [x] Run `npm.cmd --prefix backend run typecheck`.
- [x] Run `npm.cmd --prefix web run typecheck`.
- [x] Run `npm.cmd --prefix web run build`.

QA summary and known limitations are documented in `docs/Implementation/phase-8-final-web-qa-report.md`.

Note: final build passes with existing third-party `"use client"` and bundle-size warnings; these are not blocking Phase 8.9.

## Review

1. Run through Reader demo flow.
2. Run through Author demo flow.
3. Run through Wallet demo flow.
4. Run through Notification/Profile demo flow.
5. Run through Admin demo flow.
6. Document known limitations before starting Phase 9.

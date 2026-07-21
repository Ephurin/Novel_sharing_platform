# Phase 8.6 - Reader Experience Deepening Checklist

Goal: close Reader-side API/database visibility gaps.

## Checklist

- [x] Add reading preferences panel.
- [x] Load preferences from `GET /reading/preferences/me`.
- [x] Save preferences through `PUT /reading/preferences/me`.
- [x] Apply font size, font family, background, and line height to chapter reader.
- [x] Auto-sync reading history when opening/changing chapter.
- [x] Use `GET /reading/history/me/{novelId}` for continue-reading on novel detail.
- [x] Add genre/tag/status/sort filters to Reader Home.
- [x] Add comment edit UI through `PATCH /comments/{commentId}`.
- [x] Improve already-liked/already-followed handling.
- [x] Run `npm.cmd --prefix web run typecheck`.
- [x] Run `npm.cmd --prefix web run build`.

Note: `npm.cmd --prefix web run build` passes with existing Vite warnings from third-party `"use client"` directives and bundle-size warning; no blocking build error.

## Review

1. Login as Reader.
2. Change reading preferences and confirm chapter display changes.
3. Open a chapter, then check `/reader/history` without manually syncing.
4. Filter Reader Home by genre/tag.
5. Create, edit, and delete a comment.
6. Re-click like/follow actions and confirm UI handles conflicts gracefully.

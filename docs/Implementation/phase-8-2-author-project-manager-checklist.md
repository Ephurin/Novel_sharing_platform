# Phase 8.2 - Author Project Manager Checklist

Goal: make the web author entry point behave like a project manager before opening the Author IDE.

## 1. Backend API

- [x] Add `GET /api/v1/novels/me` for current author's novels.
- [x] Support `q`, `status`, `page`, and `limit` query parameters.
- [x] Protect endpoint with Author/Admin role guard.
- [x] Keep endpoint separate from public reader/search APIs.

## 2. Frontend Routing

- [x] Redirect `AUTHOR` users to `/author` after login/session restore.
- [x] Keep `/author/ide` protected for Author/Admin.
- [x] Allow Author/Admin users to navigate to Reader screens without logout.
- [x] Keep AI/Copilot entry points disabled until Phase 10.

## 3. Author Project Manager UI

- [x] Add project dashboard at `/author`.
- [x] List current author's novels as writing projects.
- [x] Add search and status filters.
- [x] Add `New Project` action that creates a novel and starter chapter.
- [x] Add `Open in IDE` action that stores selected project context.
- [x] Show loading, empty, and error states.

## 4. Review Guide

1. Start backend and web.
2. Login as `reader03` or another `AUTHOR` account.
3. Confirm successful login redirects to `/author`, not `/author/ide`.
4. Confirm the left navigation includes both `Writing Projects` and `Reader`.
5. Click `Switch to Reader` and confirm the author can read without changing account.
6. Return to `Writing Projects` and confirm the project list loads from `GET /api/v1/novels/me`.
7. Click `New Project` and confirm it creates a novel plus `Chapter 1`, then opens `/author/ide`.
8. Return to `/author`, click `Open in IDE` on an existing project, and confirm the IDE opens with that project context.
9. Login as a `READER` account and confirm `/author` shows a permission screen.

## 5. Notes

- The `Metadata` action is intentionally disabled until the dedicated metadata editor screen is implemented.
- Author Project Manager is official frontend scope; Author IDE internals still need a later polish pass for full chapter/context workflows.

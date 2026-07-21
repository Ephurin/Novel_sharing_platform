# Phase 8.5 - Author Workspace Deepening Checklist

Goal: close Author-side sitemap gaps before final web QA.

## Checklist

- [x] Add active `Metadata` action from project cards.
- [x] Add `/author/novels/:novelId` metadata editor route.
- [x] Add `/author/novels/:novelId/chapters/:chapterId` deep link into IDE.
- [x] Show chapter status distribution for each project.
- [x] Support chapter title editing in IDE.
- [x] Remove normal-flow dependency on manual Novel ID/Chapter ID inputs.
- [x] Add visible context placeholders for characters, relationships, timeline, and summaries.
- [x] Mark AI/context persistence as deferred where backend is not ready.
- [x] Run `npm.cmd --prefix web run typecheck`.
- [x] Run `npm.cmd --prefix web run build`.

Note: manual Novel ID/Chapter ID inputs remain in the IDE as an advanced/debug fallback, but the normal Author flow now uses project cards, metadata pages, and route params.

## Review

1. Login as Author.
2. Open `/author`.
3. Open metadata for an existing project.
4. Edit metadata and confirm project card updates.
5. Open a chapter deep link and refresh the IDE tab.
6. Confirm chapter context remains stable through URL params.
7. Inspect context placeholder panels and confirm they do not fake AI persistence.

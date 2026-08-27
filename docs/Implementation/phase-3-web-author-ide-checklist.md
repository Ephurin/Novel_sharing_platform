# Phase 3 Web Author IDE Checklist

Use this checklist after Phase 2 is approved.

Phase 3 connects the existing desktop Author IDE shell to the backend APIs implemented in Phase 2. AI Copilot remains a placeholder until Phase 7.

## 1. Implemented Scope

- [x] Keep React + Vite + TypeScript web app.
- [x] Keep Mantine dark IDE layout.
- [x] Add API envelope typing.
- [x] Add Axios access-token interceptor.
- [x] Add login/register UI.
- [x] Store access token in local storage for MVP development.
- [x] Add Auth API client.
- [x] Add Novel/Chapter API client.
- [x] Allow Author to paste/load `novelId`.
- [x] Allow Author to paste/load `chapterId`.
- [x] Allow creating starter novel from Author IDE.
- [x] Allow creating starter chapter from Author IDE.
- [x] Load chapter draft content into editor.
- [x] Save draft through `PATCH /chapters/{chapterId}`.
- [x] Submit novel through `POST /novels/{novelId}/submit-publish`.
- [x] Submit chapter through `POST /chapters/{chapterId}/submit-publish`.
- [x] Keep AI assistant disabled as Phase 7 placeholder.

## 2. Validation

- [x] `npm.cmd --prefix web run typecheck` passes.
- [x] `npm.cmd run build` from `web/` passes.
- [x] Production build outputs `web/dist`.

Build note:

- `web/vite.config.ts` was removed because Vite/esbuild could not load config files reliably under the current OneDrive/sandbox path.
- Vite defaults are enough for the MVP web build.
- Vite build warnings about `"use client"` directives from dependencies are non-blocking.

## 3. Manual Review Guide

Before starting review:

```txt
npm.cmd --prefix backend run dev
npm.cmd --prefix web run dev
```

Open:

```txt
http://localhost:5173
```

Review steps:

- [x] Register or login with an Author-capable account.
- [x] If the account is still `READER`, update role to `AUTHOR` in PostgreSQL and login again.
- [x] Click `New Novel`.
- [x] Confirm a `novelId` appears in the sidebar.
- [x] Click `New Chapter`.
- [x] Confirm a `chapterId` appears and the editor loads draft content.
- [x] Edit the chapter text.
- [x] Click `Save`.
- [x] Confirm status bar shows draft saved/version message.
- [x] Verify MongoDB `draft_chapters` has latest content and incremented `version`.
- [x] Click `Submit Chapter`.
- [x] Confirm chapter status becomes `PENDING_MODERATION`.
- [x] Click `Submit Novel`.
- [x] Confirm novel status becomes `PENDING_MODERATION`.
- [x] Confirm AI panel is visible but disabled for Phase 7.

## 4. Phase 3 Done Criteria

- [x] Author IDE runs locally.
- [x] Auth UI can obtain and store an access token.
- [x] Author can create/load a novel.
- [x] Author can create/load a chapter.
- [x] Editor can save draft content to backend/MongoDB.
- [x] Novel/chapter submit publish actions call backend.
- [x] AI Copilot remains placeholder-only.
- [x] Phase 3 reviewed and approved.

If approved, continue to Phase 4: Content Control + Interaction.

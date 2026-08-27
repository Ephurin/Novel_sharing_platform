# Phase 0 Bootstrap Checklist

Use this checklist for the first actual coding step.

## 1. Before Coding

- [x] Confirm Node.js version: Node.js `v22.14.0`.
- [x] Confirm package manager: npm `10.9.2` is acceptable unless team chooses otherwise.
- [x] Confirm project folders: `backend/`, `web/`, `mobile/` later.
- [x] Confirm backend framework: Express + TypeScript.
- [x] Confirm web stack: React + Vite + TypeScript + Mantine.
- [x] Confirm mobile is deferred.

## 2. Backend Scaffold

Create:

```txt
backend/
  src/
    main.ts
    app.ts
    core/
      config/
      database/
      errors/
      middleware/
      response/
      validation/
    modules/
      auth/
      users/
      novels/
      reading/
      interactions/
      wallet/
      ai/
      content-control/
      admin/
    jobs/
    shared/
  package.json
  tsconfig.json
  .env.example
```

Minimum backend tasks:

- [x] Install runtime dependencies.
- [x] Install dev dependencies.
- [x] Configure TypeScript.
- [x] Add `GET /api/v1/health`.
- [x] Add global error handler.
- [x] Add response envelope helper.
- [x] Add env validation skeleton.
- [x] Add database connection placeholders.

Do not implement real business tables before schema/migration strategy is chosen.

## 3. Web Scaffold

Create:

```txt
web/
  src/
    app/
      router.tsx
      providers.tsx
      layout/
    shared/
      api/
      components/
      hooks/
      stores/
      utils/
    features/
      auth/
      author-ide/
      novels/
      chapters/
      story-context/
      ai-copilot/
      content-control/
      admin/
    theme/
  package.json
  tsconfig.json
  .env.example
```

Minimum web tasks:

- [x] Install React + Vite + TypeScript.
- [x] Install Mantine.
- [x] Install React Router.
- [x] Install TanStack Query.
- [x] Install Zustand.
- [x] Add app providers.
- [x] Add empty routes.
- [x] Add Author IDE shell placeholder.

## 4. Mobile Scaffold Deferred

Mobile app is not scaffolded in Phase 0.

Reason:
- Reader APIs are not stable yet.
- Author/Admin web and backend are MVP priority.
- Mobile will start after public novel, chapter reading, comment, and wallet APIs are usable.

Planned folder:

```txt
mobile/
  src/
    app/
    shared/
    features/
      auth/
      home/
      search/
      reader/
      library/
      wallet/
      profile/
```

## 5. Initial Validation

Backend:

```txt
npm.cmd --prefix backend run dev
```

Web:

```txt
npm.cmd --prefix web run dev
```

Expected:

- backend starts without crashing;
- `GET /api/v1/health` returns success envelope;
- web app opens with placeholder shell;
- no business logic implemented yet.

## 6. Phase 0 Review Guide

Review after Phase 0 is required before starting Phase 1.

### 6.1 Backend Review

- [x] Confirm `npm.cmd --prefix backend run dev` starts without crashing.
- [x] Open `GET http://localhost:4000/api/v1/health`.
- [x] Confirm health response uses the shared success envelope.
- [x] Confirm global error and not-found middleware are registered.
- [x] Confirm backend modules match planned boundaries: `auth`, `users`, `novels`, `reading`, `interactions`, `wallet`, `ai`, `content-control`, `admin`.
- [x] Confirm no real business logic or database tables are implemented yet.

### 6.2 Frontend Review

- [x] Confirm `npm.cmd --prefix web run dev` starts without crashing.
- [x] Open the Vite local URL, usually `http://localhost:5173`.
- [x] Confirm the Author IDE shell is visible.
- [x] Confirm the left activity bar includes Story, Entities, Timeline, Knowledge Graph, Search, Tasks, Projects, Settings.
- [x] Confirm the layout has sidebar, editor area, AI assistant panel, and status bar.
- [x] Confirm no feature-specific API integration is implemented yet.

### 6.3 Project Structure Review

- [x] Confirm `backend/node_modules/` and `web/node_modules/` are not committed.
- [x] Confirm `.env.example` exists for both backend and web.
- [x] Confirm `.gitignore` excludes `.env`, `node_modules/`, `dist/`, and build outputs.
- [x] Confirm documentation still matches the scaffolded folders.

### 6.4 Review Decision

Approve Phase 0 if:

- backend and web both run locally;
- folder structure matches architecture docs;
- no unexpected business logic appears in scaffold;
- no secret files are committed;
- Phase 1 Auth can start without restructuring.

If approved, continue to Phase 1: Auth foundation.

## 7. Phase 0 Done Criteria

- [x] `backend/` can run locally.
- [x] `web/` can run locally.
- [x] folder structure matches `docs/Backend/module-structure.md` and `SKILL/FRONTEND_DESIGN.md`.
- [x] `.env.example` files exist.
- [x] README/run instructions exist in each scaffolded project.
- [x] Team can start Phase 1 auth implementation without restructuring.

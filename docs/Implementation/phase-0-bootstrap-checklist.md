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

- [ ] Install runtime dependencies.
- [ ] Install dev dependencies.
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

- [ ] Install React + Vite + TypeScript.
- [ ] Install Mantine.
- [ ] Install React Router.
- [ ] Install TanStack Query.
- [ ] Install Zustand.
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
npm --prefix backend run dev
```

Web:

```txt
npm --prefix web run dev
```

Expected:

- backend starts without crashing;
- `GET /api/v1/health` returns success envelope;
- web app opens with placeholder shell;
- no business logic implemented yet.

## 6. Phase 0 Done Criteria

- [ ] `backend/` can run locally.
- [ ] `web/` can run locally.
- [ ] folder structure matches `docs/Backend/module-structure.md` and `SKILL/FRONTEND_DESIGN.md`.
- [x] `.env.example` files exist.
- [x] README/run instructions exist in each scaffolded project.
- [ ] Team can start Phase 1 auth implementation without restructuring.

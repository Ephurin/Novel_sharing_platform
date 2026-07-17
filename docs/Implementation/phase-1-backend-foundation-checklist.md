# Phase 1 Backend Foundation Checklist

Use this checklist after Phase 0 is approved.

Phase 1 focuses on backend foundation only. Full register/login/business auth flows start in Phase 2.

## 1. Scope

- [x] Keep Express + TypeScript backend.
- [x] Keep `/api/v1/health`.
- [x] Add auth middleware skeleton.
- [x] Add PostgreSQL client foundation.
- [x] Add MongoDB client foundation.
- [x] Keep database connection optional during local bootstrap.
- [x] Preserve standard response envelope.

## 2. Environment

Required backend env fields:

```txt
NODE_ENV=development
PORT=4000
API_PREFIX=/api/v1
DB_CONNECT_ON_START=false
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ephurin
MONGODB_URI=mongodb://localhost:27017/ephurin
JWT_ACCESS_SECRET=local-dev-access-secret-change-later
JWT_REFRESH_SECRET=local-dev-refresh-secret-change-later
```

Notes:

- `DB_CONNECT_ON_START=false` lets the backend run before local PostgreSQL/MongoDB are fully configured.
- Set `DB_CONNECT_ON_START=true` only after local databases are ready.
- If PostgreSQL reports password authentication failure, update `DATABASE_URL` password to match the password configured during PostgreSQL installation.

## 3. Backend Foundation Review

- [x] `npm.cmd --prefix backend run typecheck` passes.
- [x] Backend starts locally with `DB_CONNECT_ON_START=false`.
- [x] `GET /api/v1/health` returns success envelope.
- [x] Unknown errors are mapped through global error middleware.
- [x] Zod validation errors map to `VALIDATION_001`.
- [x] Missing auth token maps to `AUTH_002`.
- [x] Expired access token maps to `AUTH_005`.
- [x] Role guard denies unauthorized roles with `AUTH_008`.

## 4. Implemented Files

- `backend/src/core/security/auth.middleware.ts`
- `backend/src/core/security/auth-context.ts`
- `backend/src/core/types/express.d.ts`
- `backend/src/shared/constants/roles.ts`
- `backend/src/core/database/postgres.ts`
- `backend/src/core/database/mongo.ts`
- `backend/src/core/database/database.ts`

## 5. Review Commands

Typecheck:

```txt
npm.cmd --prefix backend run typecheck
```

Run backend:

```txt
npm.cmd --prefix backend run dev
```

Health check:

```txt
GET http://localhost:4000/api/v1/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "OK",
    "service": "ephurin-backend"
  },
  "error": null,
  "meta": {}
}
```

## 6. Phase 1 Done Criteria

- [x] Backend foundation compiles.
- [x] Backend can run without requiring live DB connections.
- [x] PostgreSQL and MongoDB clients are ready for Phase 2 repositories.
- [x] Auth middleware and role guard are ready for protected endpoints.
- [x] Local PostgreSQL credentials are confirmed.
- [x] Local MongoDB connection is confirmed with `DB_CONNECT_ON_START=true`.
- [x] Phase 1 is reviewed and approved.

If approved, continue to Phase 2: Auth + User + Core Content.

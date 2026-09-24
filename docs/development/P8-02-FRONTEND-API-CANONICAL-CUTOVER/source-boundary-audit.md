# P8-02 source-boundary audit

Reviewed branch: `astra/p8-02-frontend-api-cutover`
Reviewed HEAD: `f33565b659d4f8322d8f6adccb43e9951b3c8272`

Static review findings:

- Web AI copilot: shared Platform `apiClient`; gateway-relative `/ai/*` routes.
- Manuscript import: shared Platform `apiClient`; gateway-relative `/ai/*` routes.
- Mobile API client: only `EXPO_PUBLIC_API_BASE_URL`; no direct AI-service base/service token.
- Web public env example: only `VITE_API_BASE_URL`.
- nginx: `/api/v1` -> `backend:4000`.
- root Compose web build arg: `VITE_API_BASE_URL=/api/v1`.
- backend retains server-only `AI_SERVICE_URL` and `PLATFORM_SERVICE_TOKEN`, which is allowed.

Enforcement artifact:

`scripts/check_p8_frontend_api_cutover.py`

This file is static review evidence only. Executed CI PASS is not claimed here.

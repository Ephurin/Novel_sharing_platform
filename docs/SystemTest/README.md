# System Test Guide

This folder contains handoff documents for another agent/tester to validate the Ephurin Novel Sharing Platform after Phase 8 Web MVP.

## Documents

| Document | Purpose |
| :--- | :--- |
| `system-test-plan.md` | Overall system test scope, environment, data, risks, and exit criteria. |
| `api-regression-checklist.md` | Postman/API regression checklist based on existing tested collections. |
| `web-e2e-checklist.md` | Manual browser E2E checklist for Public, Reader, Author, Wallet, Admin, Profile, and Notifications. |
| `negative-and-edge-case-checklist.md` | Negative, permission, validation, wallet, moderation, and network failure tests. |
| `db-side-effect-verification.md` | PostgreSQL/MongoDB side-effect verification after API/Web actions. |
| `deeplink-refresh-checklist.md` | Direct URL, refresh, old-tab, and wrong-role route restoration tests. |
| `test-report-template.md` | Copyable final report format for testers/agents. |

## Quick Start for Tester Agent

1. Read `system-test-plan.md`.
2. Start backend and web locally.
3. Run API regression from `api-regression-checklist.md`.
4. Run web E2E from `web-e2e-checklist.md`.
5. Run negative tests from `negative-and-edge-case-checklist.md`.
6. Verify DB side effects from `db-side-effect-verification.md`.
7. Run deep-link/refresh checks from `deeplink-refresh-checklist.md`.
8. Fill `test-report-template.md`.

## Current Test Boundary

- Test non-AI backend and web MVP flows only.
- Do not test real payment integrations; wallet is mock/demo.
- Do not expect Author context CRUD or AI Copilot behavior; those are deferred.
- Do not require mobile app testing until Phase 9 implementation exists.

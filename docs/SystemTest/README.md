# System Test Guide

This folder contains handoff documents for another agent/tester to validate the Ephurin Novel Sharing Platform through business workflows, not only isolated pages.

## Documents

| Document | Purpose |
| :--- | :--- |
| `system-test-plan.md` | Overall system test scope, environment, data, risks, and exit criteria. |
| `business-flow-scenarios.md` | Primary multi-role business-flow scenarios for Antigravity/system testers. |
| `api-regression-checklist.md` | Postman/API regression checklist based on existing tested collections. |
| `web-e2e-checklist.md` | Manual browser E2E checklist for Public, Reader, Author, Wallet, Admin, Profile, and Notifications. |
| `negative-and-edge-case-checklist.md` | Negative, permission, validation, wallet, moderation, and network failure tests. |
| `db-side-effect-verification.md` | PostgreSQL/MongoDB side-effect verification after API/Web actions. |
| `deeplink-refresh-checklist.md` | Direct URL, refresh, old-tab, and wrong-role route restoration tests. |
| `test-report-template.md` | Copyable final report format for testers/agents. |

## Quick Start for Tester Agent

1. Read `system-test-plan.md`.
2. Start backend, web, PostgreSQL, and MongoDB locally.
3. Run the high-value journeys in `business-flow-scenarios.md`.
4. Run API regression from `api-regression-checklist.md`.
5. Use `web-e2e-checklist.md`, `negative-and-edge-case-checklist.md`, and `deeplink-refresh-checklist.md` as supporting checklists.
6. Verify DB side effects from `db-side-effect-verification.md`.
7. Fill `test-report-template.md`.

## Current Test Boundary

- Test backend and web MVP flows across Author, Reader, Admin, Guest, wallet, content control, and AI Copilot integration.
- Do not test real payment integrations; wallet is mock/demo.
- AI Copilot uses the Node backend as gateway and an external OpenAI-compatible ngrok provider when configured.
- If ngrok is offline, record AI tests as external dependency blocked, not as a core web/backend failure.
- Mobile Reader App testing is separate from these web-first business flows.

# Regression summary

All independently executed at source SHA recorded in validation.json; tracked source clean, evidence directory untracked. Commands and actual exits: GREEN-commands.json (first HTTP attempt blocked), GREEN-unit-authorized-command.json (authorized HTTP pass), runtime-3050919ab017.json (migration/live pass).

| Check | Result | Proof level |
|---|---|---|
| Internal revision authorization | PASS 34/34, exit 0 | Real HTTP/router/service; SQL fixtures |
| Chapter revision patch, outbox, P1 gateway, autonomous recovery, job resume ownership, draft read ownership | PASS 60/60, exit 0 | Focused unit regression; SQL/Mongo/AI dependencies mocked |
| AI revision provider, revision analysis workflow, manuscript bootstrap, internal generation contract | PASS 10/10, exit 0 | AI unit regression; fake adapters |
| Backend typecheck | PASS, exit 0 | TypeScript noEmit |
| Fresh SQL migration | PASS, exit 0 | Real isolated PostgreSQL |
| HTTP matrix and actual PlatformRevisionClient | PASS, exit 0 | Real HTTP + new PostgreSQL/MongoDB + actual Python adapter |
| Accepted-generation crash replay | PASS in 60-test set | Existing autonomous controller unit test; not durable generation E2E |
| Active Story Brain / processed outbox / full generated accept | NOT_RUN | Not claimed by this bounded fix |
| FE integration S09-S11 / PR57 DTO change | NOT_RUN | Gemini-owned, no FE changes |

No broad P123 replay, model/embedding calls or production data access. No fake-database result is presented as durable evidence.

Final source seal: `117337539da666172cf7b173c3a78730a2aa7ea1` normalizes only LF in the two new test files relative to the earlier GREEN SHA. All 34 HTTP unit / 60 backend / 10 AI tests and typecheck independently reran PASS at this final SHA (`FINAL-commands.json`). A second newly provisioned database pair also passed migration + live proof (`runtime-4e6d112b93f6.json`, `live-4e6d112b93f6/`). Tracked source clean; evidence only untracked. Both pairs stopped, new volumes retained. `git diff --check 2279b41 HEAD` exit 0. Earlier artifacts remain unchanged.

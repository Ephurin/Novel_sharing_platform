# Source and contract reconciliation

Parent PR65 remains Draft/unmerged at `e63fc8c5a12aac0ce258cf360359f3ec3dca4a28`; integration remains `6de87f575ee2e3d114ee83159c2b335667a62e7f`. Dedicated branch `codex/p1-fe-final-acceptance`, child Draft PR67 targets the Gemini branch. Accepted history is preserved. Tested clean source `c5a015aaef73eb4c5ed7c2b1673cc795567d0991`, tree `aaef0ae0d52cfd2c062fbe2d6c919b64cb1b0d28`. No backend production source or migration delta from PR65; existing ownership/CAS/Canon/group transactions are retained.

FE15: remove browser-controlled API destination overrides; build-time Vite config and fixed same-origin acceptance proxy retain auth/cookies. FE18: preserve canonical name bytes/whitespace, bounded explicit casefold alphabet, fail unsupported inputs; actual Python validator round trips. FE19: retain author correction authority/provenance, restore fixed ingress without reflected credentialed CORS, ground typed fake responses and leave known inventory unresolved for human selection.

Runtime-discovered repairs: account-scoped novel/chapter context; consistency uses approved projected UUID state and a verified immutable Core revision instead of creation-time status/rev-mock; deterministic provenance ordering. Consistency now requires chapter_id, revision_id, content_hash and exact saved content (422 invalid/missing, 404 absent, 403 foreign); the mounted panel obtains these from Core. Homonyms return an explicit ambiguity warning with candidate IDs, never a guessed identity.

Offline G4 revealed missing CDN styling, wrong icon face and clipped controls. Existing theme configuration moved verbatim to local Tailwind 3/PostCSS, existing font families/variants are locally bundled with licenses, author font alias corrected, mobile action container wraps. No substituted UI or visual redesign. Existing dependency versions retained; new build-only advisory is documented below.

```text
M	.github/workflows/p7-semantic-memory.yml
M	.github/workflows/p8-cutover.yml
M	Pipeline_test/tools/fake_provider_upstream.py
M	Pipeline_test/tools/headless_http_ingress.py
A	Pipeline_test/tools/p1_acceptance_tcp_bridge.py
M	ai-service/api/entity_hitl_routes.py
M	ai-service/api/narrative_routes.py
M	ai-service/application/narrative_service.py
M	ai-service/tests/test_author_operation_consistency.py
A	ai-service/tests/test_p1_fe_final_contracts.py
A	docs/development/integration/p1-author/final-fe-acceptance/PLAN.md
A	scripts/p1_final_acceptance.py
A	scripts/p1_sanitize_trace.py
M	web/index.html
M	web/package-lock.json
M	web/package.json
A	web/postcss.config.cjs
A	web/public/FONT-LICENSES.txt
M	web/src/features/ai-copilot/AuthorMemoryPanel.tsx
M	web/src/features/ai-copilot/EntityExtractionReview.tsx
M	web/src/features/ai-copilot/author-memory-api.ts
M	web/src/features/author-ide/AuthorWritingIde.tsx
A	web/src/features/author-ide/author-context.ts
M	web/src/features/author-projects/AuthorProjectsPage.tsx
M	web/src/main.tsx
M	web/src/shared/api/api-client.ts
M	web/src/shared/components/AuthorTheme.tsx
M	web/src/styles.css
M	web/src/theme/storycraft.css
A	web/tailwind.config.cjs
A	web/tests/api-client-security.browser.test.mjs
A	web/tests/author-context.test.ts
M	web/tests/author-ide.browser.test.mjs
M	web/tests/draft-persistence.browser.test.mjs
A	web/tests/entity-casefold-python.test.ts
A	web/tests/helpers/evidence-output.mjs
A	web/tests/helpers/p1-canon-acceptance.mjs
A	web/tests/helpers/p1-cross-feature-smoke.mjs
A	web/tests/helpers/p1-entity-acceptance.mjs
A	web/tests/helpers/p1-fixtures.mjs
A	web/tests/helpers/p1-offline-assets.mjs
A	web/tests/helpers/p1-real-stack.mjs
A	web/tests/offline-assets.browser.test.mjs
A	web/tests/p1-final-acceptance.browser.test.mjs
```

# Sanitized P1 acceptance evidence

Prepared for GPT-6 review of **AA-01 (MAJOR)** and **AA-02 (MINOR)**. This publication contains **8 files total**, including this index: two metadata-free screenshot copies and six Markdown files. It does not contain raw DOM, HTTP traffic, container logs, database dumps, runtime configuration or credentials.

Historical application SHA: `59b0fcb54863391081cbf6d0ed5b5c56e441e487`. Reports were first published at `833bd76f313fae97dcdaa2ca2963d77493ee13ef`. The findings and original verdicts remain unchanged:

- [Environment handoff](../P1_ENV_UNBLOCK_CODEX.md): P1_ENV_READY_FOR_SOL61 at that historical checkpoint.
- [Real smoke](../P1_REAL_SMOKE_SOL61.md): P1_REAL_SMOKE_PARTIAL, six successful provider dispatches.
- [Author acceptance](../P1_AUTHOR_ACCEPTANCE_SOL61.md): P1_AUTHOR_ACCEPTANCE_PARTIAL, zero new provider calls.

## Review index and sources

| File | Test / claim | Original source description |
|---|---|---|
| [aa01-ui-observations.md](aa01-ui-observations.md) | C01 / AA-01; original draft/review controls versus reopened ready state; explicit screenshot limitations | Saved original Writing-session UI observation, reopened-panel observation and revision-history observation |
| [aa01-reopened-ui.png](aa01-reopened-ui.png) | AA-01 page context after reopen; clipped below quick actions, not standalone proof of draft absence | Existing reopened Author IDE screenshot |
| [aa01-job-and-manuscript.md](aa01-job-and-manuscript.md) | AA-01; one completed/passed job persists, draft unchanged, manuscript not overwritten, zero new calls | Read-only Writing-job results before/after, exact manuscript comparison and final dispatch-boundary result |
| [canon-hitl-summary.md](canon-hitl-summary.md) | A01–A07 / B01–B07 within manual-fixture scope; reject/approve isolation, profiles/correction and persistence | Existing Canon checkpoint comparisons, proposal decisions, profile audit and reload/login observations |
| [canon-approved-item.png](canon-approved-item.png) | Successful ITEM approval, Brain v7, pending count zero | Existing approved-item tab screenshot |
| [smoke-dispatch-summary.md](smoke-dispatch-summary.md) | Historical 6/6 HTTP 200, model/latency/token summary, embedding dimensions and safe shutdown | Existing per-call results, outbound/ledger reconciliation, offline cap proof and pgvector result |
| [aa02-source-attribution.md](aa02-source-attribution.md) | AA-02; UI “Gốc từ AI” versus author provenance | Relevant label in the edited manual-event observation and read-only author provenance |
| README.md | Selection, sanitization, limitations and security review | Current publication process; no new product execution |

## What this set can and cannot prove

AA-01 evidence is the combination of original UI observation, reopened UI observation and unchanged stored job/manuscript. **No usable screenshot of the initial visible draft was available.** The original image clipped the draft panel and is not published as a before-image. No image was reconstructed, generated or altered to imply that the draft was visible.

The reopened screenshot is also clipped; its limitations are explicit. Text summaries are curated transcriptions/derivations from existing evidence, not fresh runtime results. They do not establish accept/reject behavior. Those tests remain NOT_RUN. AA-01 is a MAJOR recovery gap; no database draft loss or automatic acceptance was observed. AA-02 is a MINOR source-label error.

Canon checks used UI-created manual proposals, not a new Gemini extraction. Persistence passed for the tested profile/event path. Six historic calls remain six; publication made **0 new Gemini calls**. Containers were not started. PR #83 was checked as Draft/open/unmerged before publication and is not changed by this task.

## Sanitization and security gate

- All 63 original files were inventoried and checked locally for exact known credential values. Original hashes are retained locally to verify no original was changed. All originals remain at their original locations under local Git ignore rules; nothing was deleted, moved or staged.
- Only two screenshots were selected. Copies were decoded and encoded as actual RGB PNG files with fresh image objects: no EXIF, text chunks, ICC profile or other ancillary metadata. Some originals used a different image encoding despite their suffix; the published copies have correct PNG signatures. Decoded pixels were compared byte-for-byte with the source: unchanged.
- Every selected image was visually inspected for visible credentials, personal paths, OS account names, unrelated personal content and unnecessary identifiers. None was present in the selected pixels, so no pixel redaction was necessary. QA fictional titles/names, UI state, PASS/FAIL text and timestamps were preserved.
- Text was rewritten as small summaries. Record IDs were replaced with stable document aliases; account/project fingerprints, personal absolute paths, network details, payloads, vectors and raw records were omitted. The three existing reports received metadata-only redactions and links to this index; no verdict, call count or technical conclusion changed.
- Local checks reuse the unchanged repository credential/JWT redactor (`scripts/p1_sanitize_trace.py`) on a temporary archive plus exact-value/pattern checks on the proposed publication. The redactor output is compared with its input; any credential redaction requirement fails the gate rather than silently publishing the input. Runtime keys/tokens are never passed on command lines or printed.
- PNG signature/chunk/metadata validation, Markdown/reference checks, file-size checks, original-integrity checks and staged-path/diff review are required. Scanner rules, hooks and automatic approval review are not disabled or changed. No dedicated gitleaks/trufflehog executable was found; those tools are not claimed as having run.

Local security status: **PASS — credential/JWT checks, exact-value scan, path/identifier/reference checks, image metadata/binary checks and visual review**. The final staged diff is reviewed before commit. Automatic approval review independently controls commit/push; local scan success is not represented as approval from that reviewer.

## Exclusions

All 63 raw originals remain local-only. The original-session and pending-candidate screenshots were excluded for insufficient visible signal. Other screenshots were redundant or included unnecessary identifiers. Raw page dumps, job/event records, traces, prompt/response bodies, vectors and runtime logs were replaced by the summaries above. Original filenames and paths are not enumerated in this public subset. The unpublished sources remain available locally for an authorized, detailed review.

This set is sufficient to review the reported AA-01 recovery gap with its explicit evidence limits. It is not a replacement for a separately authorized hotfix verification or a full Author acceptance PASS.

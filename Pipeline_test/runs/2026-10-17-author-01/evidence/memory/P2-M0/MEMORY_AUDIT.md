# Narrative memory audit — P2-M0 / M-FINAL early stop

Run 2026-10-17-author-01; project 38efd972-da60-4c19-a967-5ef8c62e230a; recorded 2026-10-17T23:09:11.173294+07:00. Code SHA 390b09fd043ec29db84519a9d195b59b76eec003.
Overall: FAIL. Final aliases M0 at unchanged source cutoff. No correction, DB/code changes or subsequent prose accepted.

Gold was frozen before extraction: `979b4b97f2713a732c27b2743facb64015d7be4c75c2c01e8af51e177c5911dd`. See source manifest and expected items; P1/P3 source contains four complete chapters and partial chapter 5. P2 is author idea, zero prose chapters; context probe cutoff 1 is prospective, not a completed chapter.

Provider: observed HTTP 200 requests to Gemini 3.5 Flash-Lite in runtime logs. Provider raw response, finish reason, usage and call IDs are not exposed; cannot certify a successful extraction just from configuration/HTTP. Logs correlate time with job execution but do not expose exact input per provider call. No semantic embeddings in this runtime. World rules in manuscript analysis use a regex lane; do not count them as LLM extraction.

Blueprint raw queue: 11 outputs reviewed, 11 supported as premise/rules/entities; three duplicate constraints. Constraint sample coverage 3/3 before activation; this is blueprint generation, not prose-extraction recall. Origin: premise and constraints author-supplied; generic protagonist and other entity proposals model-proposed/author-accepted. Rejected the three duplicate author_constraint records; accepted eight individually reviewed outputs in one dependency group. Saved raw queue before decisions and accepted artifact IDs after. Baseline brain version 1 → 2.

Materialization/context failure: Mai Lâm has status Alive in both entities and current_states while a retained world_rule states he is dead and must not revive. Constraint correctness in operative context is 2/3, not 3/3; critical recall fails. Four of five preview probes retain the expected rule/entity or show the scoped absence of future events; death probe fails. No full-record/source provenance export through the inspected Node gateway, so provenance accuracy is NOT_ASSESSED. No text generation after the critical gate. Public character profile PATCH lacks a canonical status/state field; accepted proposals cannot be re-edited through pending-only proposal API. No supported correction established, no legacy profile write attempted to disguise a repair.

Evidence: raw-queue.json; probe-gold.json and probe-01..05.json; memory_probes.csv; memory_items.csv; job snapshots at run evidence root; sanitized runtime log. No separate raw retrieval IDs before packing are exposed. See REPORT.md and issues.csv for repro/resume.

M-FIRST NOT_RUN: no new accepted prose. Main M10/M20/M30/M40 NOT_RUN: cutoff never reached. Main M50 NOT_APPLICABLE: 40-chapter fixture. Short P2/P3 probe has no long-term coverage. Post-correction quality NOT_ASSESSED; no repair made. Resume requires a separately fixed/versioned product and complete M0 retest before generation. Preserve all pre-fix failures and freeze new expected items before any new analysis.

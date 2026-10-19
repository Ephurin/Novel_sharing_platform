# Narrative memory audit — P1-M0 / M-FINAL early stop

Run 2026-10-17-author-01; project 8bfd205f-c055-45e4-beda-e81a24b7854b; recorded 2026-10-17T23:09:11.173294+07:00. Code SHA 390b09fd043ec29db84519a9d195b59b76eec003.
Overall: FAIL. Final aliases M0 at unchanged source cutoff. No correction, DB/code changes or subsequent prose accepted.

Gold was frozen before extraction: `354676ff59100f7a9433ee5c7786ae2784a12ed637d1e01a083127de1aa521f2`. See source manifest and expected items; P1/P3 source contains four complete chapters and partial chapter 5. P2 is author idea, zero prose chapters; context probe cutoff 1 is prospective, not a completed chapter.

Provider: observed HTTP 200 requests to Gemini 3.5 Flash-Lite in runtime logs. Provider raw response, finish reason, usage and call IDs are not exposed; cannot certify a successful extraction just from configuration/HTTP. Logs correlate time with job execution but do not expose exact input per provider call. No semantic embeddings in this runtime. World rules in manuscript analysis use a regex lane; do not count them as LLM extraction.

P1 first attempt failed entity JSON parsing at chapter 1; one same-manifest retry failed event JSON parsing at chapter 1. Both job snapshots retained. No successful chapter checkpoint, proposal queue empty and historical context empty. Output ceiling 512 tokens may contribute, but raw response/finish reason absent, so truncation remains unproven.
Usable-proposal coverage 0/35 expected source assertions; output precision 0/0 is NOT_ASSESSED, never 100%. Raw model-text quality cannot be scored without that response. No accepted historical state to validate provenance. Four positive context probes lack supporting memory; one negative probe shows no future historical event only (context coverage 1/5 with this limitation). Do not infer successful retention from an empty history. Baseline activation blocked, no manual gold injection.

Evidence: raw-queue.json; probe-gold.json and probe-01..05.json; memory_probes.csv; memory_items.csv; job snapshots at run evidence root; sanitized runtime log. No separate raw retrieval IDs before packing are exposed. See REPORT.md and issues.csv for repro/resume.

M-FIRST NOT_RUN: no new accepted prose. Main M10/M20/M30/M40 NOT_RUN: cutoff never reached. Main M50 NOT_APPLICABLE: 40-chapter fixture. Short P2/P3 probe has no long-term coverage. Post-correction quality NOT_ASSESSED; no repair made. Resume requires a separately fixed/versioned product and complete M0 retest before generation. Preserve all pre-fix failures and freeze new expected items before any new analysis.

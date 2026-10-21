# Narrative memory audit — 2026-10-19-recovery-ui-01

**P1-M0: FAIL.** Reviewer is the repairing developer/retester, not independent.
Frozen 35 gold assertions were bound before extraction. Every assertion was manually judged for meaning and certainty; no overlap threshold was used as a semantic PASS.

| Layer | Observation |
|---|---|
| Provider execution | Actual Gemini structured traces; model `models/gemini-3.5-flash-lite` |
| Raw 187 proposals / 35 gold | 15 PASS, 16 FAIL, 4 PARTIAL (strict supported recall 15/35) |
| Structural quote/hash | 187/187 valid spans/hash; this does not prove semantic attribution |
| After author review | 13 PASS, 19 FAIL, 2 PARTIAL, 1 PASS_AFTER_AUTHOR_WORDING |
| Review | 174 accepted, 13 rejected; 28 unique fact edits, several reapplied after UI reset |
| Approved M0 | 33 entities, 98 facts, 19 events, 70 transitions; brain v6 active |
| 4k fixed Linh query, cutoff 5 | 3 present, 11 dropped, 21 upstream gaps; 3997 token estimate |
| 8192 fixed Linh query, cutoff 5 | 6 present, 8 dropped, 21 upstream gaps; 8150 token estimate |

All 70 rows in memory_probes.csv reuse **two fixed context requests**, not 70 free-text retrieval calls. Selected IDs and materialized state are observable; retrieval candidates and semantic-lane internals are NOT_OBSERVED. A bounded context is not required to pack every gold assertion simultaneously. Upstream omissions and loss of certainty remain material failures regardless of packing.

Missing/incorrect assertions include CV-04 characteristics and scan count, storage and permissions, right-ear compensation and uncertainty around Vũ, the notebook and bell history. Some numerical assertions were raw-correct but rejected because unresolved subjects could not be safely repaired with the current fields. Aliases were not linked (aliases=0); separate Linh/Mai Linh and Vũ/Nguyễn Vũ identities remain a risk.

**P1-M-FIRST: partial functional success after author repair.** The AI-generated draft was rejected because it was incomplete JSON. An author-written 216-word chapter was saved through the UI. Its latest revision produced 40 proposals; the prior 45-word revision produced 15. The stale group was blocked with STALE_PROPOSAL_EVIDENCE, then rejected through the UI. Five new fact edits and one station-status rejection were required before accepting 39 proposals. Brain v7 has 42 entities, 120 facts, 21 events and 85 transitions. The shell pickup event, ash-purple color, spiral shape and ownership were observed. This does not close the original 35-gold failures or establish autonomous success.

M10/M20/M50: NOT_RUN (six draft chapters only). P2/P3: NOT_RUN. No publication or 100k run. See REPORT.md for final checkpoint and outstanding proposals.

Primary evidence: memory_items.csv; memory_probes.csv; evidence/m0-gold-manual.json; evidence/m0-after-review/; evidence/s08-author-save-before-review/; evidence/s08-after-review/.

## P1-FINAL

Final head 2472bd86-54cc-4af6-8f23-ee1d8ccb978d contains245 words; all6 chapters4992 words. Brain remains v7 with the S08 approved counts. Latest prose extraction is unfinished (5 durable outbox records;0 pending proposal records at stopped snapshot). M0 gold is not claimed rescored independently at FINAL. Context cutoff6 snapshots are in evidence/final, with7/14 entities,6/14 events and7/15 facts at4k/8192 respectively. Memory freshness FAIL. No later proposal was approved, including the injected age40 revision. Backend/AI deliberately stopped after evidence collection; PROCESSING labels are persisted labels, not live execution.

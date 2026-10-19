# P1-M0 audit — partial review / baseline blocked

Cutoff: imported ch1–5, 4,747 words, four complete seed chapters plus partial ch5.
Novel 06a979c5-b089-4648-a04e-81383aa7b119. Captured at 2026-10-18T22:37:53.641200+07:00; authoritative captured server observation 2026-10-18T22:30:17.049781+07:00.

## Independent lanes

1. **LLM execution:** real source-correlated Gemini traces for all five revisions;
27 structured responses, STOP, output limit8192. Two natural event-schema failures,
recovered with two manual UI retries. Raw text not captured by service logging;
full raw response-text semantic audit NOT_ASSESSED. See response hashes/model/usage
in `evidence/readonly-after-author-review-structured-traces.json` and sanitized logs.
2. **Parsed raw proposals:** snapshot BEFORE manual correction is
`evidence/memory/P1-M0/readonly-after-retry-02.json`: 93 =79 entity+13 event+1 transition.
35 frozen atomic expectations derive from the unchanged source fixture, not old model
output. Prior fixture-source gold was explicitly mapped to new chapter IDs and frozen
before extraction. Revision bindings added separately after UI bootstrap. Strict
assertion matches 6/35 (G11/G12/G16/G24/G28/G35); other assertions missing/incomplete.
This is recall against these 35 expectations, NOT overall record-level precision.
Atomic output precision has not been scored; no fabricated 95% quality claim.
3. **Approved memory:** before review zero entities/events/facts/transitions. After
two UI rejections and one 26-entity group approval: v2 importing, entities26,
events0/facts0/transitions0;65 pending. Partial memory is NOT a finalized baseline.
No post-correction assertion-quality PASS or baseline recall score is claimed.
4. **Actually used writing context:** NOT_RUN, no writing/generation request.
Persisted rows/tabs are not proof of retrieval or packed AI context. Semantic/vector
lane NOT_ASSESSED; no claim of embeddings success from pgvector installation.

## Source versus extraction findings

- Critical omissions: death of Mai Lâm and 23 old-flood deaths; Duy left hearing loss;
  CV-04 scan_count=1, spectral loss per scan, suggested scan limit3; storage/ownership
  and exact knock pattern. Entity-name detection cannot establish these facts.
- False noun “máy phát” extracted from “Chiếc máy phát ra tiếng lách cách” (verb phrase).
  Rejected through UI, with raw evidence retained.
- Ch2 scan event located at trạm Bốn in proposal; prose scan occurs in archive/kho.
  UI exposes summary/participants but not event location field; rejected through UI.
- Four entity anchors cross word boundaries (see exact spans/excerpts in
  `provenance-span-review.json`). Example An at73–75 in ch1 is inside “thanh”.
  Hash/revision validity alone does not make this correct semantic provenance.
- Certainty risk: ch5 consequence “xác định được công năng thực tế” overstates bà Sâm's
  reported explanation followed by Duy's “Có thể”. It remains pending, not accepted.
- Other ambiguous records remain pending: ch4 meeting location includes trạm Bốn
  though meeting at Đồi Bắc; bà Sâm in survey participants though source says she
  did not accompany them; Linh/Mai Linh and item aliases require resolution review.
- No observed future secret such as83 people inserted into the inspected raw history;
  absent full writing-context coverage, this is not a retrieval isolation PASS.
- UI state_transition object shown as [object Object]; no inspectable nested editor.
  Character cards show Unknown/Unknown; no tested control repairs required states.

## Coverage and decision

Raw memory quality FAIL; UI correction/baseline BLOCKED. Ordinary author approval
gate observed for bootstrap only. Baseline activation, M-FIRST, incremental extraction,
retrieval probes, future-plan isolation, current-state staleness and long-run milestones
NOT_RUN. 10/20/30/40/50/final-long not reached. P2/P3 audits NOT_RUN.
This document is an early-stop audit, not a completed M0 signoff or novel evaluation.
Frozen gold unchanged; `memory_items.csv` is the separate review worksheet.

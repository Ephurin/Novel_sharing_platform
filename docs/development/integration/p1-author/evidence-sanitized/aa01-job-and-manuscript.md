# AA-01 — Curated job / manuscript persistence summary

Read-only results from the existing smoke and Author acceptance evidence. No SQL, database dump, record UUID, account identifier or content hash is published. `Writing job A` is a document alias for the same single QA job throughout, not a replacement fixture.

| Observation | Original session | After reopening / new login |
|---|---|---|
| Writing-job count for the QA novel | 1 | 1 |
| Writing job A status / validation | completed / passed | completed / passed |
| Stored draft length | 428 characters | 428 characters |
| Stored draft content | Recorded generated text | Unchanged; local content-hash comparison matched |
| Main manuscript | Original fictional chapter, 346 whitespace-delimited words | Exact text comparison with original returned true |
| Generated draft automatically inserted into manuscript | No | No; distinctive draft opening absent |
| Draft available to review in reopened UI | Not applicable | Not found |

Interpretation: the draft persists in storage, while its UI recovery is missing in the tested path. There is no evidence of database draft loss or automatic acceptance. Accept/reject correctness was **not** tested in this zero-provider round because no recoverable UI draft or second fixture was available.

Provider boundary during the Author acceptance round: prior smoke ledger **6 → 6**; outbound attempt audit **6 → 6**; dormant ledger **0 → 0**. New real Gemini calls **0**. Both live flags remained false; in-flight **0**.

Expected UX: reopen and review the existing unaccepted draft without spending another provider call. Suggested minimal change: expose/recover the persisted job for the current chapter, with stale revision/Canon checks before acceptance. This is a review recommendation, not an implementation performed here.

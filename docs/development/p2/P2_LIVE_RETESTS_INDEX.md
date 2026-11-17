# P2 live retests, 2026-11-15 to 2026-11-17

These reports cover short live runs of the P2 pipeline on `main`, with `gemini-3.5-flash-lite` on the free tier through the quota gateway. Each run checked the fixes from the previous one and recorded new findings, which were then fixed in the PRs listed. The test novel is "Kiếm Ấn Lôi Sơn" (action fantasy), written one chapter at a time with the same API calls as the Author IDE.

| Report | Run | Calls | Main outcome | Fixed in |
|---|---|---|---|---|
| [Retest 1](P2_LIVE_RETEST_2026-11-15.md) | ch. 1–3 | — | First findings on the live pipeline | #170 |
| [Retest 2](P2_LIVE_RETEST2_2026-11-15.md) | ch. 4–5 | — | Alias evidence, review flow | #171 |
| [Retest 3](P2_LIVE_RETEST3_2026-11-15.md) | ch. 6 | — | P1–P5: stale groups, repeated events | #172 |
| [Retest 4](P2_LIVE_RETEST4_2026-11-16.md) | ch. 7 | 18 | N8, N9 (last-seen place), Q1–Q3 | #173, #174 |
| [Retest 5](P2_LIVE_RETEST5_2026-11-16.md) | ch. 8 | 24 | S1 (outage shown as budget), S2 (repeated scene event) | #175 |
| [Retest 6](P2_LIVE_RETEST6_2026-11-16.md) | ch. 9 | 60 | T1–T2: outage retries spent quota | #176 |
| [Retest 7](P2_LIVE_RETEST7_2026-11-16.md) | ch. 9 re-analysis | 5 | Cost measurement; U1–U2 | #177 |
| [Retest 8](P2_LIVE_RETEST8_2026-11-17.md) | ch. 9 re-analysis | 15 | A works (42/53 names without a call); V1–V3 | #178 |
| [Retest 9](P2_LIVE_RETEST9_2026-11-17.md) | ch. 9 re-analysis | 14 | W1: one surface given two identities | #180 |
| [Retest 10](P2_LIVE_RETEST10_2026-11-17.md) | ch. 10 | 16 | X1: background analysis skipped facts and states; X2–X4 | #181, #182 |
| [Retest 11](P2_LIVE_RETEST11_2026-11-17.md) | ch. 11 | 11 | Analysis down to 6 calls; Y1: a main character dropped out | #183 |
| [Retest 12](P2_LIVE_RETEST12_2026-11-17.md) | ch. 12 | 10 | Y1 fixed: Lam Yên returns where she was last seen | — |

Analysis cost per chapter went from about 11 model calls (retests 8–9) to 6 (retests 11–12): discovery 2, verification 1, events 1, facts and world rules 1, states 1.

Evidence for each run (driver events, brain growth, the chapter text) is in `evidence/retest*-2026-11-1*/`. Live was turned off at the end of every run.

Still open: W1 has not been exercised live (no chapter has used the short name next to the full name yet). Also open: U2 in the live UI, R4 against a real contradiction, Full auto, and Track B.

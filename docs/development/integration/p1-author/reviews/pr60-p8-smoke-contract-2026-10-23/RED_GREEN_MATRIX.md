# P8 canon smoke RED → GREEN

Initial/remote CI source `043b21e2d37dd0c3a5429250804d9b0bbc8c9dab`. Final clean tested source `fbbed59de869bbcd9fcd816c9635aaecbdb0e521`. CI run39912466481 root job120278355053 failed checkpoint11 with `Accepted draft did not advance Story Brain after COMPLETED outbox: 2 -> 2`; local red-02/02a.log reproduces the identical assertion/exit1 on fresh root-compose PG/Mongo and fake provider.

| Scope | RED | Sealed GREEN | Evidence |
|---|---|---|---|
| 02A checkpoint11 | FAIL: outbox complete, brain2→2, no author review | PASS: pending proposals, canon2→2 before review, explicit owner HTTP approval2→3 | sealed/02a-evidence.json checkpoint11 |
| Pending/source/hash/outbox guard | Missing policy assertion | PASS in shared helper: latest revision, immutable SHA256, one completed matching outbox, all scoped proposals pending | DURABLE_READBACKS.json |
| Stale brain version / approval replay | Not asserted here | Both409; canon/version unchanged; each authorized group increments exactly1 | author_decisions in readbacks |
| 01A | Accepted legacy auto-approval as PASS | 15/15; explicit pending/unchanged/review required | sealed/01a-evidence.json |
| 02A | 10 checkpoints before failure | 13/13 | sealed/02a-evidence.json |
| 02B | Same obsolete automatic advancement expectation | 16/16 with explicit review | sealed/02b-evidence.json |
| 03A legacy controller | Not rerun in RED | 18/18, unchanged controller decisions | sealed/03a-evidence.json |
| Evidence verifiers | Old02A could accept implicit approval | 4/4; 02A rejects12 mutants including auto-approval, absent pending, prereview mutation and duplicate approval | sealed/*-verify.log |
| Root native persistence suite | Not part of RED | 5/5 twice, both invocation modes | sealed/*optin.log |

Total new sealed checkpoint assertions62 PASS/0 FAIL/0 SKIP; native10 test executions (5 unique cases), 4 verifier processes, 12 negative mutants specifically in02A. No historical/preliminary PASS counted. All exact argv/exits in sealed/commands.json; top-level sealed runner exit0. Compile0. All source was committed before sealed run; evidence separate.

The old frontend job failure is separate: 139 tests,122 PASS,0 FAIL,14 CANCELLED,3 SKIP; accept-draft-contract parent cancellation. PR58 is open/unmerged and owns isolation. No CI file or protected production/contract source was changed. Full new-head GitHub CI is not claimed PASS.

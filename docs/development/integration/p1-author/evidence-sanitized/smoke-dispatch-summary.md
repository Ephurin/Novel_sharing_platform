# Live smoke — Six-call summary without payloads

Application SHA: 59b0fcb54863391081cbf6d0ed5b5c56e441e487.
Historical smoke verdict: **P1_REAL_SMOKE_PARTIAL**. Author acceptance verdict: **P1_AUTHOR_ACCEPTANCE_PARTIAL**. Publication did not rerun either test.

| Call | Model | Operation | HTTP | Gateway seconds | Input tokens | Result |
|---|---|---|---:|---:|---:|---|
| 1 | gemini-3.5-flash-lite | Native text generation | 200 | 1.388 | 32 | Text returned |
| 2 | gemini-3.5-flash-lite | Structured extraction | 200 | 1.080 | 40 | Valid entity/event JSON schema |
| 3 | gemini-embedding-2 | Document embedding | 200 | 0.822 | 27 | 768 finite, nonzero values |
| 4 | gemini-embedding-2 | Query embedding | 200 | 0.627 | 13 | 768 finite, nonzero values |
| 5 | gemini-embedding-2 | UI Writing query embedding | 200 | 0.630 | 51 | Query stage succeeded |
| 6 | gemini-3.5-flash-lite | UI Writing draft generation | 200 | 1.516 | 222 | completed/passed job; draft present in original UI observation |

One Writing click consumed calls 5 and 6. No parallel requests, fallback or retry was performed. Six recorded outbound POST attempts matched six ledger SUCCESS entries, with zero in-flight at shutdown. HTTP 200 for calls 5/6 follows the gateway SUCCESS branch; full provider usage metadata for those calls was not retained.

The separate test-only shared counter admitted six offline reservations and refused the seventh for either model. Temporary cap: per-model test RPD 7, headroom 0.10, effective total cap 6; concurrency 1. Published project quotas were not replaced by the test cap, and prior ledgers were not reset.

Published operator quotas: text 15 RPM / 250000 TPM / 500 RPD; embedding 100 RPM / 30000 TPM / 1000 RPD. Project/key association and Free tier were operator-confirmed, not independently verified from billing data. No credential, project identity, network topology, trace ID, prompt, full response or vector is included here.

Real document/query vectors were persisted/queried in isolated QA pgvector storage: 768 dimensions, retrieved fictional source matched, cosine distance 0.22084157342656185. This was not populated Author Canon semantic retrieval or a ranking benchmark.

Historical shutdown: authenticated disable succeeded; both effective live flags false; no in-flight requests. The later zero-provider Author acceptance left historical dispatches 6→6. **New provider calls in this sanitization/publication task: 0.** Containers were left stopped; no new runtime check or expired-attestation renewal was performed.

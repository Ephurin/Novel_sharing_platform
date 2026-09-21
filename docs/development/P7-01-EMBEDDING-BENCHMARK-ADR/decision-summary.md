# Decision summary

Status: **INCONCLUSIVE — provider measurements pending**

Completed:

- real-novel corpus frozen;
- 21-query core-gold primary set;
- 10-query Vietnamese cross-lingual diagnostic;
- recent-only baseline measured;
- reproducible benchmark harness added;
- candidate configurations defined.

Still required before ADR-012 can become Accepted:

- real Candidate A metrics;
- real Candidate B metrics;
- latency/batch evidence;
- 768 vs 1536 sweep on the better model;
- Vietnamese diagnostic result;
- final model/dimension decision.

No pgvector production migration may be frozen until these measurements exist.

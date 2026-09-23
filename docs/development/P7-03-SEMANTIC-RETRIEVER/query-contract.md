# P7-03 query contract

ADR-012 document instruction remains:

`Represent this canonical narrative memory for semantic search: `

P7-03 query instruction:

`Represent this narrative retrieval query for semantic search: `

Runtime invariant:

```text
query provider version == ACTIVE_EMBEDDING_VERSION
query dimension = 768
query normalization = L2
distance = exact cosine
```

Writing generation forms the semantic query from author instruction plus selected text when available.

If no canonical chapter cutoff is available, event semantic retrieval is skipped rather than searching an unbounded timeline.

Returned semantic rows are audit/context artifacts. They do not become canonical facts or override canonical recent events.

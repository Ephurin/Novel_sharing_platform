# P7-02 schema summary

## memory_chunks

Derived content/provenance only; no vector ownership.

Identity:
```text
UNIQUE(story_brain_id, memory_type, source_key)
```

Key fields include story/tenant/novel scope, source provenance, memory type, content, SHA-256 content hash, importance, narrative order, entity IDs, metadata, and timestamps.

For the first slice:
```text
confirmed active event
→ source_key = event:<event_id>
→ memory_type = event_summary
→ content = event.summary
```

Updating source content updates the chunk hash while existing embedding rows become detectably stale.

## memory_embeddings

Representation-specific storage.

Identity:
```text
UNIQUE(memory_chunk_id, embedding_version)
```

Generation v1:
```text
model         gemini-embedding-2
version       gemini-embedding-2-768-v1
dimension     768
normalization l2
distance      cosine
column        VECTOR(768)
```

The row stores a snapshot of `memory_chunks.content_hash`. A mismatch means the embedding is stale.

No ANN index is created in P7-02.

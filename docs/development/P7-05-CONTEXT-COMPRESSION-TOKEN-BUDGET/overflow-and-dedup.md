# P7-05 overflow and dedup behavior

## Protected overflow

If protected artifacts alone exceed the requested Story Brain context maximum:

```text
keep them whole
used > maximum
budget_overflow = true
protected_overflow = true
```

No protected rule, package author constraint, or locked entity/state bundle is silently truncated.

## Optional overflow

Optional artifacts are whole-item candidates. A candidate that does not fit is dropped and packing continues, so a large artifact cannot prevent a later smaller artifact from fitting.

## Semantic/recent redundancy

When `semantic_memory.event_id == recent_event.event_id`:

```text
semantic rank supplies priority
canonical recent-event payload supplies content
duplicate semantic payload is omitted
deduplicated semantic ID is traced
```

This reduces duplicated prompt bytes while keeping canonical representation authoritative.

# P7-05 packing contract

```text
packing_version   = context-budget-v1
estimator_version = utf8-json-bytes-3-v1
default_maximum   = 12000 estimated context tokens
```

Production order:

```text
canonical candidates
+ hybrid semantic candidates
→ dedup
→ ContextBudgetPacker
→ exact packed Story Brain payload
→ context hash
→ LLM
```

Protected whole artifacts:
- locked rules/facts;
- author constraints stored in the context package;
- locked entity/current-state bundles.

Optional order:
1. entity/state bundles;
2. nonlocked rules;
3. hybrid-ranked semantic memories;
4. remaining recent events.

Same-event semantic/recent duplication emits only canonical recent-event payload while inheriting semantic packing priority.

No LLM summary is created. No protected artifact is silently truncated.

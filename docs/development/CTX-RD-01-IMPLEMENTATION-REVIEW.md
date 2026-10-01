# CTX-RD-01 — Implementation Review

## Status

**MERGED_BEHIND_LEGACY_DEFAULT — LIVE_ACCEPTANCE_SMOKE_REQUIRED**

Merge commit:

`739b5f8cceb549fb96e97bbc3565621f9f036031`

Production default remains:

`CONTEXT_ROUTING_POLICY=legacy-v1`

No default behavior switch is authorized by this merge.

## Implemented architecture

New application components:

- `application/context_scope.py`
  - `BalancedRelevanceScopeBuilder`
  - scope version: `balanced-scope-v1`

- `application/context_routing.py`
  - `ContextBudgetRouter`
  - tiers: 12k / 16k / 20k / 24k
  - minimum-full-fit routing
  - explicit unresolved error above supported frontier

Narrow integration:

- semantic retriever exposes already-resolved hybrid query signals;
- PostgreSQL context exposes normalized newest-five event participant IDs outside prompt payload;
- `WritingService.preview_context()` evaluates routing eligibility and runs scope-before-budget only under `balanced-scope-v1`;
- explicit token-budget/non-default-limit/fallback paths stay legacy-compatible;
- `ContextBudgetPacker` selection semantics remain unchanged.

## Eligibility gate

Balanced routing activates only when:

```text
policy == balanced-scope-v1
semantic retrieval status == ok
ranking version == hybrid-v1
hybrid signals resolved
chapter cutoff present
semantic limit == 8
recent limit == 20
no explicit token_budget override
normalized recent participant identity available
```

Otherwise behavior falls back to `legacy-v1`.

## CI evidence

Validated implementation tree:

`a403012bb37a98ae8eb99ee0291865e659c23c67`

The later branch-sync merge commit changed parent history only; implementation tree was unchanged.

P7 Semantic Memory Foundation run:

`36808950154`

PASS:

- semantic-memory/retrieval/hybrid/context-routing unit tests;
- CTX-RD-01 production/EVAL parity;
- hybrid retrieval proxy regression;
- benchmark invariant regression;
- Phase 6 temporal/writing regressions;
- full non-PostgreSQL AI-service regression;
- live PostgreSQL + pgvector integration;
- relevance-scope PostgreSQL cutoff/supersede integration;
- production-path Compose smoke.

P8 Cutover/Migration workflow also remained green on the implementation commit.

## Parity result

Production components reproduce the validated EVAL balanced policy on all seven source_1x cases:

```text
selected tier        12k 7/7
semantic             exact 8/8
recent               exact 20/20
rules                equivalent after packer canonical ordering
entity scope          matches EVAL balanced scope
dropped artifacts     0
protected overflow    0
provider calls        0
```

The initial parity failure was an evaluation-harness defect: it compared packed world-rule order against raw input order even though `ContextBudgetPacker` intentionally canonicalizes locked rules before unlocked rules. The check was corrected to compare against the EVAL package after identical packer semantics.

## Acceptance boundary

Implementation merge does not authorize:

- changing default routing to balanced-v1;
- removing legacy-v1;
- changing embedding/hybrid contracts;
- P8-05 cleanup.

Next required gate:

**local live acceptance smoke with balanced-scope-v1 enabled explicitly.**

Required evidence:

- PostgreSQL + pgvector live;
- exact tested main SHA;
- balanced policy active;
- at least representative NORMAL and pressure/stress contexts;
- selected scope IDs/counts;
- selected tier;
- semantic/recent/rule retention;
- protected overflow/drop counts;
- fallback behavior;
- context hash/generation path health;
- no future participant leakage;
- rollback to legacy-v1 verified.

No new blind A/B generation experiment is required unless the implementation smoke exposes behavior that diverges from the evaluated policy.

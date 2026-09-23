# P7-04 fallback behavior

Two failure boundaries are intentionally distinct.

```text
query embedding / exact vector retrieval fails
  -> semantic retrieval status = fallback
  -> ranking_version = phase6-fallback
  -> Phase 6 canonical SQL context remains

exact semantic candidates succeed
but hybrid signal resolution/ranking fails
  -> semantic retrieval status remains ok
  -> ranking_version = semantic-only-fallback-v1
  -> exact semantic order is retained
```

An auxiliary ranking signal is never allowed to destroy an otherwise successful semantic retrieval.

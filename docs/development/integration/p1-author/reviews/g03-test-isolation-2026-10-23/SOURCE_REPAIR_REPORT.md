# G-03 repair

Initial reviewed HEAD: `3df13ed51476de3b0e97f7aa5aef63ce8a18e061`. Final tested source: `118ede77311fe160c7f0142cc237acf689a0b818`.

The actual live-suite `after()` ran after the isolation guard rejected `before()`. In the controlled RED, all three original denial scenarios attempted `deleteMany` and `countDocuments`. Mongo driver methods were intercepted before execution: no real database was contacted or mutated by those negative probes.

The local `cleanupAuthorized` flag starts false and becomes true only after awaited isolation validation resolves, before connection/index creation. The after hook gates both cleanup and its readback on that flag. The existing finally disconnect sequence, tracked recovery IDs and foreign-sentinel regression remain intact. No production source, guard, CI, FE or API behavior changed.

New negative tests spawn the actual live-suite file with Node's actual before/after hooks. A test-only preload intercepts driver operations, stubs PostgreSQL identity and records Mongo writes/reads plus disconnect calls. Child NODE_TEST_CONTEXT is cleared to start an independent test runner. Missing opt-in, forbidden PostgreSQL/MongoDB and either expected-identity mismatch reject while producing zero Mongo write/readback calls; Mongo close and both PG pool closes prove teardown ran. Child exit 1 is expected; parent assertions must exit 0. Ambient NODE_ENV=test and CI=true do not authorize cleanup.

Commits: `75f19c23` introduced the regression, `bc8c4b17` gated teardown, `118ede77` added the latest review's two expected-identity mismatch cases. The first commit's message describes the intended repair but contains regression files only; the guard fix is the following commit.

The definitive RED uses unchanged existing live-suite bytes from the reviewed HEAD and the new regression files (hashes and dirty-tree disclosure in red.json). GREEN commands run against the committed final source with no tracked modifications; only this new evidence directory was untracked. Historical evidence was not modified.

Harness setup attempts are retained separately: initial invocation used the wrong cwd; child-runner context and expected two PostgreSQL pool closes were then corrected. Those setup failures are not product RED or acceptance FAIL counts. The definitive red.log fails at the zero-write assertion itself.

The existing evidence-only native runner and observer were copied without semantic changes into this new directory. Each run allocates fresh named volumes/databases, uses explicit mutation opt-in, loopback endpoints and fake-only/no-provider configuration, then stops its own containers while preserving volumes. The final n2 run is authoritative; native/ belongs to the intermediate bc8c4b17 source and is not counted again.

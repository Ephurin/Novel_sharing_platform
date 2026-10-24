# RED provenance

The original three-case RED ran on reviewed HEAD 0de3fcf with production source unchanged and only the untracked focused test file added. red-test-snapshot.json records original bytes/hash, source SHA, status and empty production diff. Its PostgreSQL/Mongo resource instance is red-development-resources.json.

The additional three-case H-05 probes install only the exact historical PostgreSQL _persist_projection method via AST from git show 0de3fcf, over the current harness. They are method counterfactuals, not clean old-checkout acceptance. BASE_METHOD in the logs records the original blob hash; copied bootstrap scripts show the patch. The second probe adds read-only before/after SQL capture around the failed Canon acceptance; all three show unchanged=true. The original and augmented probe logs are both retained. They use the separate superseded-source-resources.json test database. No production file is changed by these probes.

Development failures/reruns and preliminary clean 79bfcebb acceptance are retained in separate directories. They are superseded by the final clean fd2f51a suites and do not inflate unique counts. Intermediate failures included fixture/version setup, legacy structural relation compatibility, a TypeScript optional test token and the label-stability edge repaired in the second source commit. No final-source acceptance failure remains.

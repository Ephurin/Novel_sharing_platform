"""Read-only promotion integrity checks. Run from repository root."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path.cwd()
OUT = Path(__file__).resolve().parent
MERGE = 'dd2f8003b0ad94e6097819cdca0249aa591f54fa'
SOURCE = 'fd2f51aaaaa7196a0fdab9e6bb2498c9b55ce5e9'
HEAD = '8b6bd15846cc2fea3cf67459ce94028d5ed49403'
BASE = '7fd6f71b388320e00408b7ea47c0998708c70a2c'
CHECKOUT = '82beb667f743c7f10ab9eb13fdea991fd7df3e63'
commands = []


def git(*args):
    result = subprocess.run(['git', *args], capture_output=True, cwd=ROOT)
    commands.append({'command':['git', *args], 'exit_code':result.returncode,
                     'stdout':result.stdout.decode('utf8'), 'stderr':result.stderr.decode('utf8')})
    assert result.returncode == 0, args
    return result.stdout.decode('utf8').strip()


parents = git('show', '-s', '--format=%P', MERGE).split()
assert parents == [BASE, HEAD]
git('merge-base', '--is-ancestor', SOURCE, MERGE)
git('merge-base', '--is-ancestor', BASE, MERGE)
tree = git('rev-parse', MERGE+'^{tree}')
assert tree == git('rev-parse', HEAD+'^{tree}') == git('rev-parse', CHECKOUT+'^{tree}')
evidence = 'docs/development/integration/p1-author/memory-entity-hitl/identity-final-hardening-2026-10-24/'
evidence_delta = git('diff', '--name-only', SOURCE, HEAD).splitlines()
assert evidence_delta and all(p.startswith(evidence) for p in evidence_delta)
assert not git('diff', '--name-only', SOURCE, MERGE, '--', 'ai-service', 'backend', 'web', '.github', 'docker-compose.yml')
assert not git('diff', '--name-only', BASE, MERGE, '--', 'ai-service/requirements.txt',
    'ai-service/migrations', 'backend/src/core/database/migrations', 'backend/package.json',
    'backend/package-lock.json', 'web/package.json', 'web/package-lock.json')
assert not git('diff', '--name-only', '--', 'web', 'backend', 'ai-service', '.github')
checks = {
    'revision_CAS_provenance':'backend/src/modules/novels/chapter-revisions.service.ts',
    'outbox_extraction_only':'backend/src/jobs/outbox-processor.ts',
    'owner_Canon_and_stale_Gateway':'backend/src/modules/ai/ai-gateway.controller.ts',
    'approved_memory_audit_guidance':'ai-service/api/entity_hitl_routes.py',
    'review_freeze_refresh_continue_dedup':'ai-service/application/entity_hitl.py',
    'provisional_groups':'ai-service/application/entity_review_service.py',
    'exact_ID_consumers':'ai-service/application/reviewed_inventory.py',
    'exact_ID_relationship_locks':'ai-service/domain/projection.py',
    'tenant_transactional_persistence':'ai-service/infrastructure/postgres_narrative_repository.py',
    'flag_default_OFF':'ai-service/core/settings.py',
}
blobs = {}
for invariant, path in checks.items():
    accepted = git('rev-parse', SOURCE+':'+path)
    merged = git('rev-parse', MERGE+':'+path)
    assert accepted == merged
    blobs[invariant] = {'path':path, 'source_blob':accepted, 'merge_blob':merged}
assert 'entity_candidate_verification_enabled: bool = False' in git('show', MERGE+':ai-service/core/settings.py')
assert 'Generic workers have no canon-approval authority' in git('show', MERGE+':backend/src/jobs/outbox-processor.ts')
record = {'merge':MERGE, 'parents':parents, 'tree':tree, 'ci_checkout':CHECKOUT,
    'ci_checkout_tree_identical':True, 'accepted_source_ancestor':True,
    'evidence_only_delta':evidence_delta, 'runtime_blobs':blobs,
    'dependencies_and_migrations_unchanged':True, 'FE_source_untouched':True}
(OUT/'integrity.json').write_text(json.dumps(record, indent=2), encoding='utf8')
(OUT/'integrity-commands.json').write_text(json.dumps(commands, indent=2), encoding='utf8')
print('Promotion ancestry, exact trees, 10 invariant blobs, dependencies/migrations and FE integrity: PASS')

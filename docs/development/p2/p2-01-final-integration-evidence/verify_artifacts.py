"""Reverify the exact combined-source CI archives; no database/provider calls."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from scripts.p8_rollback_readback import verify_readback

OUT = Path(__file__).parent / 'combined-4829acd7'
TREE = '74ede9a05f9e8926b20d940cd44181fdc3af41d4'
SYNTHETIC = '2ff9f237915b7f58b0825b5c8eef0e470624b43d'
DIGESTS = {'runtime': '59b4e502f44d6065deaedaa5632936b0b653c4bdcd8bd4b8bdf331b36c563c22',
           'rollback': '4508f647d555b9dfd18ff5dc297fe311bfb82522124d6b4e6d73565bb4f4a486'}
for name, expected in DIGESTS.items():
    assert hashlib.sha256((OUT / (name + '.zip')).read_bytes()).hexdigest() == expected
summary = {'head_sha': '4829acd7ce6403d34bc0eb819c9d50059fd4d5a2',
           'ci_checkout': SYNTHETIC, 'tree': TREE, 'artifact_sha256': DIGESTS}
with ZipFile(OUT / 'runtime.zip') as z:
    assert z.read('source-sha.txt').decode().strip() == SYNTHETIC
    assert z.read('source-tree.txt').decode().strip() == TREE
    for name, count in [('focused', 23), ('a16', 15)]:
        xml = ET.fromstring(z.read(name + '.xml'))
        cases = xml.findall('.//testcase')
        assert len(cases) == count
        assert not xml.findall('.//failure') and not xml.findall('.//error') and not xml.findall('.//skipped')
        summary[name + '_pass'] = count
    pg = json.loads(z.read('postgres-identity.json'))
    mongo = json.loads(z.read('mongo-identity.json'))
    assert pg['database'] == mongo['database'] == 'p2a'
    summary.update(postgres=pg, mongo=mongo)
    readbacks = []
    for line in z.read('a16.log').decode().splitlines():
        token = 'P2A_PG_READBACK '
        if token in line:
            readbacks.append(json.loads(line.split(token, 1)[1]))
    pairs = {'active-before-idea':'active-after-idea', 'active-before-manuscript':'active-after-manuscript',
             'replay-before':'replay-after', 'racing-before':'racing-after-rejections',
             'scope-before':'scope-after', 'unsupported-and-foreign-before':'unsupported-and-foreign-after',
             'older-activation-before':'older-activation-after', 'manuscript-replay-before':'manuscript-replay-after',
             'review-gate-before-pending':'review-gate-after-pending', 'review-gate-before-missing':'review-gate-after-missing'}
    indexed = {(r['novel_id'],r['stage']):r['data'] for r in readbacks}
    checks = 0
    for r in readbacks:
        if r['stage'] in pairs:
            assert r['data'] == indexed[(r['novel_id'], pairs[r['stage']])]
            checks += 1
        assert r['data']['events'] == []
        if r['stage'] == 'racing-finalized':
            assert len(r['data']['bootstrap_jobs']) == len(r['data']['analysis_runs']) == len(r['data']['proposals']) == 1
    assert checks == 12
    summary.update(a16_readbacks=len(readbacks), a16_exact_negative_pairs=checks, setup_events=0)
    gateway = json.loads(z.read('gateway-readbacks.json'))
    requests = gateway['requests']
    assert len(requests) == 17
    summary['gateway_status_counts'] = {str(code):sum(r['status']==code for r in requests) for code in [200,401,403,404,409]}
    assert summary['gateway_status_counts'] == {'200':1,'401':4,'403':4,'404':4,'409':4}
    states = {r['stage']:r['data'] for r in gateway['readbacks']}
    for kind in ['P1','setup']:
        for entry in ['idea','manuscript']:
            assert states['active-'+kind+'-before'] == states['rejected-'+entry+'-'+kind]
    after = states['normal-P1-save-after-rejections']
    assert len(after['revisions']) == 2 and len(after['outbox']) == 1
    assert after['outbox'][0]['status'] == 'COMPLETED'
    assert after['mongo'][0]['version'] == 2
    assert after['story_brains'][0]['status'] == 'active'
    assert str(after['story_brains'][0]['brain_version']) == '5'
    before = states['active-P1-before']
    original = before['revisions'][0]
    assert next(r for r in after['revisions'] if r['revision_id']==original['revision_id']) == original
    revision = next(r for r in after['revisions'] if r['revision_id']!=original['revision_id'])
    assert hashlib.sha256(revision['content'].encode()).hexdigest() == revision['content_hash']
    assert revision['source_type'] == 'AUTHOR_MANUAL' and revision['source_generation_id'] is None
    assert after['chapters'][0]['latest_revision_id'] == revision['revision_id']
    assert after['outbox'][0]['revision_id'] == revision['revision_id']
    assert after['outbox'][0]['content_hash'] == revision['content_hash']
    assert after['outbox'][0]['event_type'] == 'INCREMENTAL_ANALYSIS'
    assert after['mongo'][0]['content'] == revision['content']
    for table in ['entities','events','facts','state_transitions','relationships','current_entity_states','decisions']:
        assert after[table] == before[table]
    summary.update(immutable_original_preserved=True, revision_hash_verified=revision['content_hash'],
                   outbox_revision_link_verified=True, approved_canon_unchanged=True)
    summary.update(gateway_exact_negative_pairs=4, revisions_after=2, outbox_after=1,
                   mongo_version_after=2, canon_version_after=5)
    assert 'LLM_PROVIDER=fake' in z.read('provider-config.txt').decode()
    assert 'EMBEDDING_PROVIDER=fake' in z.read('provider-config.txt').decode()
with ZipFile(OUT / 'rollback.zip') as z:
    source = json.loads(z.read('source-readback.json'))
    after = json.loads(z.read('source-after-readback.json'))
    restored = json.loads(z.read('restore-readback.json'))
    verify_readback(after, source, require_raw=True)
    verify_readback(restored, source)
    assert z.read('source-alembic.txt') == z.read('restore-alembic.txt')
    assert z.read('source-vector.txt') == z.read('restore-vector.txt')
    digest = z.read('p8-rehearsal.dump.sha256').decode().split()[0]
    assert hashlib.sha256(z.read('p8-rehearsal.dump')).hexdigest() == digest
    assert z.read('incompatible-exit.txt').decode().strip() == '1'
    raw = json.loads(z.read('source-after-summary.json'))
    assert raw['raw_comparison'] == 'PASS'
    summary.update(rollback_raw_source_unchanged=True, rollback_tables=len(source['tables']),
                   rollback_backup_sha256=digest, rollback_raw_sha256=raw['raw_sha256'],
                   rollback_normalized_sha256=raw['sha256'],
                   rollback_migration=z.read('source-alembic.txt').decode().strip(),
                   rollback_vector=z.read('source-vector.txt').decode().strip())
(OUT / 'verified-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8', newline='\n')
print(json.dumps(summary, indent=2))

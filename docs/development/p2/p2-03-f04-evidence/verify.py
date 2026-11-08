"""Verify archived F04 evidence without a database or provider.

Usage: python docs/development/p2/p2-03-f04-evidence/verify.py fixed-f070af66.zip
Artifacts contain synthetic secret markers intentionally, as provider proof.
"""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parent


def rows(archive, marker):
    return [json.loads(line.split(marker, 1)[1]) for line in archive.read('a16.log').decode().splitlines() if marker in line]


baseline_path=root/'baseline-53cd695e.zip'
assert hashlib.sha256(baseline_path.read_bytes()).hexdigest()=='88ee335be96e0c62433535ef8fe79708820a5374223826a25102f79391e86f1b'
with zipfile.ZipFile(baseline_path) as z:
    baseline=rows(z,'F04_BASELINE ')
    assert len(baseline)==6
    assert all(r['provider_calls']==1 and r['status']=='completed' for r in baseline)
    unauthorized=[r for r in baseline if r['creator'] in (None,'00000000-0000-0000-0000-000000000099','foreign-manual')]
    assert len(unauthorized)==3 and all(r['legacy_marker_in_exact_provider_payload'] for r in unauthorized)
    baseline_checkout=z.read('source-sha.txt').decode().strip()

if len(sys.argv)==1:
    print(json.dumps(dict(baseline_checkout=baseline_checkout,confirmed_unauthorized_provider_payloads=len(unauthorized))))
    sys.exit(0)

path=root/sys.argv[1]
rollback=root/'rollback-f070af66.zip'
assert hashlib.sha256(rollback.read_bytes()).hexdigest()=='6e65c8549a3efea833f9c21e0cb3ad9dc328d5474d7d663040af9e8647fb1cf2'
with zipfile.ZipFile(rollback) as z:
    for line in z.read('readbacks.sha256').decode().splitlines():
        checksum,name=line.split()
        assert hashlib.sha256(z.read(name.rsplit('/',1)[-1])).hexdigest()==checksum
    assert z.read('source-readback.json')==z.read('source-after-readback.json')
    before=json.loads(z.read('source-readback-summary.json'))
    restored=json.loads(z.read('restore-readback-summary.json'))
    assert before['sha256']==restored['sha256'] and restored['comparison']=='PASS'
    assert z.read('source-vector.txt')==z.read('restore-vector.txt')
    assert '0017' in z.read('source-alembic.txt').decode()
with zipfile.ZipFile(path) as z:
    results=rows(z,'F04_WORKER ')
    sql={r['stage']:r['data'] for r in rows(z,'P2A_PG_READBACK ') if r['stage'].startswith('f04-')}
    assert len(results)==20,len(results)
    blocked=completed=0
    for row in results:
        job=row['job']
        assert row['canonical_before_sha256']==row['canonical_after_sha256']
        assert row['platform_before']==row['platform_after']
        platform=row['platform_after']
        raw=sql['f04-after-'+row['case']]
        assert len(raw['entities'])==1 and raw['entities'][0]['private_author_notes']=='F04SetupPrivateOnly'
        assert len(raw['facts'])==1 and raw['facts'][0]['fact_key']=='setup_rule'
        reconstructed={k:v for k,v in raw.items() if k!='writing_generations'}
        reconstructed.update(platform)
        assert hashlib.sha256(json.dumps(reconstructed,sort_keys=True).encode()).hexdigest()==row['canonical_after_sha256']
        assert len(platform['chapter_revisions'])==1 and platform['revision_outbox_events']==[]
        assert platform['mongo']['database']=='p2a' and len(platform['mongo']['rows'])==1
        if job['stage']=='security_blocked':
            blocked+=1
            assert row['provider_calls']==0 and row['payloads']==[] and job['context_hash']==''
            assert job['error']['code']=='WRITING_CONTEXT_AUTHORITY_DENIED'
            assert not job['draft'] and not job['patch']
            encoded=json.dumps(job)
            assert all(m not in encoded for m in ('LegacyTitlePrivate','LegacyDescriptionPrivate','LegacyPrivateOnly','LegacyOutlinePrivate','F04RootPrivateOnly','F04PlannedOnly','F04SetupPrivateOnly'))
        else:
            completed+=1
            assert job['status']=='completed' and row['provider_calls']==1 and len(row['payloads'])==1
            context=row['payloads'][0]['context_package']
            assert 'F04RootPrivateOnly' not in json.dumps(context)
            assert 'F04SetupPrivateOnly' not in json.dumps(row['payloads'])
            if row['case']=='no-plan':assert context.get('current_objective') is None
            else:assert context['current_objective']['authority_lane']=='FUTURE_PLAN'
    assert (blocked,completed)==(17,3),(blocked,completed)
    cases=[t for t in ET.fromstring(z.read('a16.xml')).iter('testcase') if 'test_writing_plan_authority_postgres' in t.attrib.get('classname','')]
    assert len(cases)==29,len(cases)
    assert all(t.find('failure') is None and t.find('error') is None and t.find('skipped') is None for t in cases)
    print(json.dumps(dict(artifact=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),checkout=z.read('source-sha.txt').decode().strip(),tree=z.read('source-tree.txt').decode().strip(),f04_tests=len(cases),durable_worker_readbacks=len(results),blocked=blocked,authorized_provider_calls=completed,mongo='real p2a',canon_revision_outbox_unchanged=True),indent=2))

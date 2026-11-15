"""Verify actual M0/Core Writer SQL+Mongo evidence from a feature artifact.

Usage: python docs/development/p2/p2-04-evidence/verify.py path/to/artifact.zip
Raw fixture source/notes are synthetic security evidence, not operational logs.
"""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

path=Path(sys.argv[1])
rollback=Path(__file__).resolve().parent/'rollback-c5b54448.zip'
assert hashlib.sha256(rollback.read_bytes()).hexdigest()=='7a578115f77a2b22a454e6bad87430394f2d0e679cf8501077fd30373c4d4fe2'
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
    evidence=json.loads(z.read('m0-writer-readbacks.json'))
    assert evidence['providers']=='fake only'
    rows=evidence['readbacks']
    assert len(rows)>=20
    def canonical(data):
        return json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()
    for item in rows:
        assert hashlib.sha256(canonical(item['data'])).hexdigest()==item['sha256'],item['stage']
    def stage(name):
        found=[r['data'] for r in rows if r['stage']==name]
        assert len(found)==1,(name,len(found))
        return found[0]
    for item in [r for r in rows if r['stage']=='M0-active']:
        m0=item['data']
        assert m0['story_brains'][0]['status']=='active' and m0['story_brains'][0]['baseline_revision_id'] is None
        job=m0['bootstrap_jobs'][0]
        assert job['status']=='completed' and job['stage']=='m0_active'
        receipt=job['result']['setup_activation']['response']
        assert receipt['contract_version']=='setup-m0-v1' and receipt['baseline_kind']=='M0'
        assert receipt['snapshot_id']==job['id'] and receipt['brain_id']==m0['story_brains'][0]['id']
        for table in ('revisions','outbox','events','entity_mentions','state_transitions','revision_provenances','mongo','story_plans'):
            assert m0[table]==[],(item['stage'],table)
        assert len(m0['entities'])==1 and len(m0['facts'])==1
        assert m0['entities'][0]['static_attributes']['mentions']==0
        assert m0['facts'][0]['chapter_number'] is None and m0['facts'][0]['source_revision_id'] is None
        prior=next(r['data'] for r in rows if r['stage']=='denied-activation-unchanged' and r['novel_id']==item['novel_id'])
        for key in m0:
            if key not in ('story_brains','bootstrap_jobs'):assert m0[key]==prior[key],key
        replay=next(r['data'] for r in rows if r['stage']=='M0-replay' and r['novel_id']==item['novel_id'])
        assert replay==m0
    assert len([r for r in rows if r['stage']=='M0-active'])==2
    first=stage('M-FIRST-saved')
    assert len(first['revisions'])==len(first['outbox'])==1
    revision=first['revisions'][0]
    assert revision['source_type']=='AUTHOR_MANUAL' and revision['parent_revision_id'] is None
    assert first['story_brains'][0]['baseline_revision_id'] is None and first['events']==[]
    run=next(r for r in first['analysis_runs'] if r['operation']=='incremental_story_analysis')
    assert run['entity_candidate_audit']['status']=='waiting_entity_review'
    assert len(first['story_plans'])==2 and any(p['status']=='active' for p in first['story_plans'])
    assert len(stage('M-FIRST-identical-retry')['revisions'])==1
    assert stage('M-FIRST-before-author-Canon')['events']==[]
    canon=stage('M-FIRST-author-approved-Canon')
    assert canon['events'] and 'FutureOnlyBetrayal' not in json.dumps(canon['events'])
    for event in canon['events']:
        assert event['chapter_number']==first['chapters'][0]['chapter_number']==1
        evidence_spans=event['event_metadata']['evidence']
        assert evidence_spans
        for span in evidence_spans:
            assert span['revision_id']==revision['revision_id'] and span['chapter_id']==revision['chapter_id']
            assert span['text_hash']==revision['content_hash'] and span['chapter_number']==1
            assert 0<=span['start']<span['end']<=len(revision['content'])
            assert span['quote']==revision['content'][span['start']:span['end']]
    assert len(stage('failed-outbox-rollback')['revisions'])==1
    repaired=stage('outbox-reconciled')
    assert len(repaired['revisions'])==len(repaired['outbox'])==2
    assert repaired['revisions'][1]['parent_revision_id']==revision['revision_id']
    assert len(stage('concurrent-CAS')['revisions'])==3
    for name,count in [('meaningful-create-and-retry',1),('real-AI-accept-after-genuine-base',2),('AI-accept-exact-retry',2),('AI-stale-accept-no-write',2),('partial-provenance-no-auto-revision',2),('legacy-active-null-no-marker',2),('create-after-provenance-restored',3),('create-Mongo-failure',3),('create-Mongo-reconciled',4)]:
        assert len(stage(name)['revisions'])==count,name
    accepted=stage('real-AI-accept-after-genuine-base')['revisions']
    assert accepted[1]['source_type']=='AI_DRAFT_ACCEPT' and accepted[1]['parent_revision_id']==accepted[0]['revision_id']
    assert accepted[1]['source_generation_id']
    final=stage('create-Mongo-reconciled')
    assert len(final['chapters'])==len(final['mongo'])==3 and len(final['outbox'])==4
    assert all(o['status']=='COMPLETED' for o in final['outbox'])
    seen={}
    for item in rows:
        for r in item['data']['revisions']:
            assert hashlib.sha256(r['content'].encode()).hexdigest()==r['content_hash']
            assert r['source_type'] in ('AUTHOR_MANUAL','AI_DRAFT_ACCEPT')
            if r['revision_id'] in seen:assert seen[r['revision_id']]==r
            seen[r['revision_id']]=r
    cases=[t for t in ET.fromstring(z.read('a16.xml')).iter('testcase') if 'test_setup_activation_postgres' in t.attrib.get('classname','')]
    assert len(cases)==26,len(cases)
    assert all(all(t.find(tag) is None for tag in ('failure','error','skipped')) for t in cases)
    for name in ('ai-service.log','setup-gateway.log','m0-ai-service.log','m0-writer.log'):
        value=z.read(name).decode()
        assert all(m not in value for m in ('PrivateOnly','ConstraintOnly','M0PrivateOnly','private_author_notes','author_constraints')),name
    print(json.dumps(dict(artifact=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),checkout=z.read('source-sha.txt').decode().strip(),tree=z.read('source-tree.txt').decode().strip(),m0_pg_cases=len(cases),durable_readbacks=len(rows),genuine_immutable_revisions=len(seen),verified_m0_without_history=True,first_save_existing_writer_hitl=True,private_operational_logs_absent=True),indent=2))

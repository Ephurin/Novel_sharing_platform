"""Offline independent verification of source-1780aaf2 CI archives; no DB/provider calls."""
from pathlib import Path
from zipfile import ZipFile
import hashlib,json,sys
import xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[4]))
from scripts.p8_rollback_readback import verify_readback

root=Path(__file__).parent
hashes={'source-1780aaf2.zip':'2800a01b38068ff65001dfb45e607e86296b32793b5af10d2903b8fbc32557b8',
        'rollback-1780aaf2.zip':'767a715c812d52cfb15c0370f6d71ccdcec5981f7ca2e72f8ddf5f4b1cf5a5b6',
        'initial-252a8e1e.zip':'d4e5b518fda65265981ddc6d03eb847c34dabb04adafb0958cc287eb3aea6f8c'}
for name,digest in hashes.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest
summary=dict(source='1780aaf2619e83a5d0896ef4daa655df65069da2',
    checkout='3d8479c6d7285b7a69d5469a0fa12c4568ba1619',tree='4144e442657ebb9ac3cace827323bd5c83d864ec',sha256=hashes)
with ZipFile(root/'source-1780aaf2.zip') as z:
    assert z.read('source-sha.txt').decode().strip()==summary['checkout']
    assert z.read('source-tree.txt').decode().strip()==summary['tree']
    for name,count in [('focused',46),('a16',25)]:
        xml=ET.fromstring(z.read(name+'.xml'))
        cases=xml.findall('.//testcase')
        assert len(cases)==count
        assert not xml.findall('.//failure') and not xml.findall('.//error') and not xml.findall('.//skipped')
        summary[name+'_pass']=count
    summary['setup_sql_pass']=sum('test_setup_v1_postgres' in c.get('classname','') for c in cases)
    assert summary['setup_sql_pass']==9
    summary['postgres']=json.loads(z.read('postgres-identity.json'))
    summary['mongo']=json.loads(z.read('mongo-identity.json'))
    assert summary['postgres']['database']==summary['mongo']['database']=='p2a'
    assert 'LLM_PROVIDER=fake' in z.read('provider-config.txt').decode()
    assert 'EMBEDDING_PROVIDER=fake' in z.read('provider-config.txt').decode()
    readbacks=[json.loads(line.split('SETUP_DB_READBACK ',1)[1]) for line in z.read('a16.log').decode().splitlines() if 'SETUP_DB_READBACK ' in line]
    indexed={(r['novel_id'],r['stage']):r for r in readbacks}
    pairs={'replay-before':'replay-after','failure-before-rejections':'failure-after-rejections',
        'legacy-authority-before':'legacy-authority-after','immutable-before':'immutable-after',
        'active-before':'active-after','provider-before-stale':'provider-after-stale',
        'running-before-conflict':'running-after-conflict'}
    checks=0; sources={}
    for r in readbacks:
        if r['stage'] in pairs:
            assert r['sha256']==indexed[(r['novel_id'],pairs[r['stage']])]['sha256'];checks+=1
        for name in ['events','entities','facts','state_transitions','entity_mentions','revision_provenances']:
            assert r['counts'][name]==0
        for source in r['snapshots']:
            key=source['snapshot_id'];value={k:v for k,v in source.items() if k!='status'}
            assert source['setup_version']>=1 and len(source['setup_hash'])==len(source['text_hash'])==64
            if key in sources:assert sources[key]==value
            sources[key]=value
    assert checks==7
    summary.update(setup_readbacks=len(readbacks),setup_exact_negative_pairs=checks,
                   immutable_snapshot_metadata=len(sources),setup_history_rows=0)
    gateway=json.loads(z.read('setup-gateway-readbacks.json'))
    states={r['stage']:r for r in gateway if 'stage' in r}
    assert states['accepted-snapshot-before-rejections']['sha256']==states['after-rejections']['sha256']
    assert gateway[-1]['homonym_candidate_ids_distinct'] and gateway[-1]['private_readbacks_redacted']
    assert gateway[-1]['failed_source_preserved'] and gateway[-1]['source_version']==2
    summary['setup_gateway_statuses']=[r['status'] for r in gateway if 'status' in r]
    assert 401 in summary['setup_gateway_statuses'] and 403 in summary['setup_gateway_statuses']
    assert 409 in summary['setup_gateway_statuses'] and 422 in summary['setup_gateway_statuses'] and 503 in summary['setup_gateway_statuses']
    for name,count in [('gateway-forwarding',19),('gateway-a16',1),('setup-gateway',1),('setup-browser',1)]:
        log=z.read(name+'.log').decode()
        assert f'# pass {count}' in log and '# fail 0' in log and '# skipped 0' in log
        summary[name+'_pass']=count
    p1=json.loads(z.read('gateway-readbacks.json'))
    states={r['stage']:r['data'] for r in p1['readbacks']}
    for kind in ['P1','setup']:
        for entry in ['idea','manuscript']:
            assert states['active-'+kind+'-before']==states['rejected-'+entry+'-'+kind]
    before=states['active-P1-before'];after=states['normal-P1-save-after-rejections']
    original=before['revisions'][0]
    assert next(r for r in after['revisions'] if r['revision_id']==original['revision_id'])==original
    revision=next(r for r in after['revisions'] if r['revision_id']!=original['revision_id'])
    assert hashlib.sha256(revision['content'].encode()).hexdigest()==revision['content_hash']
    assert revision['source_type']=='AUTHOR_MANUAL'
    assert len(after['outbox'])==1
    event=after['outbox'][0]
    assert event['revision_id']==revision['revision_id'] and event['content_hash']==revision['content_hash']
    assert event['status']=='COMPLETED' and event['event_type']=='INCREMENTAL_ANALYSIS'
    assert after['mongo'][0]['version']==2 and after['mongo'][0]['content']==revision['content']
    for table in ['entities','events','facts','state_transitions','relationships','current_entity_states','decisions']:
        assert after[table]==before[table]
    assert str(after['story_brains'][0]['brain_version'])=='5'
    summary.update(p1_revision_hash=revision['content_hash'],p1_immutable_original_unchanged=True,
        p1_outbox_linked=True,approved_canon_unchanged=True)
with ZipFile(root/'rollback-1780aaf2.zip') as z:
    source=json.loads(z.read('source-readback.json'))
    verify_readback(json.loads(z.read('source-after-readback.json')),source,require_raw=True)
    verify_readback(json.loads(z.read('restore-readback.json')),source)
    assert z.read('source-alembic.txt')==z.read('restore-alembic.txt')
    assert z.read('source-vector.txt')==z.read('restore-vector.txt')
    digest=z.read('p8-rehearsal.dump.sha256').decode().split()[0]
    assert hashlib.sha256(z.read('p8-rehearsal.dump')).hexdigest()==digest
    assert z.read('incompatible-exit.txt').decode().strip()=='1'
    summary.update(rollback_raw_source_unchanged=True,rollback_tables=len(source['tables']),
        rollback_backup_sha256=digest,migration=z.read('source-alembic.txt').decode().strip(),
        vector=z.read('source-vector.txt').decode().strip())
(root/'verified-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(summary,indent=2))

"""Offline independent verification of source-2f8ce3ac CI archives; no DB/provider calls."""
from pathlib import Path
from zipfile import ZipFile
import hashlib,json,sys
import xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[4]))
from scripts.p8_rollback_readback import verify_readback

root=Path(__file__).parent
hashes={'source-2f8ce3ac.zip':'4128af20a94577cde7eeca60b162b0ff3d1f20ea178f3a38667c2a3c4deb4a7f',
        'rollback-2f8ce3ac.zip':'cebf2096b47eb2fa12038f1029c187490eb814e813f8be6438b9b20288c9faea',
        'initial-edf1397e.zip':'17cca518556416365d6a43b21e7dc5d8ac39e67696d22287244ddb1d1aee60d2'}
for name,digest in hashes.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest
summary=dict(source='2f8ce3ac82a1c438a3d5ae402a32f394af70b8e5',
    checkout='76fb22105f633dbd6ab22fa6293269ad37a5cb9c',tree='d05da2742635df48e0842d3aaf26fa795c8aa39f',sha256=hashes)
with ZipFile(root/'source-2f8ce3ac.zip') as z:
    assert z.read('source-sha.txt').decode().strip()==summary['checkout']
    assert z.read('source-tree.txt').decode().strip()==summary['tree']
    for name,count in [('focused',46),('a16',31)]:
        xml=ET.fromstring(z.read(name+'.xml'))
        cases=xml.findall('.//testcase')
        assert len(cases)==count
        assert not xml.findall('.//failure') and not xml.findall('.//error') and not xml.findall('.//skipped')
        summary[name+'_pass']=count
    summary['setup_sql_pass']=sum('test_setup_v1_postgres' in c.get('classname','') for c in cases)
    assert summary['setup_sql_pass']==9
    summary['author_scope_sql_pass']=sum('test_setup_author_scope_postgres' in c.get('classname','') for c in cases)
    assert summary['author_scope_sql_pass']==6
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
        'running-before-conflict':'running-after-conflict',
        'owner-service-before':'owner-service-after','owner-http-before':'owner-http-after',
        'dev-auth-before':'dev-auth-after','private-error-before':'private-error-after',
        'owner-activation-before':'owner-activation-after'}
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
    assert checks==12
    summary.update(setup_readbacks=len(readbacks),setup_exact_negative_pairs=checks,
                   immutable_snapshot_metadata=len(sources),setup_history_rows=0)
    lines=z.read('a16.log').decode().splitlines()
    negatives=[json.loads(line.split('SETUP_SCOPE_HTTP ',1)[1]) for line in lines if 'SETUP_SCOPE_HTTP ' in line]
    assert len(negatives)==45
    assert len({r['case'] for r in negatives})==9
    for r in negatives:
        expected={'foreign':404,'missing-author':404 if '/jobs/' in r['path'] else 401,
            'contradictory-user':403,'contradictory-actor':403,'cross-tenant':403,
            'malformed-author':422,'forged-admin':404,'forged-service':403,'missing-service':401}[r['case']]
        assert r['status']==expected
    assert sum('SETUP_SCOPE_PROVIDER_CALLS 0' in line for line in lines)==6
    scan=json.loads(z.read('private-log-scan.json'))
    assert sorted(scan['checked'])==['ai-service.log','setup-gateway.log'] and scan['private_markers_absent']
    for name in scan['checked']:
        assert not any(marker in z.read(name).decode() for marker in ['PrivateOnly','ConstraintOnly','private_author_notes','author_constraints'])
    summary.update(author_scope_negative_requests=45,provider_zero_dispatch_checks=6,
        private_operational_logs_verified=scan['checked'],job_denial_nonexistence_equivalence=True)
    gateway=json.loads(z.read('setup-gateway-readbacks.json'))
    states={r['stage']:r for r in gateway if 'stage' in r}
    assert states['accepted-snapshot-before-rejections']['sha256']==states['after-rejections']['sha256']
    assert gateway[-1]['homonym_candidate_ids_distinct'] and gateway[-1]['private_readbacks_redacted']
    assert gateway[-1]['failed_source_preserved'] and gateway[-1]['source_version']==2
    summary['setup_gateway_statuses']=[r['status'] for r in gateway if 'status' in r]
    summary['gateway_setup_requests']=len(summary['setup_gateway_statuses'])
    assert summary['gateway_setup_requests']==37
    assert 401 in summary['setup_gateway_statuses'] and 403 in summary['setup_gateway_statuses']
    assert 409 in summary['setup_gateway_statuses'] and 422 in summary['setup_gateway_statuses'] and 503 in summary['setup_gateway_statuses']
    for name,count in [('gateway-forwarding',19),('gateway-a16',1),('setup-gateway',1),('setup-browser',3)]:
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
with ZipFile(root/'rollback-2f8ce3ac.zip') as z:
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

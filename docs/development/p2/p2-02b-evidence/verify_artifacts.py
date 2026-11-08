"""Offline independent verification of source-b0abca02 CI archives; no DB/provider calls."""
from pathlib import Path
from zipfile import ZipFile
import hashlib,json,sys
import xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[4]))
from scripts.p8_rollback_readback import verify_readback

root=Path(__file__).parent
hashes={'source-b0abca02.zip':'c6a2ffb010beab26c55619116ba4685ab1d1e72dc21beb632da3fa9451e6914c',
        'rollback-b0abca02.zip':'832040fae6798fc28b04f691394067f71c46539c6c06f8b37aa662f2404fb697',
        'initial-cf1941ae.zip':'ad7b41328c76cee6138281c733ea979bf526d5f7ce47488d10b15433dbbe0f4a'}
for name,digest in hashes.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest
summary=dict(source='b0abca026824ed4df83aba99df33c8126b8dce50',
    checkout='426b23e1ee4b2603584eac3eb8801005717bf4c7',tree='249152b719c51be0ea7d7b3b28b2e68dd77c7cca',sha256=hashes)
with ZipFile(root/'source-b0abca02.zip') as z:
    assert z.read('source-sha.txt').decode().strip()==summary['checkout']
    assert z.read('source-tree.txt').decode().strip()==summary['tree']
    for name,count in [('focused',46),('a16',59)]:
        xml=ET.fromstring(z.read(name+'.xml'))
        cases=xml.findall('.//testcase')
        assert len(cases)==count
        assert not xml.findall('.//failure') and not xml.findall('.//error') and not xml.findall('.//skipped')
        summary[name+'_pass']=count
    summary['setup_sql_pass']=sum('test_setup_v1_postgres' in c.get('classname','') for c in cases)
    assert summary['setup_sql_pass']==9
    summary['author_scope_sql_pass']=sum('test_setup_author_scope_postgres' in c.get('classname','') for c in cases)
    assert summary['author_scope_sql_pass']==6
    summary['review_sql_pass']=sum('test_setup_review_postgres' in c.get('classname','') for c in cases)
    assert summary['review_sql_pass']==28
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
    assert summary['gateway_setup_requests']==46
    assert 401 in summary['setup_gateway_statuses'] and 403 in summary['setup_gateway_statuses']
    assert 409 in summary['setup_gateway_statuses'] and 422 in summary['setup_gateway_statuses'] and 503 in summary['setup_gateway_statuses']
    for name,count in [('gateway-forwarding',19),('gateway-a16',1),('setup-gateway',1),('setup-browser',4)]:
        log=z.read(name+'.log').decode()
        assert f'# pass {count}' in log and '# fail 0' in log and '# skipped 0' in log
        summary[name+'_pass']=count
    assert states['review-negative-after']['sha256']==states['after-rejections']['sha256']
    assert states['review-materialized']['sha256']==states['review-idempotent-after']['sha256']
    assert states['review-materialized']['counts']['entities']==states['review-materialized']['counts']['facts']==1
    for table in ['events','state_transitions','revision_provenances','outbox','revisions','mongo']:
        assert states['review-materialized']['counts'][table]==0
    raw=[json.loads(l.split('P2A_PG_READBACK ',1)[1]) for l in z.read('a16.log').decode().splitlines() if 'P2A_PG_READBACK ' in l]
    review=[r for r in raw if r['stage'].startswith('review-') and not r['stage'].startswith('review-gate-')]
    index={(r['novel_id'],r['stage']):r['data'] for r in review}
    def only(stage):
        values=[r['data'] for r in review if r['stage']==stage]
        assert len(values)==1,stage
        return values[0]
    negative_pairs=[]
    for r in review:
        if r['stage'].startswith('review-negative-before-'):
            after=r['stage'].replace('-before-','-after-')
            assert r['data']==index[(r['novel_id'],after)]
            negative_pairs.append([r['stage'],after])
    assert len(negative_pairs)==13
    for before,after in [('review-http-negative-before','review-http-negative-after'),('review-foreign-id-before','review-foreign-id-after'),
            ('review-superseded-before','review-superseded-after'),('review-empty-before','review-empty-after'),
            ('review-reused-id-before','review-reused-id-after'),('review-reused-id-before','review-locked-edit-after'),
            ('review-shape-before','review-shape-after'),('review-cross-tenant-id-before','review-cross-tenant-id-after')]:
        assert only(before)==only(after);negative_pairs.append([before,after])
    original,accepted=only('review-raw-before'),only('review-committed')
    for field in ['setup_source','original_model_output','setup_cards','setup_hash','provisional_scope']:
        assert original['bootstrap_jobs'][0]['result'][field]==accepted['bootstrap_jobs'][0]['result'][field]
    assert [p['payload'] for p in original['proposals']]==[p['payload'] for p in accepted['proposals']]
    assert accepted==only('review-exact-replay')==only('review-conflict-unchanged')
    assert len(accepted['decisions'])==3 and len(accepted['entities'])==2 and len(accepted['facts'])==1
    assert all(d['edited_payload']['provenance']['setup_hash']==accepted['bootstrap_jobs'][0]['result']['setup_hash'] for d in accepted['decisions'])
    for r in review:
        for table in ['events','state_transitions','entity_mentions','revision_provenances','current_entity_states']:
            assert not r['data'][table],(r['stage'],table)
    for stage in ['review-concurrent-final','review-concurrent-exact-replay']:
        value=only(stage)
        assert len(value['decisions'])==3 and len(value['entities'])==2 and len(value['facts'])==1
        assert len({e['id'] for e in value['entities']})==2
        assert {e['canonical_name'] for e in value['entities']}=={'Minh'}
        assert value['bootstrap_jobs'][0]['result']['review_version']==1
    value=only('review-location-subject')
    assert {e['entity_type'] for e in value['entities']}=={'character','location'}
    assert value['facts'][0]['subject_entity_id'] in {e['id'] for e in value['entities']}
    for stage,origin in [('review-committed','author_setup'),('review-blueprint-origin','model_suggestion')]:
        value=only(stage)
        assert all(e['source_type']==origin and e['static_attributes']['mentions']==0 for e in value['entities'])
        assert all(f['source_type']==origin and f['fact_type']=='world_rule' and f['chapter_number'] is None and f['source_revision_id'] is None for f in value['facts'])
    value=only('review-p1-type-reuse')
    assert len(value['entities'])==1 and value['entities'][0]['entity_type']=='PER' and value['entities'][0]['is_locked']
    assert value['entities'][0]['source_type']=='AI'
    assert only('review-mixed-final')['bootstrap_jobs'][0]['result']['setup_review']['response']['unresolved_proposal_ids']
    assert not only('review-all-rejected')['entities'] and not only('review-all-rejected')['facts']
    hashes=[dict(novel_id=r['novel_id'],stage=r['stage'],sha256=hashlib.sha256(json.dumps(r['data'],sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),
        counts={k:len(v) for k,v in r['data'].items()}) for r in review]
    (root/'review-readback-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8')
    assert z.read('review-ui.png')==(root/'review-ui.png').read_bytes()
    summary.update(review_readbacks=len(review),review_negative_pairs=len(negative_pairs),review_source_immutable=True,
        review_concurrent_once=True,review_exact_replay=True,review_zero_history=True,review_gateway_negative_hash_equal=True,
        review_gateway_replay_hash_equal=True)
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
with ZipFile(root/'rollback-b0abca02.zip') as z:
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

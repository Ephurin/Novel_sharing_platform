"""Offline independent verification of source-caacaf67 CI archives; no DB/provider calls."""
from pathlib import Path
from zipfile import ZipFile
import hashlib,json,sys
import xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[4]))
from scripts.p8_rollback_readback import verify_readback

root=Path(__file__).parent
hashes={'source-caacaf67.zip':'c3bba1389811076e87f21ff11ece30c85e039adff33f6d049b7cb4eee1633259',
        'rollback-caacaf67.zip':'627a6ebf372490e58c850cb8090d799f27b79d4038a20984b6b933de03e23219',
        'initial-3bd9cb04.zip':'fa6a052b1ca86ab428b7e03ec71427da9186816a4fde11e9eae5c37588828282'}
hashes['fixture-7aa7d290.zip']='1ad40edd3880d322c071c49e17f8f9ccb3ec5223b4c96909f0895d13b0b95868'
for name,digest in hashes.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest
summary=dict(source='caacaf67dfc06e4709d42e0c87219f33d86ba6f4',
    checkout='3b5a7da356d68c80f80f005de621e8074986eef6',tree='071b2c1e0dee9ed18bcfed62ca0a8764f0675682',sha256=hashes)
with ZipFile(root/'source-caacaf67.zip') as z:
    assert z.read('source-sha.txt').decode().strip()==summary['checkout']
    assert z.read('source-tree.txt').decode().strip()==summary['tree']
    for name,count in [('focused',46),('a16',84)]:
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
    summary['plan_sql_pass']=sum('test_plan_edit_postgres' in c.get('classname','') for c in cases)
    assert summary['plan_sql_pass']==13
    summary['review_fix_sql_pass']=sum('test_plan_review_fixes_postgres' in c.get('classname','') for c in cases)
    assert summary['review_fix_sql_pass']==12
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
    assert summary['gateway_setup_requests']==74
    assert 401 in summary['setup_gateway_statuses'] and 403 in summary['setup_gateway_statuses']
    assert 409 in summary['setup_gateway_statuses'] and 422 in summary['setup_gateway_statuses'] and 503 in summary['setup_gateway_statuses']
    for name,count in [('gateway-forwarding',19),('gateway-a16',1),('setup-gateway',1),('setup-browser',7)]:
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
    for screenshot in ['fix-events-ui.png','fix-archive-ui.png']:
        assert z.read(screenshot)==(root/screenshot).read_bytes()
    summary.update(review_readbacks=len(review),review_negative_pairs=len(negative_pairs),review_source_immutable=True,
        review_concurrent_once=True,review_exact_replay=True,review_zero_history=True,review_gateway_negative_hash_equal=True,
        review_gateway_replay_hash_equal=True)
    plan=[r for r in raw if r['stage'].startswith('plan-')]
    indexed_plan={r['stage']:r['data'] for r in plan}
    assert len(plan)==26
    pairs=[('plan-negative-before-'+kind,'plan-negative-after-'+kind) for kind in ['stale','intent','foreign-source','participant','membership','changed-key']]
    pairs += [('plan-replay-before','plan-replay-after'),('plan-http-negative-before','plan-http-negative-after'),
        ('plan-index-before','plan-index-after'),('plan-activation-negative-before','plan-activation-negative-after'),
        ('plan-activation-negative-before','plan-legacy-bypass-after')]
    for before,after in pairs:assert indexed_plan[before]==indexed_plan[after],(before,after)
    def canon(value):return {k:v for k,v in value.items() if k not in ('story_plans','story_plan_objectives')}
    for before,after in [('plan-canon-before','plan-canon-after'),('plan-context-before','plan-context-after')]:
        assert canon(indexed_plan[before])==canon(indexed_plan[after])
    for r in plan:
        value=r['data'];rows=value['story_plans'];objs=value['story_plan_objectives']
        assert len([p for p in rows if p['status']=='active'])<=1
        assert len({p['plan_version'] for p in rows})==len(rows)
        for t in ['events','entity_mentions','state_transitions','revision_provenances','autonomous_runs']:
            assert not value[t],(r['stage'],t)
        for row in rows:
            metadata=row['edit_metadata'];receipt=metadata['receipt']
            assert metadata['contract_version']=='plan-edit-v1'
            assert 'private_notes' not in receipt
            assert receipt['plan_id']==row['id'] and receipt['plan_version']==row['plan_version']
            assert hashlib.sha256((row['source_outline'] or '').encode()).hexdigest()==row['source_outline_hash']
            scoped=sorted([o for o in objs if o['plan_id']==row['id']],key=lambda o:o['order_index'])
            assert len(scoped)==len(receipt['objectives'])
            for physical,logical in zip(scoped,receipt['objectives']):
                assert physical['objective_metadata']['logical_id']==logical['objective_id']
                assert physical['intent_version']==logical['intent_version']
                assert physical['title']==logical['title'] and physical['description']==logical['description']
        # Physical primary keys are revision-local; logical keys link the history.
        assert len({o['id'] for o in objs})==len(objs)
    after=indexed_plan['plan-canon-after'];counts={}
    for o in after['story_plan_objectives']:counts[o['plan_id']]=counts.get(o['plan_id'],0)+1
    assert {0,5,10,20,25}<= {counts.get(r['id'],0) for r in after['story_plans']}
    assert any(r['status']=='deleted' for r in after['story_plans'])
    assert not any(r['status']=='active' for r in after['story_plans'])
    rolling=indexed_plan['plan-activation-negative-before']
    assert max(o['intent_version'] for o in rolling['story_plan_objectives'])==13
    migrations=[json.loads(l.split('PLAN_MIGRATION_PROOF ',1)[1]) for l in z.read('a16.log').decode().splitlines() if 'PLAN_MIGRATION_PROOF ' in l]
    assert len(migrations)==1 and migrations[0]['upgrade'] and migrations[0]['downgrade'] and migrations[0]['reupgrade']
    assert migrations[0]['duplicate_active_upgrade_rejected'] and migrations[0]['legacy_rows_preserved']==2
    assert states['plan-canon-before']['canonical_sha256']==states['plan-canon-after']['canonical_sha256']
    assert states['plan-canon-after']['counts']['plans']==2 and states['plan-canon-after']['counts']['objectives']==50
    for name in ['ai-service.log','setup-gateway.log']:
        assert 'PlanPrivateOnly' not in z.read(name).decode() and 'private_notes' not in z.read(name).decode()
    hashes=[dict(stage=r['stage'],novel_id=r['novel_id'],sha256=hashlib.sha256(json.dumps(r['data'],sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),
        canonical_sha256=hashlib.sha256(json.dumps(canon(r['data']),sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),counts={k:len(v) for k,v in r['data'].items()}) for r in plan]
    (root/'plan-readback-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8')
    summary.update(plan_readbacks=len(plan),plan_exact_negative_pairs=len(pairs),plan_zero_canon_mutation=True,
        plan_single_active=True,plan_migration_proof=migrations[0],plan_gateway_canonical_hash=states['plan-canon-after']['canonical_sha256'])
    fixes=[r for r in raw if r['stage'].startswith('fix-')]
    fix={r['stage']:r['data'] for r in fixes}
    assert len(fixes)==34
    pairs=[]
    for kind in ['draft','active','historical']:
        before=fix['fix-archive-source-before-'+kind]
        after=fix['fix-archive-committed-'+kind]
        assert canon(before)==canon(after)
        tombstone=next(r for r in after['story_plans'] if r['edit_metadata'].get('action')=='delete')
        target=tombstone['edit_metadata']['source_plan_id']
        old=next(r for r in before['story_plans'] if r['id']==target)
        current=next(r for r in after['story_plans'] if r['id']==target)
        for field in ['source_outline','source_outline_hash','input_hash','idempotency_key','created_by','edit_metadata']:
            assert old[field]==current[field]
        assert [o for o in before['story_plan_objectives'] if o['plan_id']==target]==[o for o in after['story_plan_objectives'] if o['plan_id']==target]
        pairs.extend([('fix-archive-committed-'+kind,'fix-archive-rejections-'+kind),('fix-archive-restored-'+kind,'fix-archive-late-replay-'+kind)])
        restored=fix['fix-archive-restored-'+kind]
        fork=next(r for r in restored['story_plans'] if r['plan_version']==max(p['plan_version'] for p in restored['story_plans']))
        assert fork['edit_metadata']['action']=='fork' and fork['edit_metadata']['source_plan_id']==target and fork['status']=='draft'
        assert fork['id']!=target
        assert current['edit_metadata']['receipt']['status']==old['edit_metadata']['receipt']['status']
        if kind!='historical':assert not any(r['status']=='active' for r in after['story_plans'])
        else:assert len([r for r in after['story_plans'] if r['status']=='active'])==1
    pairs += [('fix-archive-race-before-stale','fix-archive-race-after-stale'),('fix-events-before-reuse','fix-events-after-reuse'),
        ('fix-events-before-reuse','fix-events-canon-after'),('fix-legacy-active-before','fix-legacy-active-after'),
        ('fix-p2-transfer-before','fix-p2-transfer-after'),('fix-http-before','fix-http-after')]
    for before,after in pairs:assert fix[before]==fix[after],(before,after)
    assert len(pairs)==12
    for creator in ['None','00000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000002']:
        before=fix['fix-legacy-before-'+creator];after=fix['fix-legacy-after-'+creator]
        assert canon(before)==canon(after)
        legacy=before['story_plans'][0]
        assert next(r for r in after['story_plans'] if r['id']==legacy['id'])==legacy
        assert [o for o in after['story_plan_objectives'] if o['plan_id']==legacy['id']]==before['story_plan_objectives']
        new=next(r for r in after['story_plans'] if r['id']!=legacy['id'])
        assert new['plan_version']==2 and new['created_by']=='00000000-0000-0000-0000-000000000002'
        assert new['edit_metadata']['contract_version']=='plan-edit-v1'
    owned_before=fix['fix-owned-legacy-active-before'];owned_after=fix['fix-owned-legacy-active-after']
    assert canon(owned_before)==canon(owned_after)
    legacy=next(r for r in owned_before['story_plans'] if r['edit_metadata'].get('contract_version')!='plan-edit-v1')
    archived=next(r for r in owned_after['story_plans'] if r['id']==legacy['id'])
    assert legacy['status']=='active' and archived['status']=='superseded'
    for field in ['source_outline','source_outline_hash','created_by','edit_metadata']:assert legacy[field]==archived[field]
    for r in fixes:
        assert len([p for p in r['data']['story_plans'] if p['status']=='active'])<=1
        for table in ['events','entity_mentions','state_transitions','revision_provenances','autonomous_runs']:assert not r['data'][table]
    events=fix['fix-events-before-reuse']
    plans=sorted(events['story_plans'],key=lambda p:p['plan_version'])
    def events_for(p):return next(o['events'] for o in p['edit_metadata']['receipt']['objectives'] if len(o['events'])>1)
    initial=events_for(plans[0]);first_edit=events_for(plans[1]);three=events_for(plans[2]);final=events_for(plans[3])
    assert [e['event_id'] for e in first_edit]==[initial[2]['event_id'],initial[1]['event_id']]
    assert first_edit[0]['participants']==initial[2]['participants'] and first_edit[1]['participants']==initial[1]['participants']
    assert [e['event_id'] for e in final]==[initial[2]['event_id'],three[2]['event_id']]
    assert final[1]['participants']==three[2]['participants']
    assert states['fix-gateway-archive-before']['canonical_sha256']==states['fix-gateway-archive-after']['canonical_sha256']
    legacy_gateway=states['fix-gateway-legacy-coexist']
    assert legacy_gateway['legacy_before']==legacy_gateway['legacy_after']
    assert legacy_gateway['legacy_before']['created_by'] is None and legacy_gateway['legacy_before']['id'] not in legacy_gateway['visible_ids']
    assert len(legacy_gateway['visible_ids'])==2 and legacy_gateway['head_version']==3
    for log in ['ai-service.log','setup-gateway.log']:
        value=z.read(log).decode()
        assert all(marker not in value for marker in ['LegacyPrivateOnly','LegacyOutlinePrivate','LegacyTitlePrivate','PlanPrivateOnly'])
    hashes=[dict(stage=r['stage'],novel_id=r['novel_id'],sha256=hashlib.sha256(json.dumps(r['data'],sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),
        canonical_sha256=hashlib.sha256(json.dumps(canon(r['data']),sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),counts={k:len(v) for k,v in r['data'].items()}) for r in fixes]
    (root/'fix-readback-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8')
    summary.update(fix_readbacks=len(fixes),fix_exact_negative_pairs=len(pairs),fix_archival_receipts_immutable=True,
        fix_event_ids_participants_stable=True,fix_legacy_scope_preserved=True,fix_gateway_canonical_hash=states['fix-gateway-archive-after']['canonical_sha256'])
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
with ZipFile(root/'rollback-caacaf67.zip') as z:
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

"""Read-only runtime proofs / immutable baseline RED replay; no source mutation."""
import argparse,pathlib,sys,os,json,runpy,subprocess,tarfile,io,hashlib,secrets
p=argparse.ArgumentParser();p.add_argument('mode',choices=['red','proof']);p.add_argument('--root',required=True);p.add_argument('--output',required=True);a=p.parse_args()
ROOT=pathlib.Path(a.root).resolve();OUT=pathlib.Path(a.output).resolve();assert not OUT.is_relative_to(ROOT)
sys.argv=[str(ROOT/'scripts/p1_final_acceptance.py'),'runtime-proof' if a.mode=='proof' else 'status','--output',str(OUT)]
c=runpy.run_path(sys.argv[0]);run=c['run'];cfg=c['cfg'];compose=c['compose'];scrub=c['scrub'];v=cfg['values']
def save(name,value):(OUT/name).write_text(scrub(json.dumps(value,indent=2,default=str)),encoding='utf8')
if a.mode=='red':
 base='e63fc8c5a12aac0ce258cf360359f3ec3dca4a28';dest=OUT/('red-replay-'+secrets.token_hex(4));dest.mkdir()
 paths=['ai-service','Pipeline_test/tools/fake_provider_upstream.py','Pipeline_test/tools/headless_http_ingress.py']
 archive=subprocess.check_output(['git','archive','--format=tar',base,*paths],cwd=ROOT)
 with tarfile.open(fileobj=io.BytesIO(archive)) as tar:tar.extractall(dest,filter='data')
 overlay='ai-service/tests/test_p1_fe_final_contracts.py';(dest/overlay).write_bytes((ROOT/overlay).read_bytes())
 files=subprocess.check_output(['git','ls-tree','-r','--name-only',base,*paths],cwd=ROOT,text=True).splitlines()
 original={name:hashlib.sha256((dest/name).read_bytes()).hexdigest() for name in files}
 canonical={name:hashlib.sha256(subprocess.check_output(['git','show',base+':'+name],cwd=ROOT).replace(b'\r\n',b'\n')).hexdigest() for name in files}
 assert all(hashlib.sha256((dest/name).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==digest for name,digest in canonical.items()),'Only configured Windows checkout line endings may differ from Git blobs'
 env={**os.environ,'PYTHONPATH':str(dest/'ai-service'),'LLM_PROVIDER':'fake','EMBEDDING_PROVIDER':'fake','NARRATIVE_REPOSITORY':'json','SERVICE_AUTH_DISABLED':'true','PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','PYTHONDONTWRITEBYTECODE':'1'}
 for key in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY','TEST_DATABASE_URL','DATABASE_URL']:env.pop(key,None)
 expected=False
 try:
  run('replayed-e63-FE19-RED',['python','-m','pytest','-q','-s','-m','not postgres_integration','--basetemp='+str(OUT/('red-pytest-'+secrets.token_hex(4))),'tests/test_p1_fe_final_contracts.py','-k','known_inventory or correction_author_marker or test_test_ingress'],cwd=dest/'ai-service',env=env)
 except RuntimeError:
  entry=json.loads((OUT/'commands-and-exits.jsonl').read_text(encoding='utf8').splitlines()[-1]);assert entry['exit_code']==1
  result=(OUT/entry['log']).read_text(encoding='utf8');assert '6 failed, 1 passed' in result;expected=True
 assert expected,'The immutable baseline must reproduce six failures; the author-marker positive already passes on the baseline'
 assert all(hashlib.sha256((dest/name).read_bytes()).hexdigest()==digest for name,digest in original.items())
 save('replayed-e63-FE19-RED-provenance.json',{'executed_baseline_sha':base,'archive_command':['git','archive','--format=tar',base,*paths],
  'archive_sha256':hashlib.sha256(archive).hexdigest(),'production_and_original_files_unchanged':True,'original_file_sha256':original,'canonical_LF_git_blob_sha256':canonical,
  'test_overlay':overlay,'overlay_sha256':hashlib.sha256((dest/overlay).read_bytes()).hexdigest(),'expected_exit':1,'failed':6,'passed':1,
  'note':'Command recorder seals the current executor checkout separately; pytest cwd and this verified Git archive identify the actual RED source.'})
 print('Verified immutable-baseline RED: 6 failures, 1 positive pass; original files unchanged')
else:
 env={**os.environ,'P1_CONFIG':str(OUT/'private-stack.json')}
 run('final-gateway-health',['python','-c',"import os,json,urllib.request;c=json.load(open(os.environ['P1_CONFIG']));r=urllib.request.urlopen('http://127.0.0.1:'+c['values']['WAVE1D_BACKEND_PORT']+'/api/v1/health');assert r.status==200;print(r.read().decode())"],env=env)
 run('final-python-health',compose+['exec','-T','ai-service','python','-c',"import urllib.request;r=urllib.request.urlopen('http://127.0.0.1:8000/health');assert r.status==200;print(r.read().decode())"])
 resolved=json.loads(run('final-compose-policy',compose+['config','--format','json']))
 names=[n['name'] for n in resolved['networks'].values()];assert all(n.startswith(cfg['project']) for n in names)
 networks=json.loads(run('final-actual-network-inspection',['docker','network','inspect',*names]))
 assert all(n['Internal'] for n in networks if n['Name'].endswith(('_workers','_upstream')))
 save('actual-runtime-networks.json',networks)
 import psycopg
 from psycopg.rows import dict_row
 from psycopg import sql
 with psycopg.connect(host='127.0.0.1',port=v['WAVE1D_PG_PORT'],user=v['POSTGRES_USER'],password=v['POSTGRES_PASSWORD'],dbname=v['POSTGRES_DB'],row_factory=dict_row) as db:
  catalogs={}
  for schema,table in [('public','schema_migrations'),('public','alembic_version')]:
   catalogs[schema+'.'+table]=db.execute(sql.SQL('SELECT * FROM {}.{}').format(sql.Identifier(schema),sql.Identifier(table))).fetchall()
  names={r['migration_id'] for r in catalogs['public.schema_migrations']}
  assert any('012_novel_engagement' in n for n in names) and any('012_reports_unique_open' in n for n in names)
  assert any(n.startswith('017') for n in names)
 save('migration-catalog-readback.json',catalogs)
 hashes={}
 for service,base,files in [('ai-service',ROOT/'ai-service',['application/narrative_service.py','api/narrative_routes.py','api/entity_hitl_routes.py']),('backend',ROOT/'backend',['src/modules/ai/ai-gateway.controller.ts','src/modules/ai/ai-gateway.routes.ts'])]:
  candidates=list(OUT.glob('runtime-source-hashes-'+service+'*.log'));latest=max(candidates,key=lambda p:p.stat().st_mtime)
  data=json.loads(latest.read_text(encoding='utf8'))
  hashes[service]={name:{'runtime_sha256':data[name],'host_sha256':hashlib.sha256((base/name).read_bytes()).hexdigest()} for name in files}
  assert all(r['runtime_sha256']==r['host_sha256'] for r in hashes[service].values())
 save('runtime-host-source-equality.json',hashes)
 print('Health, migration catalog, internal networks and runtime/host source equality verified')

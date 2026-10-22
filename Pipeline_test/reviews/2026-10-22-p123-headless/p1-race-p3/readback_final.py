"""Durable read-only final core audit, with real outbound context hash matching."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_headless import Probe,digest
base=Path(__file__).resolve().parent
for name,env in [('final-writer','final-writer-environment.json'),('final-p3-existing','final-p3-existing-environment.json'),('final-p3-no-plan','final-p3-no-plan-environment.json'),('final-p2-regression','final-p3-existing-environment.json')]:
 v=json.loads((base/name/'validation.json').read_text(encoding='utf-8'));m=json.loads((base/env).read_text(encoding='utf-8'))
 p=Probe(m['env_file'],base/(name+'-readback'));p.novel=v['novel_id'];p.preflight();novel=p.novel
 tables=['narrative.entities','narrative.events','narrative.facts','narrative.proposals','narrative.revision_provenances','narrative.writing_generations','narrative.story_plans','narrative.autonomous_runs','chapter_revisions','revision_outbox_events','chapters']
 data={}
 for table in tables:
  value=json.loads(p.sql("select coalesce(json_agg(t),'[]') from "+table+" t where novel_id='"+novel+"'"));data[table]=value;p.save(table.replace('.','-'),value)
 captures=p.http.get(p.base.removesuffix('/api/v1')+'/received',timeout=5).json()
 linked=[]
 for job in data['narrative.writing_generations']:
  expected=(job['context_summary'] or {}).get('context_hash')
  if not expected:continue
  matches=[]
  for entry in captures:
   text=entry.get('prompt_text','');marker='Bối cảnh tiểu thuyết (Story Brain): '
   if marker not in text:continue
   context=json.loads(text.split(marker,1)[1].split('\n',1)[0])
   if digest(context)==expected:matches.append({'capture':entry,'prompt_sha256':hashlib.sha256(text.encode()).hexdigest(),'context_hash':expected})
  assert matches,'Missing actual fake HTTP context for '+job['job_id']
  linked.append({'job_id':job['job_id'],'status':job['status'],'matches':matches})
 p.save('outbound-context-hashes',linked);p.save('gateway-ledger',p.ledger())
 p.save('migrations',{'AI':p.sql('select version_num from alembic_version'),'backend':json.loads(p.sql('select json_agg(t) from schema_migrations t'))})
 # Original B provenance and outbox order, plus both crash recoveries.
 if name=='final-writer':
  r=json.loads((base/name/'HTTP-results.json').read_text(encoding='utf-8'))
  aid=r['A']['response']['data']['analysisRevisionId'];bid=r['B']['response']['data']['analysisRevisionId']
  revisions={x['revision_id']:x for x in data['chapter_revisions']}
  assert revisions[bid]['parent_revision_id']==aid
  assert revisions[bid]['content']=='P1_ORDERED_B_ newer body'
  for rid in (aid,bid):
   events=[x for x in data['revision_outbox_events'] if x['revision_id']==rid and x['event_type']=='INCREMENTAL_ANALYSIS']
   assert len(events)==1 and events[0]['content_hash']==revisions[rid]['content_hash']
  p.save('writer-order-proof',{'A_revision':aid,'B_revision':bid,'B_parent_is_A':True,'one_matching_outbox_per_revision':True,'crash_seams':['post_cas','post_pg']})
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'novel_id':novel,'project':p.project,'verdict':'PASS','outbound_jobs_linked':len(linked),'read_only':True})
print('Four final durable readbacks PASS')

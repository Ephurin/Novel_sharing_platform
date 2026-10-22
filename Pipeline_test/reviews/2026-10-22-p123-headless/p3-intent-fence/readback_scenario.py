"""Read-only source/DB/Mongo/outbound audit for one owned intent scenario."""
import argparse,hashlib,json,sys,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_headless import Probe,digest
base=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('name');parser.add_argument('--manifest');parser.add_argument('--suffix',default='-readback');args=parser.parse_args();name=args.name
v=json.loads((base/name/'validation.json').read_text(encoding='utf-8'));uuid.UUID(v['novel_id'])
m=json.loads((base/(args.manifest or name+'-environment.json')).read_text(encoding='utf-8'))
p=Probe(m['env_file'],base/(name+args.suffix));p.novel=v['novel_id'];p.preflight();novel=p.novel
allrows={}
for table in ['narrative.story_brains','narrative.entities','narrative.events','narrative.facts','narrative.proposals','narrative.story_plans','narrative.story_plan_objectives','narrative.autonomous_runs','narrative.writing_generations','chapter_revisions','revision_outbox_events','chapters']:
 data=json.loads(p.sql("select coalesce(json_agg(t),'[]') from "+table+" t where novel_id='"+novel+"'"));allrows[table]=data;p.save(table.replace('.','-'),data)
script="""import {getMongoDatabase,disconnectMongo} from './dist/core/database/mongo.js';
console.log(JSON.stringify(await getMongoDatabase().collection('draft_chapters').find({novelId:process.argv[1]}).toArray()));await disconnectMongo();process.exit(0);"""
raw=p.command(p.compose+['exec','-T','backend','node','--input-type=module','-e',script,novel]);mongo=json.loads(next(line for line in raw.splitlines() if line.startswith('[')));p.save('Mongo-drafts',mongo)
p.save('migrations',{'AI':p.sql('select version_num from alembic_version'),'intent_column':p.sql("select column_name||':'||column_default from information_schema.columns where table_schema='narrative' and table_name='story_plan_objectives' and column_name='intent_version'"),'backend':json.loads(p.sql('select json_agg(t) from schema_migrations t'))})
journal=p.command(p.compose+['exec','-T','fake-upstream','python','-c',"from pathlib import Path;print(Path('/evidence/requests.jsonl').read_text())"])
captures=[json.loads(line) for line in journal.splitlines() if line.strip()];matched=[]
for g in allrows['narrative.writing_generations']:
 expected=(g['context_summary'] or {}).get('context_hash');hits=[]
 if not expected:continue
 for entry in captures:
  text=entry.get('prompt_text','');marker='Bối cảnh tiểu thuyết (Story Brain): '
  if marker in text:
   c=json.loads(text.split(marker,1)[1].split('\n',1)[0])
   if digest(c)==expected:hits.append({'capture':entry,'context_hash':expected,'prompt_sha256':hashlib.sha256(text.encode()).hexdigest()})
 assert hits,g['job_id'];matched.append({'job_id':g['job_id'],'matches':hits})
p.save('actual-outbound-hashes',matched);p.save('gateway-ledger',p.ledger())
p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':novel,'scenario':name,'status':'PASS','read_only':True,'matched_writing_jobs':len(matched),'mongo_drafts':len(mongo)})
print(name+' readback PASS')

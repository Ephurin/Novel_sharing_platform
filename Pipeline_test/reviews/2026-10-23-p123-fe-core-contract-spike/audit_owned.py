"""Read-only audit of this spike's three new databases; no historical targets."""
import hashlib,json,subprocess,uuid
from pathlib import Path
B=Path(__file__).resolve().parent
records=[]
def call(args):
 r=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace');records.append({'command':args,'exit_code':r.returncode})
 if r.returncode:raise RuntimeError(r.stderr[-1000:])
 return r.stdout.strip()
for suffix,folder in [('', 'core-runtime'),('-02','core-runtime-02'),('-03','core-runtime-03')]:
 m=json.loads((B/('environment'+suffix+'.json')).read_text());v=json.loads((B/folder/'validation.json').read_text());uuid.UUID(v['novel_id'])
 e=dict(s.split('=',1) for s in Path(m['env_file']).read_text().splitlines() if s and not s.startswith('#'))
 c=['docker','compose','--env-file',m['env_file'],'-f','Pipeline_test/tools/compose.p123-p3.yml'];out=B/(folder+'-audit');out.mkdir(exist_ok=False)
 try:
  call(c+['up','-d','--wait','postgres','mongodb'])
  def sql(q):return call(c+['exec','-T','postgres','psql','-X','-v','ON_ERROR_STOP=1','-U',e['POSTGRES_USER'],'-d',e['POSTGRES_DB'],'-At','-c',q])
  rows={}
  for t in ['chapters','chapter_revisions','revision_outbox_events','narrative.story_brains','narrative.entities','narrative.events','narrative.facts','narrative.proposals','narrative.writing_generations','narrative.story_plans']:
   rows[t]=json.loads(sql("select coalesce(json_agg(t),'[]') from "+t+" t where novel_id='"+v['novel_id']+"'"))
  (out/'PostgreSQL.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
  mongo=json.loads(call(c+['exec','-T','mongodb','mongosh','--quiet','--eval',"JSON.stringify(db.getSiblingDB('"+e['POSTGRES_DB']+"').draft_chapters.find({novelId:'"+v['novel_id']+"'}).toArray())"]))
  (out/'MongoDB.json').write_text(json.dumps(mongo,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
  migrations={'backend':json.loads(sql('select json_agg(t) from schema_migrations t')),'AI':sql('select version_num from alembic_version')}
  (out/'migrations.json').write_text(json.dumps(migrations,indent=2)+'\n',encoding='utf-8')
  call(['docker','cp',m['project']+'-fake-upstream-1:/evidence/requests.jsonl',str(out/'fake-requests.jsonl')])
  # Actual outbound context matches persisted jobs; full prompt hash is distinct.
  import sys
  sys.path.insert(0,str(Path.cwd()/'Pipeline_test/tools'))
  from run_p123_headless import digest
  captures=[json.loads(line) for line in (out/'fake-requests.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
  matched=[]
  for job in rows['narrative.writing_generations']:
   expected=job['context_summary'].get('context_hash');hits=[]
   for capture in captures:
    prompt=capture.get('prompt_text','');marker='Bối cảnh tiểu thuyết (Story Brain): '
    if marker in prompt:
     context=json.loads(prompt.split(marker,1)[1].split('\n',1)[0])
     if digest(context)==expected:hits.append({'context_hash':expected,'full_prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest()})
   assert hits,job['job_id'];matched.append({'job_id':job['job_id'],'matches':hits})
  (out/'context-hashes.json').write_text(json.dumps(matched,indent=2)+'\n',encoding='utf-8')
 finally:call(c+['stop','-t','2','postgres','mongodb'])
(B/'audit-commands.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print('Owned database readbacks completed')

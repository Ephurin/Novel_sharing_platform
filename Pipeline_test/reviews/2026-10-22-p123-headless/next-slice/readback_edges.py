import json,sys
from pathlib import Path
root=Path.cwd();sys.path.insert(0,str(root))
from Pipeline_test.tools.run_p123_headless import Probe
base=root/'Pipeline_test/reviews/2026-10-22-p123-headless/next-slice'
m=json.loads((base/'final-edges-environment.json').read_text())
p=Probe(m['env_file'],base/'final-edges-readback-02');p.preflight()
v=json.loads((base/'final-edges/validation.json').read_text());novel=v['novel_id']
for table in ['entities','facts','proposals','revision_provenances']:
 p.save(table,json.loads(p.sql("select json_agg(t) from narrative."+table+" t where novel_id='"+novel+"'")))
p.save('gateway-ledger',p.ledger())
p.save('fault-fixtures-removed',{'remaining':p.sql("select count(*) from pg_trigger where tgname like 'next_fault_%'")})
script="""import json,os,sys,urllib.request
req=urllib.request.Request('http://127.0.0.1:8000/v1/story-brains/'+sys.argv[1]+'/context-preview?chapter_number=1',headers={'X-Service-Token':os.environ['PLATFORM_SERVICE_TOKEN'],'X-Tenant-Id':'00000000-0000-0000-0000-000000000001','X-Request-Id':'edge-readback'})
print(json.dumps(json.load(urllib.request.urlopen(req))['data']))
"""
preview=json.loads(p.command(p.compose+['exec','-T','ai-service','python','-c',script,novel]))
(base/'final-edges-readback-02/overflow-budget-observation.json').write_text(json.dumps({'budget':preview['token_budget'],'context_summary':preview['context_summary']},ensure_ascii=False,indent=2),encoding='utf-8')
assert preview['token_budget']['protected_overflow']
p.save('validation',{'tested_sha':p.source_sha,'novel_id':novel,'read_only':True,'status':'PASS'})

"""Additional HTTP overlap evidence; simultaneous barrier, fresh API-owned novel."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys
import threading
import time
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_next import NextProbe
base=Path(__file__).resolve().parent
m=json.loads((base/'final-p1-environment.json').read_text(encoding='utf-8'))
p=NextProbe(m['env_file'],base/'final-concurrent-barrier');p.setup()
cid=p.api('POST','/novels/'+p.novel+'/chapters',{'title':'Simultaneous CAS','content':'Initial'})['chapterId']
rounds=[]
for i in range(3):
    version=p.api('GET','/chapters/'+cid)['draft']['version']; barrier=threading.Barrier(2)
    def write(label):
        barrier.wait(timeout=5); start=time.monotonic_ns()
        response=p.http.patch(p.base+'/chapters/'+cid,json={'content':label+str(i),'expectedVersion':version},timeout=30)
        end=time.monotonic_ns()
        return {'writer':label,'expected_version':version,'start_ns':start,'end_ns':end,'status':response.status_code,'response':response.json()}
    with ThreadPoolExecutor(2) as pool:
        a=pool.submit(write,'A');b=pool.submit(write,'B');pair=[a.result(),b.result()]
    overlap=max(x['start_ns'] for x in pair)<min(x['end_ns'] for x in pair)
    rounds.append({'round':i,'client_HTTP_intervals_overlap':overlap,'writers':pair})
    p.save('barrier-receipts',rounds)
    p.check('real_overlap_'+str(i),overlap)
    p.check('one_CAS_winner_'+str(i),sorted(x['status'] for x in pair)==[200,409])
p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'verdict':'PASS','checks':p.checks,'external_provider_calls':0})
print('Three overlapping HTTP races PASS')

import json,uuid
from pathlib import Path
from run_p123_headless import Probe,digest
ROOT=Path(__file__).resolve().parents[2]
class NextProbe(Probe):
    def setup(self):
        self.preflight()
        token, self.owner = self.account('owner')
        self.foreign, _ = self.account('foreign')
        self.http.headers['Authorization'] = 'Bearer ' + token
        self.new_novel()

    def new_novel(self):
        self.novel = self.api('POST', '/novels', {'title': 'Next slice ' + self.project, 'synopsis': 'Isolated fake-only headless probe'})['novelId']
        self.brain = '/ai/story-brains/' + self.novel

    def latest(self, cid):
        r = self.api('GET', '/chapters/' + cid + '/revisions')[0]
        return self.api('GET', '/chapters/' + cid + '/revisions/' + r['revisionId'])

    def generate(self,cid,fault=False,overflow=False):
        r=self.latest(cid)
        version=self.api('GET','/ai/story-brains/by-novel/'+self.novel)['brain_version']
        instruction='next-'+uuid.uuid4().hex+(' fault:500' if fault else ' Continue current scene.')
        job=self.api('POST','/ai/writing/generations',{'novel_id':self.novel,'chapter_id':cid,'revision_id':r['revisionId'],'content_hash':r['contentHash'],'operation':'continue','selection':{'start':0,'end':0,'cursor':len(r['content'])},'instruction':instruction,'idempotency_key':'core-reconciliation-'+uuid.uuid4().hex,'expected_brain_version':version})
        done=self.wait_job(job['job_id'],{'failed'} if fault or overflow else {'completed'})
        captures=self.http.get(self.base.removesuffix('/api/v1')+'/received',timeout=5).json()
        matching=[c for c in captures if instruction in c.get('prompt_text','')]
        stored=json.loads(self.sql("select row_to_json(g) from narrative.writing_generations g where job_id='"+done['job_id']+"'"))
        evidence={'job':done,'stored':stored,'captures':matching}
        if not(fault or overflow):
            assert len(matching)==1
            context=json.loads(matching[0]['prompt_text'].split('Bối cảnh tiểu thuyết (Story Brain): ',1)[1].split('\n',1)[0])
            self.check('outbound_hash_'+done['job_id'],digest(context)==stored['context_summary']['context_hash'])
            retrieval_status=stored['context_summary'].get('semantic_retrieval_status')
            if retrieval_status is None:
                self.save('retrieval-metadata-'+done['job_id'],{'DTO_status':'ABSENT_IN_INTEGRATION','runtime_policy_evidence':'containment.json: embeddings none, semantic retrieval false; no status field is inferred'})
            else:
                self.check('retrieval_disabled_'+done['job_id'],retrieval_status==['disabled'])
            evidence['context']=context
        self.save('generation-'+done['job_id'],evidence)
        return done,evidence

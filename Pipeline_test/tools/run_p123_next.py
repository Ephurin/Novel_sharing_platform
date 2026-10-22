"""Bounded real HTTP/DB next-slice probes; fake only, no FE/business SQL seeds."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import sys
import time
import uuid
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from Pipeline_test.tools.run_p123_headless import Probe, digest, sanitize

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

    def concurrency(self, before=False):
        self.setup()
        cid = self.api('POST', '/novels/' + self.novel + '/chapters', {'title': 'Race', 'content': 'A'})['chapterId']
        def write(text, version, delay=0):
            time.sleep(delay)
            r = self.http.patch(self.base + '/chapters/' + cid, json={'content': text, 'expectedVersion': version, 'autosave': True}, timeout=30)
            return {'text': text, 'version': version, 'status': r.status_code, 'response': sanitize(r.json())}
        rounds=[]
        for i, first in enumerate(('B', 'A')):
            v = self.api('GET', '/chapters/' + cid)['draft']['version']
            with ThreadPoolExecutor(2) as pool:
                a=pool.submit(write, first + str(i), v)
                b=pool.submit(write, ('A' if first=='B' else 'B') + str(i), v, .08)
                pair=[a.result(), b.result()]
            rounds.append(pair)
            self.save('concurrent-orderings', rounds)
            if not before:
                self.check('one_winner_' + str(i), sorted(x['status'] for x in pair)==[200,409])
                self.check('precise_conflict_' + str(i), next(x for x in pair if x['status']==409)['response']['error']['code']=='DRAFT_CONFLICT')
        v=self.api('GET','/chapters/'+cid)['draft']['version']
        rapid=[write('B latest',v),write('A stale',v),write('B latest',v)]
        self.save('rapid-B-A-B',rapid)
        if before: raise RuntimeError('EXPECTED_RED original schema accepts stale writes')
        self.check('rapid_stale_rejected_identical_replay_ok',[x['status'] for x in rapid]==[200,409,200])
        self.check('latest_preserved',self.api('GET','/chapters/'+cid)['draft']['content']=='B latest')
        self.api('PATCH','/chapters/'+cid,{'content':'foreign','expectedVersion':v},headers={'Authorization':'Bearer '+self.foreign},expected=(403,))
        self.check('versioned_wrong_owner_denied',True)
        self.api('PATCH','/chapters/'+cid,{'content':'Legacy unversioned works'})
        self.check('legacy_client_compatible',True)

    def generate(self,cid,fault=False,overflow=False):
        r=self.latest(cid)
        version=self.api('GET','/ai/story-brains/by-novel/'+self.novel)['brain_version']
        instruction='next-'+uuid.uuid4().hex+(' fault:500' if fault else ' Continue current scene.')
        job=self.api('POST','/ai/writing/generations',{'novel_id':self.novel,'chapter_id':cid,'revision_id':r['revisionId'],'content_hash':r['contentHash'],'operation':'continue','selection':{'start':0,'end':0,'cursor':len(r['content'])},'instruction':instruction,'expected_brain_version':version})
        done=self.wait_job(job['job_id'],{'failed'} if fault or overflow else {'completed'})
        captures=self.http.get(self.base.removesuffix('/api/v1')+'/received',timeout=5).json()
        matching=[c for c in captures if instruction in c.get('prompt_text','')]
        stored=json.loads(self.sql("select row_to_json(g) from narrative.writing_generations g where job_id='"+done['job_id']+"'"))
        evidence={'job':done,'stored':stored,'captures':matching}
        if not(fault or overflow):
            assert len(matching)==1
            context=json.loads(matching[0]['prompt_text'].split('Bối cảnh tiểu thuyết (Story Brain): ',1)[1].split('\n',1)[0])
            self.check('outbound_hash_'+done['job_id'],digest(context)==stored['context_summary']['context_hash'])
            self.check('retrieval_disabled_'+done['job_id'],stored['context_summary']['semantic_retrieval_status']==['disabled'])
            evidence['context']=context
        self.save('generation-'+done['job_id'],evidence)
        return done,evidence

    def accept(self,cid,job,fault=False):
        uuid.UUID(cid)
        path='/chapters/'+cid+'/revisions/accept-draft'; body={'generationId':job['job_id']}
        before=self.api('GET','/chapters/'+cid); memory=self.read_memory()
        def counts():
            return self.sql("select json_build_object('revisions',(select count(*) from chapter_revisions where chapter_id='"+cid+"'),'outbox',(select count(*) from revision_outbox_events where chapter_id='"+cid+"'))")
        initial=counts()
        if fault:
            name='next_fault_'+cid.replace('-','')
            create="create function "+name+"() returns trigger language plpgsql as $$ begin raise exception 'NEXT_SLICE_OWNED_OUTBOX_FAULT'; end $$; create trigger "+name+" before insert on revision_outbox_events for each row when (NEW.chapter_id='"+cid+"'::uuid) execute function "+name+"();"
            drop='drop trigger if exists '+name+' on revision_outbox_events; drop function if exists '+name+'();'
            args=self.compose+['exec','-T','postgres','psql','-X','-v','ON_ERROR_STOP=1','-U',self.env['POSTGRES_USER'],'-d',self.env['POSTGRES_DB'],'-c']
            try:
                self.command(args+[create])
                response=self.api('POST',path,body,expected=(500,))
                self.check('real_DB_transaction_rollback',counts()==initial)
                self.check('fault_no_draft_or_canon_advance',self.api('GET','/chapters/'+cid)==before and self.read_memory()==memory)
                self.save('DB-fault',{'fixture_ddl':create,'response':response,'counts_before_after':initial})
            finally:
                self.command(args+[drop])
                self.save('DB-fault-cleanup',{'ddl':drop,'remaining':self.sql("select count(*) from pg_trigger where tgname='"+name+"'")})
        accepted=self.api('POST',path,body); replay=self.api('POST',path,body)
        self.save('accept-'+job['job_id'],{'accepted':accepted,'replay':replay})
        rid=accepted['revision']['revisionId']
        self.check('accept_idempotent',replay['revision']['revisionId']==rid)
        revision=self.api('GET','/chapters/'+cid+'/revisions/'+rid)
        self.check('accepted_lineage',revision['sourceType']=='AI_DRAFT_ACCEPT' and revision['sourceGenerationId']==job['job_id'])
        self.check('draft_synced',self.api('GET','/chapters/'+cid)['draft']['content']==revision['content'])
        self.check('never_published',self.api('GET','/chapters/'+cid)['status']=='DRAFT')
        self.check('accept_not_implicit_canon',self.read_memory()==memory)
        checkpoint=counts()
        self.api('PATCH','/chapters/'+cid,{'content':'Obsolete stale write','expectedVersion':0},expected=(409,))
        self.check('stale_PATCH_no_revision_outbox_canon',counts()==checkpoint and self.read_memory()==memory)
        self.review(self.wait_review(rid)); self.approve()
        outbox=json.loads(self.sql("select json_agg(t) from revision_outbox_events t where revision_id='"+rid+"'"))
        self.save('outbox-'+rid,outbox)
        self.check('single_accept_outbox',len([x for x in outbox if x['event_type']=='INCREMENTAL_ANALYSIS'])==1)
        self.save('accepted-revision-'+rid,revision); self.save('M-FIRST-'+rid,self.read_memory())
        return rid

    def p1(self):
        super().run()
        self.stage='actual_accept_DB_rollback'
        source=json.loads((self.output/'source-manifest.json').read_text(encoding='utf-8'))
        cid=source['revisions'][0]['chapter_id']
        job,_=self.generate(cid); self.accept(cid,job,fault=True)
        current=self.read_memory(); self.check('accepted_memory_durable',self.restart_and_read()==current)
        self.edges(); self.stage='P1_remaining_complete'

    def p2(self):
        self.setup(); self.stage='P2_extract_from_idea'
        idea='Mai Linh và Duy là nhân vật tại Cồn Vân. Chưa có sự kiện lịch sử nào được kể.'
        self.save('idea-source',{'idea':idea,'sha256':hashlib.sha256(idea.encode()).hexdigest(),'mode':'extract'})
        cid=self.api('POST','/novels/'+self.novel+'/chapters',{'title':'First chapter','content':''})['chapterId']
        self.api('POST','/chapters/'+cid+'/revisions/snapshot',{'purpose':'MANUSCRIPT_BOOTSTRAP'})
        self.save('empty-writer-base',self.latest(cid))
        start=self.api('POST','/ai/story-brains/bootstrap/from-idea',{'novel_id':self.novel,'idea':idea,'mode':'extract'})
        self.wait_job(start['job_id'],{'waiting_review'})
        raw=self.api('GET',self.brain+'/review-queue'); self.save('M0-machine',raw)
        self.check('setup_entity_only',bool(raw) and all(p['proposal_type']=='entity' for p in raw))
        self.check('setup_not_implicit_canon',not self.read_memory()['entities'])
        self.approve(); self.api('POST',self.brain+'/baseline/activate',{'job_id':start['job_id']})
        m0=self.read_memory(); self.save('M0-approved',m0)
        self.check('source_names_only',{e['name'] for e in m0['entities']}=={'Mai Linh','Duy','Cồn Vân'})
        self.check('idea_not_history',not m0['events'])
        self.api('GET',self.brain+'/memory',headers={'Authorization':'Bearer '+self.foreign},expected=(403,))
        self.check('P2_foreign_denied',True); self.check('M0_durable',self.restart_and_read()==m0)
        plan=self.api('POST','/ai/story-plans',{'novel_id':self.novel,'source_outline':'Future only','objectives':[{'order_index':1,'title':'NEXT_FUTURE_ONLY','description':'Tomorrow check microphone.','target_chapter':2}]})
        self.api('POST','/ai/story-plans/'+plan['plan_id']+'/activate',{'novel_id':self.novel})
        self.save('active-plan',self.api('GET','/ai/story-plans/by-novel/'+self.novel+'/active'))
        self.check('plan_not_history',self.read_memory()==m0)
        self.stage='P2_failure_retry'
        failed,_=self.generate(cid,fault=True)
        self.check('P2_failed_job_no_canon_advance',failed['status']=='failed' and self.read_memory()==m0)
        self.api('POST','/chapters/'+cid+'/revisions/accept-draft',{'generationId':failed['job_id']},expected=(400,))
        self.check('failed_draft_not_acceptable',True)
        self.stage='P2_first_accept'
        job,evidence=self.generate(cid)
        self.check('plan_in_HTTP_request',evidence['context']['planning_context']['plan_id']==plan['plan_id'])
        self.accept(cid,job)
        first=self.read_memory(); self.check('M_FIRST_nonempty_history',bool(first['events']) and bool(first['facts']))
        self.check('M_FIRST_durable',self.restart_and_read()==first)
        self.stage='P2_second_request'
        _,second=self.generate(cid)
        self.check('second_request_memory_continuity',bool(second['context']['recent_events']))
        self.check('future_not_historical','NEXT_FUTURE_ONLY' not in json.dumps(second['context']['recent_events']))
        self.save('gateway-ledger',self.ledger()); self.stage='P2_core_complete'

    def edges(self):
        self.stage='context_edges'; self.new_novel()
        short='Quy tắc tác giả: luôn kiểm tra micro trước khi bật máy.'
        large='UNIQUE_LONG_RULE_BEGIN: '+('Quy tắc dài được tác giả xác nhận. '*1000)
        cid=self.api('POST','/novels/'+self.novel+'/chapters',{'title':'Context source','content':short+'\n\n'+large})['chapterId']
        self.api('POST','/chapters/'+cid+'/revisions/snapshot',{'purpose':'MANUSCRIPT_BOOTSTRAP'})
        r=self.latest(cid)
        def fact(key,text,locked):
            version=self.api('GET','/ai/story-brains/by-novel/'+self.novel)['brain_version']
            p=self.api('POST',self.brain+'/author-proposals',{'chapter_id':cid,'revision_id':r['revisionId'],'quote':text[:100],'proposal_type':'fact','payload':{'fact_key':key,'fact_value':text},'expected_brain_version':version})
            accepted=self.api('POST','/ai/proposals/'+p['proposal_id']+'/edit-and-accept',{'expected_brain_version':version,'edited_payload':{**p['payload'],'is_locked':locked}})
            self.save('fact-'+key,{'proposal':p,'accepted':accepted})
        fact('locked_short',short,True); fact('optional_large',large,False)
        self.api('POST',self.brain+'/author-entities',{'name':'Unknown origin person','entity_type':'PER'}); self.approve()
        _,e=self.generate(cid)
        self.check('HTTP_locked_rule_retained',any(x['fact_key']=='locked_short' and x['is_locked'] for x in e['context']['world_rules']))
        summary=e['stored']['context_summary']
        self.check('actual_pruning',bool(summary['dropped_fact_ids']))
        self.check('unknown_policy_explicit',bool(summary['temporal_origin_unknown_entity_ids']) and summary['temporal_origin_policy']==['known-source-cutoff_unknown-global-v1'])
        rows=json.loads(self.sql("select json_agg(t) from narrative.entities t where novel_id='"+self.novel+"'")); self.save('unknown-origin-DB',rows)
        self.check('no_invented_origin',all(e['static_attributes'].get('first_chapter') is None for e in rows))
        fact('locked_huge',large,True)
        failed,e=self.generate(cid,overflow=True)
        self.check('protected_overflow_no_dispatch',failed['error']['code']=='CONTEXT_PROTECTED_BUDGET_EXCEEDED' and not e['captures'])
        self.save('context-final-memory',self.read_memory())

def main():
    p=argparse.ArgumentParser(); p.add_argument('--env-file',required=True); p.add_argument('--output',required=True); p.add_argument('--mode',choices=['concurrency-before','concurrency','p1','p2','edges'],required=True)
    a=p.parse_args(); probe=NextProbe(a.env_file,a.output); error=None
    try:
        if a.mode in ('p1','p2','edges'):
            probe.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-next.yml')
            if a.mode=='edges': probe.setup()
            getattr(probe,a.mode)()
        else: probe.concurrency(a.mode=='concurrency-before')
    except Exception as exc: error={'type':type(exc).__name__,'message':str(exc) or 'Empty exception'}
    probe.save('validation',{'tested_sha':probe.source_sha,'source_dirty_at_start':probe.source_dirty,'project':probe.project,'novel_id':probe.novel,'stage':probe.stage,'mode':a.mode,'checks':probe.checks,'failure':error,'verdict':'FAIL' if error else 'PASS','external_provider_calls':0})
    print(json.dumps({'stage':probe.stage,'failure':error,'checks':len(probe.checks)})); return 1 if error else 0
if __name__=='__main__': raise SystemExit(main())

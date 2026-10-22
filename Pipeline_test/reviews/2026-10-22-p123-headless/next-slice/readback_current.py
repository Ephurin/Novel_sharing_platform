"""Read-only next-slice readback. Resolve CURRENT accepted evidence after chapter rewrite."""
import hashlib
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[4]
sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_headless import Probe
base=Path(__file__).resolve().parent
for kind in ('p1','p2'):
    env=json.loads((base/('final-'+kind+'-environment.json')).read_text())['env_file']
    p=Probe(env,base/('final-'+kind+'-readback'))
    validation=json.loads((base/('final-'+kind)/'validation.json').read_text())
    p.novel=validation['novel_id']; novel=p.novel
    p.preflight()
    def rows(table):
        return json.loads(p.sql("select coalesce(json_agg(t),'[]') from "+table+" t where novel_id='"+novel+"'"))
    data={t:rows(t) for t in ('narrative.story_brains','narrative.entities','narrative.events','narrative.facts','narrative.proposals','narrative.revision_provenances','chapter_revisions','revision_outbox_events')}
    for table,value in data.items(): p.save(table.replace('.','-'),value)
    p.save('migrations',{'AI':p.sql('select version_num from alembic_version'),'backend':json.loads(p.sql("select json_agg(t) from schema_migrations t"))})
    p.save('gateway-ledger',p.ledger())
    if kind=='p1':
        rmap={r['revision_id']:r['chapter_number'] for r in data['narrative.revision_provenances']}
        revisions={r['revision_id']:r for r in data['chapter_revisions']}
        earliest={}; proofs=[]; invalid=[]
        for proposal in data['narrative.proposals']:
            if proposal['proposal_type']!='entity' or proposal['status']!='accepted': continue
            name=proposal['payload']['canonical_name']
            for evidence in proposal['evidence']:
                rid=evidence['revision_id']; rev=revisions[rid]; chapter=rmap[rid]
                valid=(rev['content'][evidence['start']:evidence['end']]==evidence['quote'] and hashlib.sha256(rev['content'].encode()).hexdigest()==evidence['text_hash']==rev['content_hash'])
                proof={'name':name,'proposal_id':proposal['id'],'revision_id':rid,'chapter':chapter,'quote_hash_valid':valid}
                proofs.append(proof)
                if not valid: invalid.append(proof)
                earliest[name]=min(chapter,earliest.get(name,chapter))
        contexts=json.loads((base/'final-cutoff-audit/cutoff-contexts.json').read_text(encoding='utf-8'))
        leaks=[]
        for cutoff,context in contexts.items():
            ids={e['entity_id'] for e in context['entities']}
            for e in data['narrative.entities']:
                origin=earliest.get(e['canonical_name'])
                if origin is not None and origin>int(cutoff) and e['id'] in ids: leaks.append({'name':e['canonical_name'],'cutoff':cutoff,'origin':origin})
        p.save('current-provenance-cutoff',{'policy':'CURRENT accepted immutable evidence, including newly accepted chapter-1 rewrite','supersedes_interpretation_only':'final-cutoff-audit used frozen M0 source map against later M-FIRST context; preserved FAIL is a phase mismatch','earliest':earliest,'proofs':proofs,'invalid_evidence':invalid,'leaks':leaks,'verdict':'PASS' if not leaks and not invalid else 'FAIL'})
        assert not leaks and not invalid
    p.save('validation',{'tested_sha':p.source_sha,'novel_id':novel,'read_only':True,'status':'PASS'})

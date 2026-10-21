"""FAKE_PROVIDER_OUTPUT: source-only scripted functional labels, not extraction quality."""
import json
TYPES={'Mai Linh':'PER','Linh':'PER','Mai Lâm':'PER','Duy':'PER','An':'PER','Hòa':'PER','Yên':'PER','Sâm':'PER','Bà Sâm':'PER','Vũ':'PER','Nguyễn Vũ':'PER','CV-04':'ITEM','Cồn Vân':'LOC','Bãi Dưới':'LOC','Đồi Bắc':'LOC','Bốn':'LOC'}

def decisions(request):
    out=[];known={e['name']:e for e in request.get('known_entities',[])}
    for c in request['candidates']:
        s=c['surface'];context=c['context'];assert s in context
        d=dict(candidate_id=c['candidate_id'],verdict='not_entity',canonical_name='',entity_type=None,canonical_entity_id='',identity_quote='',initial_status='Unknown',status_quote='',confidence=.7,reason='FAKE_PROVIDER_OUTPUT scripted source-context verdict')
        if s in TYPES:
            canonical=s
            if s=='Linh' and 'Mai Linh' in context and 'Mai Linh' in request.get('allowed_names',[]):canonical='Mai Linh';d['identity_quote']=context
            d.update(verdict='entity',canonical_name=canonical,entity_type=TYPES[s],canonical_entity_id=known.get(canonical,{}).get('entity_id',''))
        if s=='An':d.update(verdict='unresolved',canonical_name='',entity_type=None,canonical_entity_id='',identity_quote='')
        out.append(d)
    return {'decisions':out}

def output(props,text):
    if 'decisions' in props:return decisions(json.loads(text.rsplit('\n\n',1)[-1]))
    if 'events' in props:
        source=text.split('Text passage: ',1)[1].split('\nKnown entities:',1)[0]
        quote=source.split('\n\n',1)[0]
        return {'events':[{'evidence_quote':quote,'participants':[],'locations':[],'event_type':'observation','summary':quote,'emotion_tags':[],'consequences':[],'importance_score':.5}]}
    if 'facts' in props:
        data=json.loads(text.rsplit('\n\n',1)[-1]);source=data['source_text'];quote=source.split('\n\n',1)[0]
        # Coverage returns no duplicates. Main extraction remains nonempty.
        if 'extracted' in data:return {'facts':[]}
        facts=[{'subject':'','fact_key':'observed_scene','fact_value':quote,'certainty':'confirmed','quote':quote,'confidence':.8}]
        belief='“Ghi là chị nhận ra giọng giống ông. Ta cần một mẫu đối chứng.”'
        if belief in source:facts.append({'subject':'','fact_key':'unverified_voice_attribution','fact_value':'Linh nhận ra giọng giống cha, cần mẫu đối chứng; chưa xác minh danh tính','certainty':'reported','quote':belief,'confidence':.8})
        return {'facts':facts}
    return {'entities':[]}

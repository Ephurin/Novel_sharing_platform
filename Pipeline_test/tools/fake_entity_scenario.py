"""Explicit Wave1E fake scenario. Scripted decisions, NEVER model-quality evidence."""
def mixed_decisions(request):
    decisions=[]
    allowed=set(request.get('allowed_names',[]))
    for c in request['candidates']:
        surface=c['surface'];context=c['context']
        assert c['candidate_id'] and surface in context
        d=dict(candidate_id=c['candidate_id'],verdict='not_entity',canonical_name='',entity_type=None,
               canonical_entity_id='',identity_quote='',initial_status='Unknown',status_quote='',
               confidence=.7,reason='Explicit offline scenario: negative candidate, not a semantic model verdict')
        if surface=='Mai Linh':d.update(verdict='entity',canonical_name=surface,entity_type='PER')
        elif surface=='CV-04':d.update(verdict='entity',canonical_name=surface,entity_type='ORG',
            reason='Offline injected type mistake: author must correct source-supported ceramic item to ITEM')
        elif surface=='Linh' and 'Mai Linh' in context and 'Mai Linh' in allowed:
            d.update(verdict='entity',canonical_name='Mai Linh',entity_type='PER',identity_quote=context,
                reason='Offline alias fixture: source context mentions Mai Linh and Linh; not model-quality evidence')
        elif surface in {'An','Linh'}:d.update(verdict='unresolved',reason='Offline ambiguity branch requires explicit author resolution')
        decisions.append(d)
    return {'decisions':decisions}

"""Bounded P3 fake scenario. Structured plumbing only, not quality evidence."""
import json,re

def response(text,fallback):
    if 'Suggest future events for a novel' in text:
        match=re.search(r'Start at chapter (\d+)',text);start=int(match.group(1)) if match else 1
        return json.dumps({'events':[{'title':'P3 observe','description':'Mai Linh checks the note.','target_chapter':start,'min_words':1,'ending':False},{'title':'P3 resolved ending','description':'Duy closes the scene.','target_chapter':start+1,'min_words':1,'ending':True}]})
    if 'Evaluate whether the supplied actual prose' in text:
        return json.dumps({'achieved':True,'ending_resolved':True,'reason':'FAKE scripted functional evaluation'})
    return fallback

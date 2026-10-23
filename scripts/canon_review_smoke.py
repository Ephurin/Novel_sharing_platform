"""Author-controlled canon checkpoint shared by P8 smoke runners (test code only)."""
import hashlib,json
import httpx

def capture_canon(cur,novel_id):
 cur.execute('SELECT brain_version FROM narrative.story_brains WHERE novel_id=%s',(novel_id,));version=int(cur.fetchone()[0])
 projections={}
 for table in ['entities','events','facts']:
  cur.execute('SELECT coalesce(json_agg(t),\'[]\'::json) FROM narrative.'+table+' t WHERE novel_id=%s',(novel_id,))
  projections[table]=sorted(cur.fetchone()[0],key=lambda x:json.dumps(x,sort_keys=True))
 return dict(brain_version=version,projections=projections)

def review_revision(cur,backend_url,headers,novel_id,revision_id,before):
 current=capture_canon(cur,novel_id)
 assert current==before,'Canon changed before explicit author review'
 cur.execute('SELECT r.chapter_id,r.content,r.content_hash,c.latest_revision_id FROM chapter_revisions r JOIN chapters c ON c.chapter_id=r.chapter_id WHERE r.revision_id=%s AND r.novel_id=%s',(revision_id,novel_id));source=cur.fetchone()
 assert source and str(source[3])==revision_id,'Review source is no longer latest'
 assert hashlib.sha256(source[1].encode()).hexdigest()==source[2],'Immutable source hash mismatch'
 cur.execute("SELECT event_id,status,content_hash FROM revision_outbox_events WHERE revision_id=%s AND event_type='INCREMENTAL_ANALYSIS'",(revision_id,));outbox=cur.fetchall()
 assert len(outbox)==1 and outbox[0][1]=='COMPLETED' and outbox[0][2]==source[2],'Missing completed source/hash-scoped outbox'
 queue=httpx.get(backend_url+'/ai/story-brains/'+novel_id+'/review-queue',headers=headers,timeout=15);assert queue.status_code==200,queue.text
 proposals=[p for p in queue.json()['data'] if any(e.get('revision_id')==revision_id for e in p.get('evidence',[]))]
 assert proposals and all(p['status']=='pending' for p in proposals),'Extraction must yield pending source-scoped proposals'
 cur.execute("SELECT id,status,dependency_group_id FROM narrative.proposals WHERE novel_id=%s AND evidence @> %s::jsonb",(novel_id,json.dumps([{'revision_id':revision_id}])));durable=cur.fetchall()
 assert len(durable)==len(proposals) and all(p[1]=='pending' for p in durable),'Unexpected pre-review canonical decisions'
 groups={}
 for p in proposals:groups.setdefault(p['dependency_group_id'],[]).append(p['proposal_id'])
 decisions=[]
 for gid,ids in groups.items():
  prior=capture_canon(cur,novel_id);version=prior['brain_version'];url=backend_url+'/ai/proposal-groups/'+gid+'/accept';payload=dict(proposal_ids=ids,expected_brain_version=version,reason='P8_EXPLICIT_AUTHORIZED_AUTHOR_REVIEW')
  stale=httpx.post(url,json={**payload,'expected_brain_version':version+1},headers=headers,timeout=15);assert stale.status_code==409,stale.text;assert capture_canon(cur,novel_id)==prior,'Stale review mutated canon'
  accepted=httpx.post(url,json=payload,headers=headers,timeout=15);assert accepted.status_code==200,accepted.text
  after=capture_canon(cur,novel_id);assert after['brain_version']==version+1,'Author decision must increment version exactly once'
  replay=httpx.post(url,json={**payload,'expected_brain_version':version+1},headers=headers,timeout=15);assert replay.status_code==409,replay.text;assert capture_canon(cur,novel_id)==after,'Replay changed approved canon'
  decisions.append(dict(group_id=gid,proposal_ids=ids,request=payload,accept_status=accepted.status_code,stale_status=stale.status_code,replay_status=replay.status_code,brain_version_before=version,brain_version_after=after['brain_version']))
 final=capture_canon(cur,novel_id);assert final['projections']!=before['projections'],'Author review did not change approved canonical content'
 cur.execute("SELECT id,status,decision_reason FROM narrative.proposals WHERE novel_id=%s AND evidence @> %s::jsonb",(novel_id,json.dumps([{'revision_id':revision_id}])));accepted_rows=cur.fetchall();assert all(r[1]=='accepted' and r[2]=='P8_EXPLICIT_AUTHORIZED_AUTHOR_REVIEW' for r in accepted_rows)
 return dict(revision_id=revision_id,content_hash=source[2],outbox_event_id=str(outbox[0][0]),pending_proposal_ids=[p['proposal_id'] for p in proposals],canon_before=before,canon_before_review=current,canon_after=final,author_decisions=decisions,decision_origin='AUTHORIZED_AUTHOR_HTTP_GATEWAY',approved_once=True)

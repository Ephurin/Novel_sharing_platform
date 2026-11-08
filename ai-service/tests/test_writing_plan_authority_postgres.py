"""F04 executable worker probe. Real PG revision; recording offline provider.

Baseline expectations deliberately record the pre-fix exposure, not privacy PASS.
"""
import hashlib
import json
import uuid
from copy import deepcopy

import pytest
from sqlalchemy import text
from application.ports import RevisionContent
from application.writing_service import WritingService
from tests.test_p2_bootstrap_postgres import engine, f, TENANT, ACTOR, snapshot
from tests.test_plan_review_fixes_postgres import seed_legacy, FOREIGN

pytestmark = pytest.mark.postgres_integration


class SqlRevisionProvider:
    """Reads a real immutable Platform revision, without fabricated source_text."""
    def __init__(self, engine):
        self.engine = engine

    def get_revision(self, *, tenant_id, novel_id, chapter_id, revision_id):
        assert tenant_id == TENANT
        with self.engine.connect() as c:
            row = c.execute(text('SELECT r.*, c.chapter_number FROM chapter_revisions r JOIN chapters c USING (chapter_id) WHERE r.revision_id=:r AND r.novel_id=:n AND r.chapter_id=:c'),dict(r=revision_id,n=novel_id,c=chapter_id)).mappings().one()
        return RevisionContent(revision_id=str(row['revision_id']),novel_id=str(row['novel_id']),chapter_id=str(row['chapter_id']),content=row['content'],content_hash=row['content_hash'],chapter_number=row['chapter_number'])


class RecordingProvider:
    def __init__(self):
        self.payloads = []

    def generate_writing_draft(self, **kwargs):
        self.payloads.append(deepcopy(kwargs))
        return dict(draft_text='An authorized draft.',patch=dict(start=0,end=0,text='An authorized draft.'),model_info=dict(provider='recording-fake'))


@pytest.fixture
def worker(f):
    n,c,r = f.src.novel_id,f.src.chapter_id,f.src.revision_id
    content='A real immutable manuscript revision.'
    h=hashlib.sha256(content.encode()).hexdigest()
    with f.engine.begin() as db:
        db.execute(text("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES (:a,:email,:name,'offline-only','AUTHOR','ACTIVE') ON CONFLICT(user_id) DO NOTHING"),dict(a=ACTOR,email=ACTOR+'@example.test',name='f04-'+ACTOR))
        db.execute(text("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES (:n,:a,'F04 isolated',:slug,'offline')"),dict(n=n,a=ACTOR,slug='f04-'+n))
        db.execute(text("INSERT INTO chapters(chapter_id,novel_id,chapter_number,title,content,word_count) VALUES (:c,:n,1,'Source',:content,6)"),dict(c=c,n=n,content=content))
        db.execute(text("INSERT INTO chapter_revisions(revision_id,novel_id,chapter_id,content_hash,content,word_count,source_type,created_by) VALUES (:r,:n,:c,:h,:content,6,'AUTHOR_MANUAL',:a)"),dict(r=r,n=n,c=c,h=h,content=content,a=ACTOR))
        db.execute(text('UPDATE chapters SET latest_revision_id=:r WHERE chapter_id=:c'),dict(r=r,c=c))
    f.repo.get_story_brain(n)
    with f.engine.begin() as db:
        db.execute(text("UPDATE narrative.story_brains SET status='active',baseline_revision_id=:r WHERE novel_id=:n AND tenant_id=:t"),dict(r=r,n=n,t=TENANT))
    provider=RecordingProvider()
    service=WritingService(f.repo,provider,SqlRevisionProvider(f.engine))
    f.client.app.state.writing_service=service
    return f,service,provider,h


@pytest.mark.parametrize('creator',[None,FOREIGN,ACTOR,'no-plan'])
def test_baseline_async_provider_payload(worker,creator):
    f,service,provider,h=worker
    if creator!='no-plan':seed_legacy(f,creator,status='active')
    before=snapshot(f,'f04-baseline-before-'+str(creator))
    response=f.client.post('/v1/writing/generations',headers={**f.headers,'X-Author-Id':ACTOR},json=dict(novel_id=f.src.novel_id,chapter_id=f.src.chapter_id,revision_id=f.src.revision_id,content_hash=h,operation='continue',selection=dict(start=0,end=0,cursor=0),instruction='Continue safely',expected_brain_version=1,chapter_number=1,actor_id=ACTOR,idempotency_key=str(uuid.uuid4())))
    assert response.status_code==202,response.text
    job=f.repo.get_writing_job(response.json()['data']['job_id'])
    assert len(provider.payloads)==1,job
    payload=json.dumps(provider.payloads,default=str)
    exposed='LegacyTitlePrivate' in payload
    assert exposed==(creator!='no-plan')
    print('F04_BASELINE '+json.dumps(dict(creator=creator,job_id=job.job_id,status=job.status,error=job.error,provider_calls=len(provider.payloads),legacy_marker_in_exact_provider_payload=exposed,payloads=provider.payloads),default=str))
    after=snapshot(f,'f04-baseline-after-'+str(creator))
    for key in before:
        if key!='writing_generations':assert before[key]==after[key],key

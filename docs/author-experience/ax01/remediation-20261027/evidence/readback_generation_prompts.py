"""Run from ai-service with task-owned AX01_TEST_DATABASE_URL after tests."""
import hashlib
import json
import os
import sys
import uuid
from pathlib import Path
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
sys.path.insert(0, str(Path(__file__).resolve().parents[5] / 'ai-service'))
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.orm_models import EntityRecord, EventRecord, FactRecord

SOURCE_SHA = '47b194bb1b7783105827c08c27d42dfe7c984e54'
SOURCE_TREE = '61e689aaef2787f859b7328e83a31c4e2fd69a30'
TENANT = '00000000-0000-0000-0000-000000000001'
ACTOR = '00000000-0000-0000-0000-000000000002'
folder = Path(__file__).resolve().parent
engine = create_engine(os.environ['AX01_TEST_DATABASE_URL'])
factory = sessionmaker(engine, expire_on_commit=False)
repo = PostgresNarrativeRepository(factory, tenant_id=TENANT, actor_id=ACTOR)
readbacks = []
for path in sorted(folder.glob('H*.json')):
    capture = json.loads(path.read_text(encoding='utf-8'))
    job = repo.get_writing_job(capture['job_id'])
    assert job.status == capture['status']
    assert job.context_hash == capture['context_hash']
    profiles = []
    tokens = None
    if capture['transport_prompts']:
        prompt = capture['transport_prompts'][-1]['user']
        assert 'PRIVATE_SENTINEL' not in prompt
        context = json.loads(prompt.split('Bối cảnh tiểu thuyết (Story Brain): ', 1)[1].splitlines()[0])
        serialized = json.dumps(context, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
        digest = hashlib.sha256(serialized).hexdigest()
        assert digest == job.context_hash == capture['prompt_context_hash']
        tokens = (len(serialized) + 2) // 3
        profiles = [e['entity_id'] for e in context['entities'] if e.get('approved_profile')]
        assert profiles == job.context_summary['profile_entity_ids']
        assert all('author_notes' not in e for e in context['entities'])
    else:
        assert job.status == 'failed' and job.error['code'] == 'CONTEXT_SCOPE_EXCEEDS_MAX_TIER'
    with factory() as session:
        events = session.scalar(select(func.count()).select_from(EventRecord).where(EventRecord.novel_id == uuid.UUID(job.novel_id)))
        facts = session.scalar(select(func.count()).select_from(FactRecord).where(FactRecord.novel_id == uuid.UUID(job.novel_id)))
        versions = {str(row[0]): row[1] for row in session.execute(select(EntityRecord.id, EntityRecord.profile_version).where(EntityRecord.novel_id == uuid.UUID(job.novel_id)))}
    assert events == 0 and facts == 0
    readbacks.append({'case': capture['label'], 'job_id': job.job_id, 'novel_id': job.novel_id,
        'durable_status': job.status, 'durable_context_hash': job.context_hash,
        'captured_prompt_hash_matches_durable_job': bool(capture['transport_prompts']),
        'prompt_estimated_tokens': tokens, 'profile_entity_ids': profiles,
        'durable_profile_versions_current': versions, 'brain_version_used': job.brain_version_used,
        'scoped_event_count': events, 'scoped_fact_count': facts,
        'provider_called_for_this_capture': bool(capture['transport_prompts'])})
result = {'tested_source_sha': SOURCE_SHA, 'tested_tree_sha': SOURCE_TREE,
    'database': 'task-owned AX01 remediation PostgreSQL; fictional fixtures only',
    'provider': 'production LLMService prompt serializer, fake final _call_llm transport',
    'cases': readbacks}
(folder / 'readback.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({'cases': len(readbacks), 'provider_prompt_matches': sum(bool(r['captured_prompt_hash_matches_durable_job']) for r in readbacks), 'fail_closed_before_provider': sum(not r['provider_called_for_this_capture'] for r in readbacks), 'tested_source_sha': SOURCE_SHA}))
engine.dispose()

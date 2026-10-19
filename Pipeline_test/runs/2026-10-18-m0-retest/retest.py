"""Fresh-project M0 retest. Run once with start; poll explicitly thereafter."""
import importlib.util
import json
import sys
from pathlib import Path

RUN = Path(__file__).resolve().parent
OLD = RUN.parent / '2026-10-17-author-01'
spec = importlib.util.spec_from_file_location('driver', OLD / 'run_api.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
d.RUN = RUN
d.login()
api = d.api

if sys.argv[1] == 'start':
    state = {}
    if (RUN / 'state.json').exists():
        raise RuntimeError('Existing run: inspect state; do not blindly repeat.')
    for pipe in ['P1', 'P3', 'P2']:
        novel = api('POST', '/novels', {'title': f'{pipe} M0 retest 2026-10-18', 'synopsis': 'Isolated regression test; not a completed novel.', 'tags': ['pipeline-test', pipe]}, f'{pipe}-create')['novelId']
        state[pipe] = {'novel_id': novel}
        (RUN / 'state.json').write_text(json.dumps(state, indent=2), encoding='utf-8')
        if pipe == 'P2':
            body = json.loads((OLD / 'evidence/p2-idea-start.json').read_text(encoding='utf-8'))['request']
            body['novel_id'] = novel
            job = api('POST', '/ai/story-brains/bootstrap/from-idea', body, 'P2-start')
        else:
            revisions = []
            for n in range(1, 6):
                text = (d.ROOT / f'Pipeline_test/input/manuscript/ch{n:02}.md').read_text(encoding='utf-8-sig')
                title, content = text.split('\n', 1)
                content = content.strip()
                ch = api('POST', f'/novels/{novel}/chapters', {'title': title.lstrip('# ').strip(), 'content': content}, f'{pipe}-ch{n:02}')
                cid = ch['chapterId']
                rev = api('POST', f'/chapters/{cid}/revisions/snapshot', {'content': content, 'purpose': 'MANUSCRIPT_BOOTSTRAP'}, f'{pipe}-rev{n:02}')
                read = api('GET', f"/chapters/{cid}/revisions/{rev['revisionId']}", label=f'{pipe}-read{n:02}')
                assert read['content'] == content
                revisions.append({'chapter_id': cid, 'revision_id': rev['revisionId'], 'content_hash': rev['contentHash']})
            body = {'novel_id': novel, 'revisions': revisions, 'locale': 'vi-VN', 'options': {'extract_world_rules': True, 'build_embeddings': False, 'require_review_for_all': True}}
            job = api('POST', '/ai/story-brains/bootstrap/from-manuscript', body, f'{pipe}-start')
        state[pipe]['job_id'] = job['job_id']
        (RUN / 'state.json').write_text(json.dumps(state, indent=2), encoding='utf-8')
        print(pipe, job, flush=True)
elif sys.argv[1] == 'poll':
    state = json.loads((RUN / 'state.json').read_text())
    attempt = sys.argv[2]
    for pipe, info in state.items():
        job = api('GET', f"/ai/jobs/{info['job_id']}", label=f'{pipe}-poll-{attempt}')
        queue = api('GET', f"/ai/story-brains/{info['novel_id']}/review-queue", label=f'{pipe}-queue-{attempt}')
        print(pipe, json.dumps(job, ensure_ascii=False), 'queue_count', len(queue), flush=True)

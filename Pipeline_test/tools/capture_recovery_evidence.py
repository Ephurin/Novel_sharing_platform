"""Read-only snapshots for the UI recovery run. No generation, approval or DB writes."""
import argparse
import datetime
import json
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]


def sql(statement):
    return subprocess.check_output(['docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc', statement]).decode('utf-8').strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--novel-id', required=True)
    parser.add_argument('--phase', required=True)
    parser.add_argument('--cutoff', type=int, default=5)
    args = parser.parse_args()
    assert args.cutoff > 0
    assert re.fullmatch(r'[A-Za-z0-9_-]+', args.run_id)
    assert re.fullmatch(r'[A-Za-z0-9_-]+', args.phase)
    novel = str(uuid.UUID(args.novel_id))
    run = ROOT / 'Pipeline_test' / 'runs' / args.run_id
    output = run / 'evidence' / args.phase
    output.mkdir(parents=True, exist_ok=True)
    summary = {'checked_at': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(),
        'novel_id': novel, 'phase': args.phase, 'chapter_cutoff': args.cutoff,
        'author_writes': 0, 'provider_calls': 0}

    def save(name, value):
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    def get(path):
        request = urllib.request.Request('http://localhost:18000/v1/' + path,
            headers={'X-Service-Token': 'test-token', 'Authorization': 'Bearer test-token',
                     'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
                     'X-Request-Id': 'recovery-readonly-' + args.phase})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)['data']

    for name, path in [('official-memory.json', f'story-brains/{novel}/memory'),
        ('active-plan.json', f'story-plans/by-novel/{novel}/active'),
        *[(f'proposals-{status}.json', f'story-brains/{novel}/proposals?status={status}')
          for status in ['pending', 'accepted', 'rejected']]]:
        try:
            value = get(path)
            save(name, value)
            summary[name] = len(value) if isinstance(value, list) else {
                k: len(v) for k, v in value.items() if isinstance(v, list)}
        except urllib.error.HTTPError as exc:
            summary[name] = {'http_error': exc.code}
        except urllib.error.URLError as exc:
            summary[name] = {'transport_error': str(exc.reason)}
    chapters = json.loads(sql(f"""SELECT coalesce(json_agg(t ORDER BY chapter_number),'[]') FROM (
        SELECT c.chapter_number,c.chapter_id,c.title,c.status,r.revision_id,r.content,r.content_hash,r.word_count
        FROM chapters c JOIN LATERAL (SELECT * FROM chapter_revisions
        WHERE chapter_id=c.chapter_id ORDER BY created_at DESC LIMIT 1) r ON true
        WHERE c.novel_id='{novel}' AND c.deleted_at IS NULL) t;"""))
    save('revisions.json', chapters)
    summary['revision_count'] = len(chapters)
    summary['revision_words'] = sum(c['word_count'] for c in chapters)
    for name, statement in {
        'outbox.json': f"SELECT coalesce(json_agg(t),'[]') FROM (SELECT event_id,revision_id,status,retry_count,last_error FROM revision_outbox_events WHERE novel_id='{novel}') t;",
        'brain.json': f"SELECT coalesce(json_agg(t),'[]') FROM (SELECT brain_version,status,baseline_revision_id FROM narrative.story_brains WHERE novel_id='{novel}') t;",
        'decisions.json': f"SELECT coalesce(json_agg(t),'[]') FROM (SELECT d.proposal_id,d.decision,d.edited_payload,d.reason,d.decided_at FROM narrative.proposal_decisions d JOIN narrative.proposals p ON p.id=d.proposal_id WHERE p.novel_id='{novel}' ORDER BY d.decided_at) t;",
        'writing-generations.json': f"SELECT coalesce(json_agg(t),'[]') FROM (SELECT id,job_id,revision_id,brain_version,operation,status,stage,model_name,prompt_version,context_summary,error,validations,draft,created_at FROM narrative.writing_generations WHERE novel_id='{novel}' ORDER BY created_at) t;",
    }.items():
        save(name, json.loads(sql(statement)))
    for budget in [4000, 8192]:
        try:
            value = get(f'story-brains/{novel}/context-preview?chapter_number={args.cutoff}&character_name=Linh&token_budget={budget}')
            save(f'context-{budget}.json', value)
            summary[f'context-{budget}'] = {k: len(value[k]) for k in ['entities', 'recent_events', 'world_rules']}
        except urllib.error.HTTPError as exc:
            summary[f'context-{budget}'] = {'http_error': exc.code}
        except urllib.error.URLError as exc:
            summary[f'context-{budget}'] = {'transport_error': str(exc.reason)}
    save('summary.json', summary)
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()

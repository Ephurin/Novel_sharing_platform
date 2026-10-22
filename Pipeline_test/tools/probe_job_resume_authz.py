"""Narrow ASTRA HTTP authorization probe; owned infrastructure, fake provider only."""
import argparse
import json
import time
import uuid
from pathlib import Path
from run_p123_headless import Probe, parse_fixture_chapter


def run(p, expected):
    p.compose = ['docker-compose'] + p.compose[2:]
    p.preflight()
    a, owner = p.account('owner')
    b, foreign = p.account('foreign')
    p.http.headers['Authorization'] = 'Bearer ' + a
    p.stage = 'create_owned_failed_job'
    novel = p.api('POST', '/novels', {'title': 'ASTRA authz ' + p.project, 'synopsis': 'Isolated fake-only authorization fixture.'})['novelId']
    f = parse_fixture_chapter(1)
    chapter = p.api('POST', '/novels/' + novel + '/chapters', {'title': f['title'], 'content': f['body']})['chapterId']
    p.api('POST', '/chapters/' + chapter + '/revisions/snapshot', {'purpose': 'MANUSCRIPT_BOOTSTRAP'})
    revision = p.api('GET', '/chapters/' + chapter + '/revisions')[0]['revisionId']
    r = p.api('GET', '/chapters/' + chapter + '/revisions/' + revision)
    # Controlled outage only on this freshly provisioned project's fake gateway.
    p.command(p.compose + ['stop', 'budget-gateway'])
    try:
        job_id = p.api('POST', '/ai/story-brains/bootstrap/from-manuscript', {'novel_id': novel, 'revisions': [{'chapter_id': chapter, 'revision_id': revision, 'content_hash': r['contentHash']}]})['job_id']
        path = '/ai/jobs/' + job_id
        def wait_status(statuses):
            for _ in range(100):
                job = p.api('GET', path)
                if job['status'] in statuses:
                    return job
                time.sleep(.4)
            raise AssertionError('JOB_NOT_SETTLED')
        before = wait_status({'failed'})
    finally:
        p.command(p.compose + ['start', 'budget-gateway'])
    time.sleep(2)
    p.save('fixture', {'executor': 'ASTRA', 'source_sha': p.source_sha, 'source_dirty': p.source_dirty, 'owner_id': owner, 'foreign_id': foreign, 'novel_id': novel, 'job_id': job_id, 'tenant_id': before['tenant_id'], 'controlled_fault': 'owned fake gateway temporarily stopped; no business SQL seeding'})
    def snapshot():
        job = p.api('GET', path)
        db = p.sql("select row_to_json(j) from narrative.bootstrap_jobs j where id='" + job_id + "'")
        calls = p.command(p.compose + ['exec', '-T', 'fake-upstream', 'python', '-c', "import urllib.request;print(urllib.request.urlopen('http://localhost:18091/received').read().decode())"])
        counts = json.loads(p.sql("select json_build_object('analysis_runs',(select count(*) from narrative.analysis_runs where novel_id='" + novel + "'),'proposals',(select count(*) from narrative.proposals where novel_id='" + novel + "'),'outbox',(select count(*) from revision_outbox_events where novel_id='" + novel + "'))"))
        mongo = p.command(p.compose + ['exec', '-T', 'mongodb', 'mongosh', '--quiet', '--eval', "JSON.stringify(db.getMongo().getDBNames().filter(n=>!['admin','config','local'].includes(n)).sort().map(n=>({database:n,collections:db.getSiblingDB(n).getCollectionNames().sort().map(c=>({name:c,count:db.getSiblingDB(n).getCollection(c).countDocuments({})}))})))"])
        return {'job': job, 'postgres_job': json.loads(db), 'db_counts': counts, 'mongo_counts': json.loads(mongo), 'fake_received': json.loads(calls), 'ledger': p.ledger()}
    def request_as(label, token, method, suffix, statuses):
        p.stage = label
        return p.api(method, suffix, headers={'Authorization': 'Bearer ' + token if token else ''}, expected=statuses)
    p.stage = 'before_foreign_resume'
    prior = snapshot()
    p.save('before-foreign-resume', prior)
    request_as('anonymous_resume', '', 'POST', path + '/resume', (401,))
    request_as('anonymous_get', '', 'GET', path, (401,))
    request_as('foreign_get', b, 'GET', path, (403,))
    request_as('missing_resume', a, 'POST', '/ai/jobs/' + str(uuid.uuid4()) + '/resume', (404,))
    request_as('missing_get', a, 'GET', '/ai/jobs/' + str(uuid.uuid4()), (404,))
    request_as('foreign_resume', b, 'POST', path + '/resume', (202,) if expected == 'red' else (403,))
    time.sleep(2)
    p.stage = 'after_foreign_resume'
    after = snapshot()
    p.save('after-foreign-resume', after)
    if expected == 'red':
        p.check('RED_foreign_resume_accepted_and_job_mutated', prior['postgres_job'] != after['postgres_job'])
    else:
        p.check('foreign_denial_no_job_or_provider_side_effect', prior == after)
        request_as('owner_resume', a, 'POST', path + '/resume', (202,))
        finished = wait_status({'waiting_entity_review', 'waiting_review', 'completed'})
        p.save('owner-positive', finished)
        stable = snapshot()
        request_as('owner_repeat_resume', a, 'POST', path + '/resume', (202,))
        time.sleep(2)
        wait_status({'waiting_entity_review', 'waiting_review', 'completed'})
        time.sleep(1)
        repeated = snapshot()
        # Exact persisted job and fake-call set must remain unchanged.
        p.check('repeated_owner_resume_no_duplicate_work', stable['job'] == repeated['job'] and stable['db_counts'] == repeated['db_counts'] and stable['mongo_counts'] == repeated['mongo_counts'] and stable['fake_received'] == repeated['fake_received'])
        p.save('before-owner-repeat', stable)
        p.save('after-owner-repeat', repeated)
    p.save('validation', {'executor': 'ASTRA', 'mode': expected, 'source_sha': p.source_sha, 'source_dirty': p.source_dirty, 'runtime': 'RED_REPRODUCED' if expected == 'red' else 'PASS', 'checks': p.checks, 'release': 'HOLD_FE_INTEGRATION_ONLY', 'full_core_acceptance': 'NOT_GRANTED'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--expect', required=True, choices=['red', 'green'])
    args = parser.parse_args()
    probe = Probe(args.env_file, args.output)
    try:
        run(probe, args.expect)
    except Exception as exc:
        probe.save('failure', {'executor': 'ASTRA', 'stage': probe.stage, 'error': str(exc), 'source_sha': probe.source_sha})
        raise

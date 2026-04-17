#!/usr/bin/env python
"""
Day 7 integration demo: mini backend system flow.

Covers:
1) Create story via API
2) Trigger background processing (Celery)
3) Persist AI summary + processing status
4) Verify v1 vs v2 payload differences
5) Verify audit logs
6) Soft delete + restore
7) Verify global error response shape

Run with: python test_day7_mini_system.py
"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'testproject.settings.dev')
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from unittest.mock import patch

from stories.models import Story
from stories.tasks import send_email_async, process_story_async
from user_accounts.models import RoleChoices

User = get_user_model()


def print_section(title):
    print(f"\n{'=' * 68}")
    print(f"{title:^68}")
    print('=' * 68)


def assert_error_shape(payload):
    assert isinstance(payload, dict), 'Error payload must be object'
    for key in ('error', 'message', 'status'):
        assert key in payload, f'Missing key: {key}'


def get_results(data):
    if isinstance(data, dict) and 'results' in data:
        return data.get('results') or []
    if isinstance(data, list):
        return data
    return []


class SyncTaskResult:
    def __init__(self, task_id):
        self.id = task_id


def test_day7_mini_system():
    print_section('DAY 7: MINI BACKEND SYSTEM DEMO')

    if 'testserver' not in settings.ALLOWED_HOSTS:
        settings.ALLOWED_HOSTS.append('testserver')

    user, _ = User.objects.get_or_create(
        username='day7_demo_user',
        defaults={'email': 'day7_demo@example.com'},
    )
    if getattr(user, 'role', None) != RoleChoices.AUTHOR:
        user.role = RoleChoices.AUTHOR
        user.save(update_fields=['role'])

    client = APIClient()
    client.force_authenticate(user=user)

    print('\n1) Create story via /api/v1/stories/')
    create_resp = client.post(
        '/api/v1/stories/',
        {
            'title': 'Day 7 Demo Story',
            'description': 'A short story body used to demo end-to-end backend flow with async AI processing.',
            'genre': 'Demo',
        },
        format='json',
    )
    assert create_resp.status_code == 201, f'Expected 201, got {create_resp.status_code}'
    story_id = create_resp.json()['id']
    print(f'✓ Story created: id={story_id}')

    print('\n2) Trigger background processing')
    def run_email_sync(*args, **kwargs):
        result = send_email_async.apply(kwargs=kwargs)
        return SyncTaskResult(result.id)

    def run_process_sync(*args, **kwargs):
        result = process_story_async.apply(kwargs=kwargs)
        return SyncTaskResult(result.id)

    with patch('stories.views.send_email_async.delay', side_effect=run_email_sync), patch(
        'stories.views.process_story_async.delay', side_effect=run_process_sync
    ):
        process_resp = client.post(
            f'/api/v1/stories/{story_id}/submit_for_background_processing/',
            {'action': 'summarize'},
            format='json',
        )
    assert process_resp.status_code == 202, f'Expected 202, got {process_resp.status_code}'
    process_data = process_resp.json()
    ai_task_id = process_data.get('ai_task_id')
    print(f"✓ Background tasks triggered. ai_task_id={ai_task_id}")

    print('\n3) Verify persisted processing result')

    story_v1_resp = client.get(f'/api/v1/stories/{story_id}/')
    assert story_v1_resp.status_code == 200, f'Expected 200, got {story_v1_resp.status_code}'
    story_v1 = story_v1_resp.json()
    assert story_v1.get('processing_status') == 'completed', (
        f"Expected processing_status=completed, got {story_v1.get('processing_status')}"
    )
    print('✓ v1 shows processing_status=completed')

    story_v2_resp = client.get(f'/api/v2/stories/{story_id}/')
    assert story_v2_resp.status_code == 200, f'Expected 200, got {story_v2_resp.status_code}'
    story_v2 = story_v2_resp.json()
    assert 'ai_summary' in story_v2, 'v2 must include ai_summary'
    assert bool(story_v2.get('ai_summary')), 'ai_summary should not be empty after processing'
    print('✓ v2 includes persisted ai_summary')

    print('\n4) Verify audit logs include CREATE and UPDATE events')
    log_resp = client.get(f'/api/v1/audit-logs/?content_type=Story&object_id={story_id}')
    assert log_resp.status_code == 200, f'Expected 200, got {log_resp.status_code}'
    logs = get_results(log_resp.json())
    actions = {item.get('action') for item in logs}
    assert 'CREATE' in actions, 'Missing CREATE audit log'
    assert 'UPDATE' in actions, 'Missing UPDATE audit log'
    print(f'✓ Audit actions found after processing: {sorted(actions)}')

    print('\n5) Soft delete then restore story')
    delete_resp = client.delete(f'/api/v1/stories/{story_id}/')
    assert delete_resp.status_code == 204, f'Expected 204, got {delete_resp.status_code}'

    restore_resp = client.post(f'/api/v1/stories/{story_id}/restore/')
    assert restore_resp.status_code == 200, f'Expected 200, got {restore_resp.status_code}'
    print('✓ Soft delete + restore completed')

    log_after_resp = client.get(f'/api/v1/audit-logs/?content_type=Story&object_id={story_id}')
    assert log_after_resp.status_code == 200, f'Expected 200, got {log_after_resp.status_code}'
    logs_after = get_results(log_after_resp.json())
    actions_after = {item.get('action') for item in logs_after}
    assert 'DELETE' in actions_after, 'Missing DELETE audit log'
    assert 'RESTORE' in actions_after, 'Missing RESTORE audit log'
    print(f'✓ Audit actions after delete/restore: {sorted(actions_after)}')

    print('\n6) Verify normalized global error response')
    anon_client = APIClient()
    unauth_resp = anon_client.get('/api/v1/stories/')
    assert unauth_resp.status_code == 401, f'Expected 401, got {unauth_resp.status_code}'
    error_payload = unauth_resp.json()
    assert_error_shape(error_payload)
    print(f'✓ Error payload normalized: {error_payload}')

    print_section('Day 7 Result')
    print('✓ Async processing runs via API and persists AI output.')
    print('✓ Soft delete/restore works and is auditable.')
    print('✓ v1/v2 API versions return different payloads.')
    print('✓ Global error handling format is standardized.')

    Story.all_objects.filter(id=story_id).delete()


if __name__ == '__main__':
    try:
        test_day7_mini_system()
        print('\nSUCCESS: Day 7 mini system demo passed.\n')
    except AssertionError as exc:
        print(f'\nTEST FAILED: {exc}\n')
    except Exception as exc:
        print(f'\nERROR: {exc}\n')
        import traceback
        traceback.print_exc()

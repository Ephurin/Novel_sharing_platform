#!/usr/bin/env python
"""
Day 5 test: API versioning (/api/v1 and /api/v2).
Checks v1 and v2 run in parallel and return different story payloads.

Run with: python test_day5_api_versioning.py
"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'testproject.settings.dev')
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from stories.models import Story

User = get_user_model()


def print_section(title):
    print(f"\n{'=' * 60}")
    print(f"{title:^60}")
    print('=' * 60)


def get_first_result(response_json):
    if isinstance(response_json, dict) and 'results' in response_json:
        results = response_json.get('results') or []
        return results[0] if results else None
    if isinstance(response_json, list):
        return response_json[0] if response_json else None
    return None


def test_day5_versioning():
    print_section('DAY 5: API VERSIONING TEST')

    if 'testserver' not in settings.ALLOWED_HOSTS:
        settings.ALLOWED_HOSTS.append('testserver')

    user, _ = User.objects.get_or_create(
        username='version_test_user',
        defaults={
            'email': 'version_test@example.com',
            'first_name': 'Version',
            'last_name': 'Tester',
        },
    )

    story = Story.objects.create(
        author=user,
        title='Versioning Story',
        description='This is a story used to verify that v1 and v2 can return different response schemas.',
        genre='Tech',
    )

    client = APIClient()
    client.force_authenticate(user=user)

    print('\nChecking /api/v1/stories/...')
    v1_resp = client.get('/api/v1/stories/')
    assert v1_resp.status_code == 200, f'v1 status expected 200, got {v1_resp.status_code}'
    v1_item = get_first_result(v1_resp.json())
    assert v1_item is not None, 'v1 response has no story item'
    assert 'title' in v1_item, 'v1 missing title'
    assert 'ai_summary' not in v1_item, 'v1 should not include ai_summary'
    print('✓ v1 returns title and does NOT include ai_summary')

    print('Checking /api/v2/stories/...')
    v2_resp = client.get('/api/v2/stories/')
    assert v2_resp.status_code == 200, f'v2 status expected 200, got {v2_resp.status_code}'
    v2_item = get_first_result(v2_resp.json())
    assert v2_item is not None, 'v2 response has no story item'
    assert 'title' in v2_item, 'v2 missing title'
    assert 'ai_summary' in v2_item, 'v2 should include ai_summary'
    print('✓ v2 returns title + ai_summary')
    print(f"  ai_summary sample: {v2_item.get('ai_summary')}")

    print_section('Result')
    print('✓ Two API versions are running in parallel.')
    print('✓ v1 and v2 return different payload schemas as expected.')

    Story.all_objects.filter(id=story.id).delete()


if __name__ == '__main__':
    try:
        test_day5_versioning()
        print('\nSUCCESS: Day 5 API versioning test passed.\n')
    except AssertionError as exc:
        print(f'\nTEST FAILED: {exc}\n')
    except Exception as exc:
        print(f'\nERROR: {exc}\n')
        import traceback
        traceback.print_exc()

#!/usr/bin/env python
"""
Day 6 test: Global exception handling with standardized error response.

Expected format:
{
  "error": "...",
  "message": "...",
  "status": 400
}

Run with: python test_day6_exception_handling.py
"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'testproject.settings.dev')
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from stories.models import Story
from testproject.exceptions import AppError, custom_exception_handler

User = get_user_model()


def print_section(title):
    print(f"\n{'=' * 60}")
    print(f"{title:^60}")
    print('=' * 60)


def assert_error_shape(payload, expected_status):
    assert isinstance(payload, dict), 'Error payload must be a JSON object'
    assert 'error' in payload, 'Missing key: error'
    assert 'message' in payload, 'Missing key: message'
    assert 'status' in payload, 'Missing key: status'
    assert payload['status'] == expected_status, (
        f"Expected status field {expected_status}, got {payload['status']}"
    )


def test_day6_exception_handling():
    print_section('DAY 6: GLOBAL EXCEPTION HANDLING TEST')

    if 'testserver' not in settings.ALLOWED_HOSTS:
        settings.ALLOWED_HOSTS.append('testserver')

    user, _ = User.objects.get_or_create(
        username='exception_test_user',
        defaults={'email': 'exception_test@example.com'},
    )

    story = Story.objects.create(
        author=user,
        title='Exception Story',
        description='Story used for exception handling tests',
        genre='Test',
    )

    # 1) 401 unauthorized
    print('\n1) Testing 401 UNAUTHORIZED shape...')
    anon_client = APIClient()
    unauth_resp = anon_client.get('/api/v1/stories/')
    assert unauth_resp.status_code == 401, f'Expected 401, got {unauth_resp.status_code}'
    unauth_payload = unauth_resp.json()
    assert_error_shape(unauth_payload, 401)
    print(f"✓ 401 payload: {unauth_payload}")

    # 2) 404 not found
    print('\n2) Testing 404 NOT_FOUND shape...')
    auth_client = APIClient()
    auth_client.force_authenticate(user=user)
    not_found_resp = auth_client.get('/api/v1/stories/999999/')
    assert not_found_resp.status_code == 404, f'Expected 404, got {not_found_resp.status_code}'
    not_found_payload = not_found_resp.json()
    assert_error_shape(not_found_payload, 404)
    print(f"✓ 404 payload: {not_found_payload}")

    # 3) 400 validation error (missing credentials in token endpoint)
    print('\n3) Testing 400 INVALID_DATA shape...')
    bad_rate_resp = anon_client.post(
        '/api/token/',
        {},
        format='json',
    )
    assert bad_rate_resp.status_code == 400, f'Expected 400, got {bad_rate_resp.status_code}'
    bad_rate_payload = bad_rate_resp.json()
    assert_error_shape(bad_rate_payload, 400)
    print(f"✓ 400 payload: {bad_rate_payload}")

    # 4) Custom AppError shape
    print('\n4) Testing AppError payload shape...')
    app_error_response = custom_exception_handler(
        AppError(message='Demo app-level error', error='DEMO_APP_ERROR', status_code=422),
        {'request': None, 'view': None},
    )
    assert app_error_response is not None, 'custom_exception_handler returned None for AppError'
    assert app_error_response.status_code == 422, (
        f"Expected 422, got {app_error_response.status_code}"
    )
    assert_error_shape(app_error_response.data, 422)
    print(f"✓ AppError payload: {app_error_response.data}")

    print_section('Result')
    print('✓ Global exception handling is active.')
    print('✓ API errors are normalized to {error, message, status}.')

    Story.all_objects.filter(id=story.id).delete()


if __name__ == '__main__':
    try:
        test_day6_exception_handling()
        print('\nSUCCESS: Day 6 global exception handling test passed.\n')
    except AssertionError as exc:
        print(f'\nTEST FAILED: {exc}\n')
    except Exception as exc:
        print(f'\nERROR: {exc}\n')
        import traceback
        traceback.print_exc()

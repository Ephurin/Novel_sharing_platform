#!/usr/bin/env python
"""
Test script for Day 2 - Celery in action.
This demonstrates:
1. send_email_async - async email
2. process_story_async - async processing with retry/countdown
3. Checking task status
"""

import os
import django
import time

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "testproject.settings.dev")
django.setup()

from celery.result import AsyncResult
from stories.tasks import send_email_async, process_story_async

print("\n" + "="*70)
print("📋 DAY 2 - CELERY IN ACTION (Ngày 2 - Celery thực chiến)")
print("="*70)

# Test 1: Send email async
print("\n1️⃣ TEST: Send Email Async")
print("-" * 70)
email_task = send_email_async.delay(
    user_email="author@example.com",
    subject="Story published successfully!",
    message="Your story has been approved and published."
)
print(f"✓ Email task triggered: {email_task.id}")
print(f"  State: {email_task.state}")
print(f"  Waiting for result... (max 30s)")

# Wait for result
result = email_task.get(timeout=30)
print(f"  Result: {result}")

# Test 2: Process story with delay (countdown)
print("\n2️⃣ TEST: Process Story with Countdown (5 giây)")
print("-" * 70)
ai_task = process_story_async.apply_async(
    kwargs={
        'story_id': 1,
        'action': 'summarize'
    },
    countdown=5  # Delay 5 seconds before running
)
print(f"✓ AI processing task triggered: {ai_task.id}")
print(f"  Task will run after 5 seconds...")
print(f"  Waiting for result... (max 20s)")

# Wait for result
result = ai_task.get(timeout=20)
print(f"  Result: {result}")

# Test 3: Check task status at different stages
print("\n3️⃣ TEST: Track Task Status Over Time")
print("-" * 70)
task_with_delay = process_story_async.apply_async(
    kwargs={
        'story_id': 2,
        'action': 'classify'
    },
    countdown=3
)
task_id = task_with_delay.id
print(f"✓ Task created: {task_id}")

for i in range(6):
    result_obj = AsyncResult(task_id)
    print(f"  [{i}s] State: {result_obj.state}")
    if result_obj.state == 'SUCCESS':
        print(f"        Result: {result_obj.result}")
        break
    elif result_obj.state == 'FAILURE':
        print(f"        Error: {result_obj.info}")
        break
    time.sleep(1)

print("\n" + "="*70)
print("✅ DAY 2 TESTS COMPLETED!")
print("="*70)
print("\n📝 Summary:")
print("  ✓ send_email_async: task runs without waiting")
print("  ✓ process_story_async: demonstrates countdown (delay)")
print("  ✓ Task status tracking: can monitor progress")
print("\n🚀 Next: Test API endpoints with HTTP requests (Postman/curl)")
print("="*70 + "\n")

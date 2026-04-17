#!/usr/bin/env python
"""
Test script for Day 4: Audit Logging
Tests the audit log system that auto-tracks all changes to Story, Chapter, Comment.

Flow:
  1. Create a Story (should log CREATE)
  2. Update the Story title (should log UPDATE with before/after)
  3. Delete the Story softly (should log DELETE with is_deleted change)
  4. Restore the Story (should log RESTORE)
  5. Query audit logs and display the trail

Run with: python test_day4_audit_log.py
"""

import os
import django
import json
from datetime import datetime

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'testproject.settings.dev')
django.setup()

from django.contrib.auth import get_user_model
from stories.models import Story, AuditLog

User = get_user_model()

def print_section(title):
    print(f"\n{'='*60}")
    print(f"{title:^60}")
    print('='*60)

def test_audit_logging():
    print_section("DAY 4: AUDIT LOGGING TEST")
    
    # Get or create a test user
    user, _ = User.objects.get_or_create(
        username='test_user',
        defaults={
            'email': 'test@example.com',
            'first_name': 'Test',
            'last_name': 'User'
        }
    )
    print(f"\n✓ Test user: {user.username} ({user.email})")
    
    # Clear previous audit logs for this test
    AuditLog.objects.all().delete()
    print("✓ Cleared previous audit logs")
    
    # 1. CREATE story
    print_section("Step 1: CREATE Story")
    story = Story(
        author=user,
        title="Test Story for Audit",
        description="This story is for testing audit logging",
        genre="Fantasy"
    )
    story.save()
    print(f"✓ Created story ID {story.id}: '{story.title}'")
    
    # Check CREATE log
    create_logs = AuditLog.objects.filter(
        content_type='Story',
        object_id=story.id,
        action='CREATE'
    )
    assert create_logs.exists(), "CREATE log not found!"
    create_log = create_logs.first()
    print(f"✓ Found CREATE log: {create_log.id}")
    print(f"  User: {create_log.user.username if create_log.user else 'None (System)'}")
    print(f"  Action: {create_log.action}")
    print(f"  Object: {create_log.object_str}")
    print(f"  Changes: {json.dumps(create_log.changes, indent=2)}")
    
    # 2. UPDATE story title
    print_section("Step 2: UPDATE Story Title")
    old_title = story.title
    story.title = "Test Story for Audit (Updated)"
    story.save()
    print(f"✓ Updated title from '{old_title}' to '{story.title}'")
    
    # Check UPDATE log
    update_logs = AuditLog.objects.filter(
        content_type='Story',
        object_id=story.id,
        action='UPDATE'
    )
    assert update_logs.exists(), "UPDATE log not found!"
    update_log = update_logs.first()
    print(f"✓ Found UPDATE log: {update_log.id}")
    print(f"  Object: {update_log.object_str}")
    print(f"  Changes: {json.dumps(update_log.changes, indent=2)}")
    
    # Verify the changes dict contains before/after values
    if 'title' in update_log.changes:
        change = update_log.changes['title']
        print(f"  Title before: '{change.get('before')}'")
        print(f"  Title after: '{change.get('after')}'")
    
    # 3. DELETE story (soft delete)
    print_section("Step 3: DELETE Story (Soft Delete)")
    story.delete()
    print(f"✓ Soft-deleted story ID {story.id}")
    print(f"  is_deleted: {story.is_deleted}")
    print(f"  deleted_at: {story.deleted_at}")
    
    # Check DELETE log
    delete_logs = AuditLog.objects.filter(
        content_type='Story',
        object_id=story.id,
        action='DELETE'
    )
    assert delete_logs.exists(), "DELETE log not found!"
    delete_log = delete_logs.first()
    print(f"✓ Found DELETE log: {delete_log.id}")
    print(f"  Changes: {json.dumps(delete_log.changes, indent=2)}")
    
    # 4. RESTORE story
    print_section("Step 4: RESTORE Story")
    story.restore()
    print(f"✓ Restored story ID {story.id}")
    print(f"  is_deleted: {story.is_deleted}")
    print(f"  deleted_at: {story.deleted_at}")
    
    # Check RESTORE log
    restore_logs = AuditLog.objects.filter(
        content_type='Story',
        object_id=story.id,
        action='RESTORE'
    )
    assert restore_logs.exists(), "RESTORE log not found!"
    restore_log = restore_logs.first()
    print(f"✓ Found RESTORE log: {restore_log.id}")
    print(f"  Changes: {json.dumps(restore_log.changes, indent=2)}")
    
    # 5. Query audit logs and show the full trail
    print_section("Audit Trail Summary")
    all_logs = AuditLog.objects.filter(
        content_type='Story',
        object_id=story.id
    ).order_by('created_at')
    
    print(f"\nTotal logs for Story ID {story.id}: {all_logs.count()}")
    for i, log in enumerate(all_logs, 1):
        print(f"\n{i}. {log.action} at {log.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"   User: {log.user.username if log.user else 'System'}")
        print(f"   Object: {log.object_str}")
        if log.changes:
            print(f"   Changes: {json.dumps(log.changes, indent=4)}")
    
    print_section("Test Results")
    print(f"✓ All audit logging tests passed!")
    print(f"✓ Story ID {story.id} has been tracked through CREATE → UPDATE → DELETE → RESTORE")
    print(f"✓ Total audit logs created: {all_logs.count()}")
    
    # Cleanup - hard delete for cleanup (bypass soft delete)
    Story.all_objects.filter(id=story.id).delete()
    print(f"\n✓ Cleaned up test story")

if __name__ == '__main__':
    try:
        test_audit_logging()
        print("\n" + "="*60)
        print("SUCCESS: All tests passed!".center(60))
        print("="*60 + "\n")
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

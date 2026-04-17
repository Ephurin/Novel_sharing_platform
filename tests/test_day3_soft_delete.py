#!/usr/bin/env python
"""
Test script for Day 3 - Soft Delete (Xóa mềm).
Demonstrates:
1. Hard delete vs Soft delete
2. Soft delete (objects vs all_objects manager)
3. Restore functionality
"""

import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "testproject.settings.dev")
django.setup()

from stories.models import Story, Chapter, Comment, User
from django.contrib.auth import get_user_model

print("\n" + "="*70)
print("🧹 DAY 3 - SOFT DELETE (Xóa mềm)")
print("="*70)

# Prepare test data
User = get_user_model()
author = User.objects.first() or User.objects.create_user(
    username='test_author',
    email='author@test.com',
    password='testpass123'
)

# Test 1: Create a story
print("\n1️⃣ CREATE: Create test story")
print("-" * 70)
story = Story.objects.create(
    author=author,
    title="Test Story for Soft Delete",
    description="This story will be deleted and restored."
)
print(f"✓ Story created: ID={story.id}, is_deleted={story.is_deleted}")

# Test 2: Normal list (only active items)
print("\n2️⃣ LIST (Active only): Using objects manager")
print("-" * 70)
active_stories = Story.objects.all()
print(f"Active stories count: {active_stories.count()}")
print(f"Stories: {[s.title for s in active_stories]}")

# Test 3: Soft delete
print("\n3️⃣ DELETE: Soft delete the story")
print("-" * 70)
story.delete()
print(f"✓ Story deleted (soft): is_deleted={story.is_deleted}, deleted_at={story.deleted_at}")

# Check that it's gone from active list
active_stories_after_delete = Story.objects.all()
print(f"Active stories count after delete: {active_stories_after_delete.count()}")
print(f"Story in active list? {story in active_stories_after_delete}")

# Test 4: View all items including deleted (all_objects)
print("\n4️⃣ LIST (All items): Using all_objects manager")
print("-" * 70)
all_stories = Story.all_objects.all()
print(f"All stories count (including deleted): {all_stories.count()}")
for s in all_stories:
    status = "DELETED" if s.is_deleted else "ACTIVE"
    print(f"  - {s.title}: {status} (deleted_at={s.deleted_at})")

# Test 5: Restore
print("\n5️⃣ RESTORE: Restore the deleted story")
print("-" * 70)
story.refresh_from_db()
print(f"Before restore: is_deleted={story.is_deleted}")
story.restore()
print(f"After restore: is_deleted={story.is_deleted}, deleted_at={story.deleted_at}")

# Check that it's back in active list
active_stories_after_restore = Story.objects.all()
print(f"Active stories count after restore: {active_stories_after_restore.count()}")
print(f"Story in active list? {story in active_stories_after_restore}")

# Test 6: Cascade soft delete (Chapter under Story)
print("\n6️⃣ CASCADE: Test Chapter soft delete when story is deleted")
print("-" * 70)
chapter = Chapter.objects.create(
    story=story,
    title="Chapter 1",
    content="Test chapter content"
)
print(f"✓ Chapter created: ID={chapter.id}, is_deleted={chapter.is_deleted}")

# Delete story again
story.delete()
chapter.refresh_from_db()
print(f"After story delete: chapter.is_deleted={chapter.is_deleted}")
print("Note: Chapter is NOT automatically soft-deleted (requires explicit handling)")
print("      This is by design - you can decide per-app whether to cascade")

# Test 7: Hard delete still possible if needed
print("\n7️⃣ HARD DELETE: If REALLY needed, use hard delete bypassing soft delete")
print("-" * 70)
chapter.delete()  # This soft-deletes
chapter_deleted_query = Chapter.all_objects.filter(title="Chapter 1").first()
print(f"Chapter after delete() call: is_deleted={chapter_deleted_query.is_deleted}")

# If needed to hard-delete, can do:
# Chapter.all_objects.filter(title="Chapter 1").delete() but avoid this usually
chapter_deleted_query.pk = chapter.pk
chapter_deleted_query.is_deleted = True
chapter_deleted_query.save()
print("(Soft delete applied - hard delete not executed)")

print("\n" + "="*70)
print("✅ DAY 3 TESTS COMPLETED!")
print("="*70)
print("\n📝 Key Concepts:")
print("  ✓ Hard delete: data gone forever (危险)")
print("  ✓ Soft delete: mark as deleted, data still in DB")
print("  ✓ objects manager: only active items (for API/UI)")
print("  ✓ all_objects manager: all items including deleted (for restore/audit)")
print("  ✓ restore(): bring back deleted items")
print("\n🚀 API Endpoints for Day 3:")
print("  - DELETE /api/stories/{id}/: soft delete")
print("  - POST /api/stories/{id}/restore/: restore deleted story")
print("  - DELETE /api/chapters/{id}/: soft delete chapter")
print("  - POST /api/chapters/{id}/restore/: restore deleted chapter")
print("  - DELETE /api/comments/{id}/: soft delete comment")
print("  - POST /api/comments/{id}/restore/: restore deleted comment")
print("="*70 + "\n")

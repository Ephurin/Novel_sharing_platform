"""
Ngày 4 - Audit Log Signals
Auto-log khi Story, Chapter, Comment được tạo/cập nhật/xóa/restore.
Soft delete gracefully logs DELETE action via post_save signal detecting is_deleted change.
"""

import logging
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from .models import Story, Chapter, Comment, AuditLog, AuditLogAction

logger = logging.getLogger(__name__)


def get_model_changes(instance, old_values):
    """
    So sánh old_values với current instance để tìm thay đổi.
    Returns dict: {"field": {"before": old_val, "after": new_val}}
    """
    changes = {}
    tracked_fields = [
        'title',
        'description',
        'content',
        'status',
        'is_deleted',
        'processing_status',
        'ai_summary',
    ]
    
    for field in tracked_fields:
        if hasattr(instance, field):
            old_val = old_values.get(field)
            new_val = getattr(instance, field)
            
            # So sánh, bỏ qua nếu không thay đổi
            if old_val != new_val:
                changes[field] = {
                    "before": str(old_val) if old_val is not None else None,
                    "after": str(new_val) if new_val is not None else None,
                }
    
    return changes


def _attach_old_values(instance, model_cls):
    """Attach previous tracked values to instance before save for diff logging."""
    if not instance.pk:
        return

    manager = getattr(model_cls, 'all_objects', model_cls.objects)
    tracked_fields = [
        'title',
        'description',
        'content',
        'status',
        'is_deleted',
        'processing_status',
        'ai_summary',
    ]
    model_field_names = {field.name for field in model_cls._meta.fields}
    selected_fields = [field for field in tracked_fields if field in model_field_names]
    if not selected_fields:
        return

    previous = manager.filter(pk=instance.pk).values(*selected_fields).first()
    if previous:
        instance._old_values = previous


@receiver(pre_save, sender=Story)
def capture_story_old_values(sender, instance, **kwargs):
    _attach_old_values(instance, Story)


@receiver(pre_save, sender=Chapter)
def capture_chapter_old_values(sender, instance, **kwargs):
    _attach_old_values(instance, Chapter)


@receiver(pre_save, sender=Comment)
def capture_comment_old_values(sender, instance, **kwargs):
    _attach_old_values(instance, Comment)


@receiver(post_save, sender=Story)
def log_story_change(sender, instance, created, **kwargs):
    """Log khi Story được tạo, cập nhật, hoặc soft-delete."""
    try:
        user = getattr(instance, '_user_from_request', None) or getattr(instance, 'author', None)
        
        # Check if this is a soft delete (is_deleted changed from False to True)
        old_is_deleted = None
        if hasattr(instance, '_old_values'):
            old_is_deleted = instance._old_values.get('is_deleted')
        
        # Determine action
        if created:
            action = AuditLogAction.CREATE
            changes = {}
        elif old_is_deleted is False and instance.is_deleted is True:
            # Soft delete
            action = AuditLogAction.DELETE
            changes = {"is_deleted": {"before": False, "after": True}}
        elif old_is_deleted is True and instance.is_deleted is False:
            # Restore
            action = AuditLogAction.RESTORE
            changes = {"is_deleted": {"before": True, "after": False}}
        else:
            # Regular update
            action = AuditLogAction.UPDATE
            changes = {}
            if hasattr(instance, '_old_values'):
                changes = get_model_changes(instance, instance._old_values)
        
        # Tạo audit log
        AuditLog.objects.create(
            user=user,
            action=action,
            content_type='Story',
            object_id=instance.id,
            object_str=instance.title,
            changes=changes,
        )
        
        logger.info(f"[AuditLog] Story {action}: {instance.id} - {instance.title}")
    except Exception as e:
        logger.error(f"[AuditLog] Error logging Story change: {e}")


@receiver(post_save, sender=Chapter)
def log_chapter_change(sender, instance, created, **kwargs):
    """Log khi Chapter được tạo, cập nhật, hoặc soft-delete."""
    try:
        user = getattr(instance, '_user_from_request', None)
        if user is None and getattr(instance, 'story', None):
            user = instance.story.author
        
        # Check if this is a soft delete
        old_is_deleted = None
        if hasattr(instance, '_old_values'):
            old_is_deleted = instance._old_values.get('is_deleted')
        
        # Determine action
        if created:
            action = AuditLogAction.CREATE
            changes = {}
        elif old_is_deleted is False and instance.is_deleted is True:
            # Soft delete
            action = AuditLogAction.DELETE
            changes = {"is_deleted": {"before": False, "after": True}}
        elif old_is_deleted is True and instance.is_deleted is False:
            # Restore
            action = AuditLogAction.RESTORE
            changes = {"is_deleted": {"before": True, "after": False}}
        else:
            # Regular update
            action = AuditLogAction.UPDATE
            changes = {}
            if hasattr(instance, '_old_values'):
                changes = get_model_changes(instance, instance._old_values)
        
        AuditLog.objects.create(
            user=user,
            action=action,
            content_type='Chapter',
            object_id=instance.id,
            object_str=f"{instance.story.title} - {instance.title}",
            changes=changes,
        )
        
        logger.info(f"[AuditLog] Chapter {action}: {instance.id} - {instance.title}")
    except Exception as e:
        logger.error(f"[AuditLog] Error logging Chapter change: {e}")


@receiver(post_save, sender=Comment)
def log_comment_change(sender, instance, created, **kwargs):
    """Log khi Comment được tạo, cập nhật, hoặc soft-delete."""
    try:
        user = instance.user  # Comment luôn có user
        
        # Check if this is a soft delete
        old_is_deleted = None
        if hasattr(instance, '_old_values'):
            old_is_deleted = instance._old_values.get('is_deleted')
        
        # Determine action
        if created:
            action = AuditLogAction.CREATE
            changes = {}
        elif old_is_deleted is False and instance.is_deleted is True:
            # Soft delete
            action = AuditLogAction.DELETE
            changes = {"is_deleted": {"before": False, "after": True}}
        elif old_is_deleted is True and instance.is_deleted is False:
            # Restore
            action = AuditLogAction.RESTORE
            changes = {"is_deleted": {"before": True, "after": False}}
        else:
            # Regular update
            action = AuditLogAction.UPDATE
            changes = {}
            if hasattr(instance, '_old_values'):
                changes = get_model_changes(instance, instance._old_values)
        
        # object_str: display story hoặc chapter mà comment này thuộc về
        if instance.story:
            object_str = f"Comment on Story: {instance.story.title}"
        elif instance.chapter:
            object_str = f"Comment on Chapter: {instance.chapter.title}"
        else:
            object_str = "Comment"
        
        AuditLog.objects.create(
            user=user,
            action=action,
            content_type='Comment',
            object_id=instance.id,
            object_str=object_str,
            changes=changes,
        )
        
        logger.info(f"[AuditLog] Comment {action}: {instance.id}")
    except Exception as e:
        logger.error(f"[AuditLog] Error logging Comment change: {e}")

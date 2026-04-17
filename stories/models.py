from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models
from django.core.validators import MaxValueValidator, MinValueValidator
from django.forms import ValidationError

User = settings.AUTH_USER_MODEL


class StoryProcessingStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    PROCESSING = 'processing', 'Processing'
    COMPLETED = 'completed', 'Completed'
    FAILED = 'failed', 'Failed'


# Ngày 3 - Soft Delete: Custom Manager để filter deleted items
class ActiveManager(models.Manager):
    """
    Manager mặc định: chỉ trả active items (is_deleted=False).
    Thường dùng cho display/API.
    """
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class AllObjectsManager(models.Manager):
    """
    Manager cho tất cả items kể cả deleted (is_deleted=True).
    Dùng khi cần xem/restore items bị xóa.
    """
    def get_queryset(self):
        return super().get_queryset()


# Ngày 5 - Domain chính: Story chỉ giữ thông tin chung, trạng thái nằm ở Chapter
class Story(models.Model):
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='stories'
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    genre = models.CharField(max_length=100, blank=True, db_index=True)
    view_count = models.PositiveIntegerField(default=0)
    cover_image = models.ImageField(
        upload_to='stories/covers/',
        blank=True,
        null=True,
        validators=[FileExtensionValidator(allowed_extensions=['jpg', 'jpeg', 'png', 'webp'])],
    )
    ai_summary = models.TextField(blank=True, default='')
    processing_status = models.CharField(
        max_length=20,
        choices=StoryProcessingStatus.choices,
        default=StoryProcessingStatus.PENDING,
        db_index=True,
    )

    # Ngày 3 - Soft Delete
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Ngày 3 - Managers: objects = active only, all_objects = tất cả
    objects = ActiveManager()
    all_objects = AllObjectsManager()

    class Meta:
        verbose_name = "Story"
        verbose_name_plural = "Stories" 

    def __str__(self):
        return self.title

    def delete(self, using=None, keep_parents=False):
        """
        Soft delete: đánh dấu is_deleted=True thay vì xóa thật.
        """
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])

    def restore(self):
        """Restore story bị xóa mềm."""
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=['is_deleted', 'deleted_at'])


# Ngày 5 - B4: Định nghĩa trạng thái cho Chapter (workflow: draft → pending → approved → published)
class ChapterStatus(models.TextChoices):
    DRAFT     = 'draft',     'Draft'
    PENDING   = 'pending',   'Pending'
    APPROVED  = 'approved',  'Approved'
    PUBLISHED = 'published', 'Published'
    REJECTED  = 'rejected',  'Rejected'


# Mỗi chương thuộc một truyện và có trạng thái riêng
class Chapter(models.Model):
    story = models.ForeignKey(
        Story,
        on_delete=models.CASCADE,
        related_name='chapters'
    )
    title = models.CharField(max_length=255)
    content = models.TextField()

    # Ngày 5 - B4: trạng thái của chương, dùng cho logic duyệt của Editor
    status = models.CharField(
        max_length=20,
        choices=ChapterStatus.choices,
        default=ChapterStatus.DRAFT,
    )

    # Editor review fields
    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_chapters',
    )
    review_note = models.TextField(blank=True, default='')

    # Ngày 3 - Soft Delete
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Ngày 3 - Managers
    objects = ActiveManager()
    all_objects = AllObjectsManager()

    def __str__(self):
        return f"{self.story.title} - {self.title}"

    def delete(self, using=None, keep_parents=False):
        """Soft delete: đánh dấu is_deleted=True."""
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])

    def restore(self):
        """Restore chapter bị xóa mềm."""
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=['is_deleted', 'deleted_at'])

class Comment(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='comments'
    )
    story = models.ForeignKey(
        Story,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='comments'
    )
    chapter = models.ForeignKey(
        Chapter,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='comments'
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='replies'
    )
    content = models.TextField()

    # Ngày 3 - Soft Delete
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Ngày 3 - Managers
    objects = ActiveManager()
    all_objects = AllObjectsManager()

    def clean(self):
        # Một comment chỉ được liên kết với một story hoặc một chapter, không thể cả hai
        if self.story and self.chapter:
            raise ValidationError("A comment can only be associated with either a story or a chapter, not both.")
        if self.parent:
            if self.parent.story and self.story != self.parent.story:
                raise ValidationError("Reply's story must match parent comment's story.")
            if self.parent.chapter and self.chapter != self.parent.chapter:
                raise ValidationError("Reply's chapter must match parent comment's chapter.")

    def __str__(self):
        return f"Comment by {self.user}"

    def delete(self, using=None, keep_parents=False):
        """Soft delete: đánh dấu is_deleted=True."""
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])

    def restore(self):
        """Restore comment bị xóa mềm."""
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=['is_deleted', 'deleted_at'])


class StoryRating(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='story_ratings',
    )
    story = models.ForeignKey(
        Story,
        on_delete=models.CASCADE,
        related_name='ratings',
    )
    score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'story'],
                name='unique_story_rating_per_user',
            )
        ]

    def __str__(self):
        return f"{self.user} rated {self.story} = {self.score}"


class StoryLike(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='story_likes',
    )
    story = models.ForeignKey(
        Story,
        on_delete=models.CASCADE,
        related_name='likes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'story'],
                name='unique_story_like_per_user',
            )
        ]

    def __str__(self):
        return f"{self.user} liked {self.story}"


# Ngày 4 - Audit Log: theo dõi mọi thay đổi data
class AuditLogAction(models.TextChoices):
    CREATE = 'CREATE', 'Create'
    UPDATE = 'UPDATE', 'Update'
    DELETE = 'DELETE', 'Delete'
    RESTORE = 'RESTORE', 'Restore'


class AuditLog(models.Model):
    """
    Audit log lưu mọi thay đổi trên Story, Chapter, Comment.
    Dùng cho tracking + compliance + debug.
    """
    # Ai làm thay đổi (null nếu is system/cron)
    user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='audit_logs'
    )
    
    # Loại action
    action = models.CharField(
        max_length=20,
        choices=AuditLogAction.choices,
    )
    
    # Loại object (Story, Chapter, Comment)
    content_type = models.CharField(
        max_length=50,
        help_text="Model name: Story, Chapter, Comment"
    )
    
    # ID của object bị thay đổi
    object_id = models.IntegerField()
    
    # Tên/title của object (để dễ đọc khi query log)
    object_str = models.CharField(max_length=255, blank=True)
    
    # Changes: JSON của before/after
    # VD: {"title": {"before": "Old Title", "after": "New Title"}}
    changes = models.JSONField(default=dict, blank=True)
    
    # Thời gian thay đổi
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    
    class Meta:
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['content_type', 'object_id', '-created_at']),
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['action', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.action} {self.content_type}#{self.object_id} by {self.user} at {self.created_at}"

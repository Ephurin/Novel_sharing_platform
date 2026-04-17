from rest_framework import viewsets, status as http_status
from rest_framework import status
from django.db.models import Avg, F
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from .models import Story, Chapter, ChapterStatus, Comment, StoryLike, StoryRating, AuditLog, StoryProcessingStatus
from .serializers import StorySerializer, ChapterSerializer, CommentSerializer, AuditLogSerializer
from .permissions import (
    IsAuthenticatedWithRole,
    StoryPermission,
    ChapterPermission,
    CommentPermission,
    IsEditorOnly,
)
from .selectors import get_story_queryset_for_user, get_chapter_queryset_for_user
from .services import (
    WorkflowError,
    approve_chapter,
    publish_chapter,
    reject_chapter,
    submit_chapter_for_review,
)

try:
    from celery.result import AsyncResult
    from .tasks import send_email_async, process_story_async
    CELERY_AVAILABLE = True
except (ImportError, ModuleNotFoundError):
    CELERY_AVAILABLE = False
    AsyncResult = None


class StoryViewSet(viewsets.ModelViewSet):
    """API CRUD cho Story – lọc queryset theo role của user đang đăng nhập."""

    queryset = Story.objects.all()
    serializer_class = StorySerializer
    permission_classes = [IsAuthenticatedWithRole, StoryPermission]

    def get_queryset(self):
        queryset = get_story_queryset_for_user(self.request.user).annotate(
            average_rating=Avg('ratings__score')
        )

        params = self.request.query_params

        search = params.get('search')
        if search:
            queryset = queryset.filter(title__icontains=search)

        genre = params.get('genre')
        if genre:
            queryset = queryset.filter(genre__iexact=genre)

        chapter_status = params.get('status') or params.get('chapter_status')
        if chapter_status:
            queryset = queryset.filter(chapters__status=chapter_status)

        min_rating = params.get('min_rating')
        if min_rating:
            try:
                queryset = queryset.filter(average_rating__gte=float(min_rating))
            except ValueError:
                pass

        max_rating = params.get('max_rating')
        if max_rating:
            try:
                queryset = queryset.filter(average_rating__lte=float(max_rating))
            except ValueError:
                pass

        ordering = params.get('ordering', 'newest')
        if ordering == 'oldest':
            queryset = queryset.order_by('created_at')
        elif ordering == 'most_viewed':
            queryset = queryset.order_by('-view_count', '-created_at')
        elif ordering == 'top_rated':
            queryset = queryset.order_by('-average_rating', '-created_at')
        else:
            queryset = queryset.order_by('-created_at')

        return queryset.distinct()

    def retrieve(self, request, *args, **kwargs):
        story = self.get_object()
        Story.objects.filter(pk=story.pk).update(view_count=F('view_count') + 1)
        story.refresh_from_db(fields=['view_count'])
        serializer = self.get_serializer(story)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole, StoryPermission],
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_cover(self, request, pk=None):
        story = self.get_object()
        image_file = request.FILES.get('cover_image')

        if not image_file:
            return Response(
                {'detail': 'cover_image is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = getattr(image_file, 'content_type', '') or ''
        if not content_type.startswith('image/'):
            return Response(
                {'detail': 'Uploaded file must be an image.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_size_mb = 5
        if image_file.size > max_size_mb * 1024 * 1024:
            return Response(
                {'detail': f'Image size must be <= {max_size_mb}MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        story.cover_image = image_file
        story.save(update_fields=['cover_image', 'updated_at'])

        serializer = self.get_serializer(story)
        return Response(
            {
                'detail': 'Cover image uploaded successfully.',
                'story': serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=['post', 'delete'],
        permission_classes=[IsAuthenticatedWithRole],
    )
    def rate(self, request, pk=None):
        story = self.get_object()

        if request.method == 'DELETE':
            deleted_count, _ = StoryRating.objects.filter(
                story=story,
                user=request.user,
            ).delete()
            return Response(
                {
                    'detail': 'Rating removed.' if deleted_count else 'No rating found.',
                    'average_rating': story.ratings.aggregate(avg=Avg('score'))['avg'],
                    'ratings_count': story.ratings.count(),
                }
            )

        score = request.data.get('score')
        try:
            score = int(score)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'score must be an integer from 1 to 5.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if score < 1 or score > 5:
            return Response(
                {'detail': 'score must be between 1 and 5.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rating, created = StoryRating.objects.update_or_create(
            story=story,
            user=request.user,
            defaults={'score': score},
        )
        return Response(
            {
                'detail': 'Rating created.' if created else 'Rating updated.',
                'rating': rating.score,
                'average_rating': story.ratings.aggregate(avg=Avg('score'))['avg'],
                'ratings_count': story.ratings.count(),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=['post', 'delete'],
        permission_classes=[IsAuthenticatedWithRole],
    )
    def like(self, request, pk=None):
        story = self.get_object()

        if request.method == 'DELETE':
            deleted_count, _ = StoryLike.objects.filter(
                story=story,
                user=request.user,
            ).delete()
            return Response(
                {
                    'detail': 'Like removed.' if deleted_count else 'No like found.',
                    'is_liked': False,
                    'likes_count': story.likes.count(),
                }
            )

        like_obj, created = StoryLike.objects.get_or_create(
            story=story,
            user=request.user,
        )

        if created:
            return Response(
                {
                    'detail': 'Liked.',
                    'is_liked': True,
                    'likes_count': story.likes.count(),
                },
                status=status.HTTP_201_CREATED,
            )

        like_obj.delete()
        return Response(
            {
                'detail': 'Unliked.',
                'is_liked': False,
                'likes_count': story.likes.count(),
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole],
    )
    def submit_for_background_processing(self, request, pk=None):
        """
        Trigger background task để xử lý truyện async.
        Ngoài gửi email mock, cũng trigger xử lý AI (tóm tắt/phân loại).
        """
        if not CELERY_AVAILABLE:
            return Response(
                {'detail': 'Celery is not configured. Background tasks are unavailable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        
        story = self.get_object()
        story.processing_status = StoryProcessingStatus.PROCESSING
        story.save(update_fields=['processing_status'])
        
        # Trigger email task
        email_task = send_email_async.delay(
            user_email=request.user.email or "user@example.com",
            subject=f"Story '{story.title}' submitted for processing",
            message=f"Your story ID {story.id} is being processed in background."
        )
        
        # Trigger AI processing task
        action_type = request.data.get('action', 'summarize')
        ai_task = process_story_async.delay(
            story_id=story.id,
            action=action_type
        )
        
        return Response(
            {
                'detail': 'Background tasks triggered successfully.',
                'story_id': story.id,
                'email_task_id': email_task.id,
                'ai_task_id': ai_task.id,
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole, StoryPermission],
    )
    def restore(self, request, pk=None):
        """
        Restore a soft-deleted story.
        Endpoint: POST /api/stories/{id}/restore/
        """
        story = Story.all_objects.filter(pk=pk).first()
        
        if not story:
            return Response(
                {'detail': 'Story not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        
        if not story.is_deleted:
            return Response(
                {'detail': 'This story is not deleted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        story.restore()
        serializer = self.get_serializer(story)
        return Response(
            {
                'detail': 'Story restored successfully.',
                'story': serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class ChapterViewSet(viewsets.ModelViewSet):
    """API CRUD cho Chapter – lọc queryset theo role và trạng thái chapter."""

    queryset = Chapter.objects.all()
    serializer_class = ChapterSerializer
    permission_classes = [IsAuthenticatedWithRole, ChapterPermission]

    def get_queryset(self):
        return get_chapter_queryset_for_user(self.request.user)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole],
    )
    def submit_for_review(self, request, pk=None):
        """Author submit chapter for review (DRAFT -> PENDING)."""
        chapter = self.get_object()
        try:
            chapter = submit_chapter_for_review(chapter=chapter, actor=request.user)
            return Response(self.get_serializer(chapter).data)
        except WorkflowError as exc:
            return Response({'detail': exc.detail}, status=exc.status_code)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole, IsEditorOnly],
    )
    def approve(self, request, pk=None):
        """Editor approve chapter (PENDING -> APPROVED)."""
        chapter = self.get_object()
        try:
            chapter = approve_chapter(
                chapter=chapter,
                editor=request.user,
                review_note=request.data.get('review_note', ''),
            )
            return Response(self.get_serializer(chapter).data)
        except WorkflowError as exc:
            return Response({'detail': exc.detail}, status=exc.status_code)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole, IsEditorOnly],
    )
    def reject(self, request, pk=None):
        """Editor reject chapter (PENDING -> REJECTED)."""
        chapter = self.get_object()
        try:
            chapter = reject_chapter(
                chapter=chapter,
                editor=request.user,
                review_note=request.data.get('review_note', ''),
            )
            return Response(self.get_serializer(chapter).data)
        except WorkflowError as exc:
            return Response({'detail': exc.detail}, status=exc.status_code)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole, IsEditorOnly],
    )
    def publish(self, request, pk=None):
        """Editor publish chapter (APPROVED -> PUBLISHED)."""
        chapter = self.get_object()
        try:
            chapter = publish_chapter(chapter=chapter, editor=request.user)
            return Response(self.get_serializer(chapter).data)
        except WorkflowError as exc:
            return Response({'detail': exc.detail}, status=exc.status_code)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole, ChapterPermission],
    )
    def restore(self, request, pk=None):
        """
        Restore a soft-deleted chapter.
        Endpoint: POST /api/chapters/{id}/restore/
        """
        chapter = Chapter.all_objects.filter(pk=pk).first()
        
        if not chapter:
            return Response(
                {'detail': 'Chapter not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        
        if not chapter.is_deleted:
            return Response(
                {'detail': 'This chapter is not deleted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        chapter.restore()
        serializer = self.get_serializer(chapter)
        return Response(
            {
                'detail': 'Chapter restored successfully.',
                'chapter': serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class CommentViewSet(viewsets.ModelViewSet):
    queryset = Comment.objects.select_related('user', 'story', 'chapter', 'parent').all()
    serializer_class = CommentSerializer
    permission_classes = [IsAuthenticatedWithRole, CommentPermission]

    def get_queryset(self):
        qs = super().get_queryset().order_by('-created_at')
        story_id = self.request.query_params.get('story')
        chapter_id = self.request.query_params.get('chapter')
        parent_id = self.request.query_params.get('parent')

        if story_id:
            qs = qs.filter(story_id=story_id)
        if chapter_id:
            qs = qs.filter(chapter_id=chapter_id)
        if parent_id is not None:
            qs = qs.filter(parent_id=parent_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticatedWithRole, CommentPermission],
    )
    def restore(self, request, pk=None):
        """
        Restore a soft-deleted comment.
        Endpoint: POST /api/comments/{id}/restore/
        """
        comment = Comment.all_objects.filter(pk=pk).first()
        
        if not comment:
            return Response(
                {'detail': 'Comment not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        
        if not comment.is_deleted:
            return Response(
                {'detail': 'This comment is not deleted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        comment.restore()
        serializer = self.get_serializer(comment)
        return Response(
            {
                'detail': 'Comment restored successfully.',
                'comment': serializer.data,
            },
            status=status.HTTP_200_OK,
        )


@api_view(['GET'])
@permission_classes([IsAuthenticatedWithRole])
def celery_task_status(request, task_id):
    """
    Check trạng thái của 1 Celery task.
    Endpoint: GET /api/celery-task/{task_id}/status/
    """
    if not CELERY_AVAILABLE:
        return Response(
            {'detail': 'Celery is not configured. Task status is unavailable.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    
    result = AsyncResult(task_id)
    
    response_data = {
        'task_id': task_id,
        'state': result.state,
    }
    
    if result.state == 'PENDING':
        response_data['status'] = 'Task not yet processed.'
    elif result.state == 'SUCCESS':
        response_data['status'] = 'Task completed successfully.'
        response_data['result'] = result.result
    elif result.state == 'FAILURE':
        response_data['status'] = 'Task failed.'
        response_data['error'] = str(result.info)
    elif result.state == 'RETRY':
        response_data['status'] = 'Task is being retried.'
    else:
        response_data['status'] = f'Task in state: {result.state}'
    
    return Response(response_data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """API readonly cho AuditLog – xem lịch sử thay đổi của đối tượng."""
    
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticatedWithRole]
    
    def get_queryset(self):
        """Filter audit logs by content_type, object_id, user, action."""
        queryset = AuditLog.objects.select_related('user').order_by('-created_at')
        
        # Filter by content_type (Story, Chapter, Comment)
        content_type = self.request.query_params.get('content_type')
        if content_type:
            queryset = queryset.filter(content_type=content_type)
        
        # Filter by object_id (specific object instance)
        object_id = self.request.query_params.get('object_id')
        if object_id:
            try:
                queryset = queryset.filter(object_id=int(object_id))
            except ValueError:
                pass
        
        # Filter by user_id (who made the change)
        user_id = self.request.query_params.get('user')
        if user_id:
            try:
                queryset = queryset.filter(user_id=int(user_id))
            except ValueError:
                pass
        
        # Filter by action (CREATE, UPDATE, DELETE, RESTORE)
        action_filter = self.request.query_params.get('action')
        if action_filter:
            queryset = queryset.filter(action=action_filter)
        
        return queryset
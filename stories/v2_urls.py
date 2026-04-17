from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ChapterViewSet, CommentViewSet, AuditLogViewSet, celery_task_status
from .v2_views import StoryV2ViewSet

router = DefaultRouter()
router.register(r'stories', StoryV2ViewSet, basename='story-v2')
router.register(r'chapters', ChapterViewSet)
router.register(r'comments', CommentViewSet)
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log-v2')

urlpatterns = [
    path('celery-task/<str:task_id>/status/', celery_task_status, name='celery-task-status-v2'),
] + router.urls

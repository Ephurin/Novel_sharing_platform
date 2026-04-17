from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import CommentViewSet, StoryViewSet, ChapterViewSet, AuditLogViewSet, celery_task_status

router = DefaultRouter()
router.register(r'stories', StoryViewSet)
router.register(r'chapters', ChapterViewSet)
router.register(r'comments', CommentViewSet)
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')

urlpatterns = [
    path('celery-task/<str:task_id>/status/', celery_task_status, name='celery-task-status'),
] + router.urls
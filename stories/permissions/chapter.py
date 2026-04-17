from rest_framework import permissions

from user_accounts.models import RoleChoices

from ..models import ChapterStatus


class ChapterPermission(permissions.BasePermission):
    """Role-based permission for Chapter CRUD and visibility."""

    def has_permission(self, request, view):
        user = request.user
        if request.method in permissions.SAFE_METHODS:
            return bool(user and user.is_authenticated)
        return getattr(user, 'role', None) in {
            RoleChoices.AUTHOR,
            RoleChoices.EDITOR,
        }

    def has_object_permission(self, request, view, obj):
        user = request.user
        story = obj.story

        if request.method in permissions.SAFE_METHODS:
            if user.role == RoleChoices.READER:
                return obj.status in {ChapterStatus.APPROVED, ChapterStatus.PUBLISHED}
            if user.role == RoleChoices.AUTHOR:
                if story.author == user:
                    return True
                return obj.status in {ChapterStatus.APPROVED, ChapterStatus.PUBLISHED}
            if user.role == RoleChoices.EDITOR:
                return True

        if user.role == RoleChoices.AUTHOR:
            return story.author == user
        if user.role == RoleChoices.EDITOR:
            return True
        return False

from rest_framework import permissions

from user_accounts.models import RoleChoices


class StoryPermission(permissions.BasePermission):
    """Role-based permission for Story CRUD."""

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
        if request.method in permissions.SAFE_METHODS:
            return bool(user and user.is_authenticated)
        if user.role == RoleChoices.AUTHOR:
            return obj.author == user
        if user.role == RoleChoices.EDITOR:
            return True
        return False

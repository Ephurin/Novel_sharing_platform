from rest_framework import permissions

from user_accounts.models import RoleChoices


class IsAuthenticatedWithRole(permissions.BasePermission):
    """Ensure authenticated user has role attribute."""

    def has_permission(self, request, view):
        user = request.user
        if not user or user.is_anonymous:
            return False
        return hasattr(user, 'role')


class IsEditorOnly(permissions.BasePermission):
    """Allow access to Editor role only."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.role == RoleChoices.EDITOR
        )

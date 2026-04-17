from rest_framework import permissions

from user_accounts.models import RoleChoices



class CommentPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        if obj.user_id == request.user.id:
            return True
        return getattr(request.user, 'role', None) == RoleChoices.EDITOR
from rest_framework import serializers
from django.contrib.auth import get_user_model

from ..models import AuditLog

User = get_user_model()


class UserBasicSerializer(serializers.ModelSerializer):
    """Lightweight user serializer for audit logs (avoid circular imports)."""
    
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name')
        read_only_fields = fields


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer cho AuditLog – hiển thị lịch sử thay đổi của đối tượng."""
    
    user = UserBasicSerializer(read_only=True)
    
    class Meta:
        model = AuditLog
        fields = (
            'id',
            'user',
            'action',
            'content_type',
            'object_id',
            'object_str',
            'changes',
            'created_at',
        )
        read_only_fields = fields

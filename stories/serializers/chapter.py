from rest_framework import serializers
from ..models import Chapter, ChapterStatus


class ChapterSerializer(serializers.ModelSerializer):
    """Serializer cho Chapter – kiểm soát trạng thái theo role khi tạo/cập nhật."""

    class Meta:
        model = Chapter
        fields = '__all__'
        # Các field review do Editor/action gán, client không được gửi lên
        read_only_fields = ('status', 'reviewed_by', 'review_note')

    def create(self, validated_data):
        # Chapter mới luôn bắt đầu ở trạng thái DRAFT, bất kể client gửi gì
        validated_data['status'] = ChapterStatus.DRAFT
        return super().create(validated_data)

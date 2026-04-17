from rest_framework import serializers
from ..models import Comment


class CommentSerializer(serializers.ModelSerializer):
    """Serializer cho Comment."""

    replies = serializers.SerializerMethodField(read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Comment
        fields = [
            'id', 'user', 'user_username',
            'story', 'chapter', 'parent',
            'content', 'replies',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['user', 'replies', 'created_at', 'updated_at']

    def get_replies(self, obj):
        children = obj.replies.all().order_by('created_at')
        return CommentSerializer(children, many=True, context=self.context).data

    def validate(self, attrs):
        story = attrs.get('story', getattr(self.instance, 'story', None))
        chapter = attrs.get('chapter', getattr(self.instance, 'chapter', None))
        parent = attrs.get('parent', getattr(self.instance, 'parent', None))

        if bool(story) == bool(chapter):
            raise serializers.ValidationError('Phai chon dung 1 target: story hoac chapter.')

        if parent:
            if parent.story_id != getattr(story, 'id', None) or parent.chapter_id != getattr(chapter, 'id', None):
                raise serializers.ValidationError('Reply phai cung target voi parent.')
        return attrs

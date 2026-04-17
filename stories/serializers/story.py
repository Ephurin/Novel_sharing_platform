from rest_framework import serializers
from django.db.models import Avg

from ..models import Story, StoryLike, StoryRating
from .chapter import ChapterSerializer


class StorySerializer(serializers.ModelSerializer):
    """Serializer cho Story – hiển thị kèm danh sách chapter (read-only)."""

    chapters = ChapterSerializer(many=True, read_only=True)
    average_rating = serializers.SerializerMethodField()
    ratings_count = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    current_user_rating = serializers.SerializerMethodField()
    is_liked_by_current_user = serializers.SerializerMethodField()

    class Meta:
        model = Story
        fields = (
            'id',
            'author',
            'title',
            'description',
            'genre',
            'view_count',
            'cover_image',
            'processing_status',
            'created_at',
            'updated_at',
            'chapters',
            'average_rating',
            'ratings_count',
            'likes_count',
            'current_user_rating',
            'is_liked_by_current_user',
        )
        # author luôn được gán từ request.user, không nhận từ client
        read_only_fields = ('author', 'view_count', 'processing_status')

    def create(self, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            validated_data['author'] = user
        return super().create(validated_data)

    def get_average_rating(self, obj):
        return obj.ratings.aggregate(avg=Avg('score'))['avg']

    def get_ratings_count(self, obj):
        return obj.ratings.count()

    def get_likes_count(self, obj):
        return obj.likes.count()

    def get_current_user_rating(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return None
        return StoryRating.objects.filter(story=obj, user=user).values_list('score', flat=True).first()

    def get_is_liked_by_current_user(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return False
        return StoryLike.objects.filter(story=obj, user=user).exists()

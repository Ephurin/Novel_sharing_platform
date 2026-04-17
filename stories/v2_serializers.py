from rest_framework import serializers

from .serializers import StorySerializer


class StoryV2Serializer(StorySerializer):
    """V2 serializer extends v1 response with AI-friendly summary field."""

    ai_summary = serializers.SerializerMethodField()

    class Meta(StorySerializer.Meta):
        fields = StorySerializer.Meta.fields + ('ai_summary',)

    def get_ai_summary(self, obj):
        if obj.ai_summary:
            return obj.ai_summary

        description = (obj.description or '').strip()
        if not description:
            return f"AI summary: Story '{obj.title}' has no description yet."

        shortened = description[:120]
        if len(description) > 120:
            shortened += '...'
        return f"AI summary: {shortened}"

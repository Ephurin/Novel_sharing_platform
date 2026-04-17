from .views import StoryViewSet
from .v2_serializers import StoryV2Serializer


class StoryV2ViewSet(StoryViewSet):
    """V2 story endpoint with extended response schema."""

    serializer_class = StoryV2Serializer

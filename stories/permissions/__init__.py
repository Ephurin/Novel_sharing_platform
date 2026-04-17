from .base import IsAuthenticatedWithRole, IsEditorOnly
from .chapter import ChapterPermission
from .comment import CommentPermission
from .story import StoryPermission

__all__ = [
    'IsAuthenticatedWithRole',
    'IsEditorOnly',
    'StoryPermission',
    'ChapterPermission',
    'CommentPermission',
]

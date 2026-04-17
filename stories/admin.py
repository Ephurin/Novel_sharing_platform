from django.contrib import admin
from .models import Story, Chapter, Comment, StoryRating, StoryLike

admin.site.register(Story)
admin.site.register(Chapter)
admin.site.register(Comment)
admin.site.register(StoryRating)
admin.site.register(StoryLike)

from django.db.models import Q

from user_accounts.models import RoleChoices

from .models import Chapter, ChapterStatus, Story


APPROVED_OR_PUBLISHED = [ChapterStatus.APPROVED, ChapterStatus.PUBLISHED]


def get_story_queryset_for_user(user):
    if not user or user.is_anonymous:
        return Story.objects.none()

    if user.role == RoleChoices.READER:
        return Story.objects.filter(
            chapters__status__in=APPROVED_OR_PUBLISHED
        ).distinct()

    if user.role == RoleChoices.AUTHOR:
        return Story.objects.filter(
            Q(author=user) | Q(chapters__status__in=APPROVED_OR_PUBLISHED)
        ).distinct()

    if user.role == RoleChoices.EDITOR:
        return Story.objects.all()

    return Story.objects.none()


def get_chapter_queryset_for_user(user):
    if not user or user.is_anonymous:
        return Chapter.objects.none()

    if user.role == RoleChoices.READER:
        return Chapter.objects.filter(status__in=APPROVED_OR_PUBLISHED)

    if user.role == RoleChoices.AUTHOR:
        return Chapter.objects.filter(
            Q(story__author=user) | Q(status__in=APPROVED_OR_PUBLISHED)
        )

    if user.role == RoleChoices.EDITOR:
        return Chapter.objects.all()

    return Chapter.objects.none()

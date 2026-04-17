from ..models import ChapterStatus


class WorkflowError(Exception):
    def __init__(self, detail, status_code):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def submit_chapter_for_review(chapter, actor):
    if chapter.story.author != actor:
        raise WorkflowError('Chi author cua truyen moi duoc submit.', 403)

    if chapter.status != ChapterStatus.DRAFT:
        raise WorkflowError('Chi chapter dang DRAFT moi duoc submit.', 400)

    chapter.status = ChapterStatus.PENDING
    chapter.save(update_fields=['status'])
    return chapter


def approve_chapter(chapter, editor, review_note=''):
    if chapter.status != ChapterStatus.PENDING:
        raise WorkflowError('Chi chapter dang PENDING moi duoc duyet.', 400)

    chapter.status = ChapterStatus.APPROVED
    chapter.reviewed_by = editor
    chapter.review_note = review_note
    chapter.save(update_fields=['status', 'reviewed_by', 'review_note'])
    return chapter


def reject_chapter(chapter, editor, review_note):
    if chapter.status != ChapterStatus.PENDING:
        raise WorkflowError('Chi chapter dang PENDING moi duoc tu choi.', 400)

    clean_note = (review_note or '').strip()
    if not clean_note:
        raise WorkflowError('Phai cung cap review_note khi tu choi.', 400)

    chapter.status = ChapterStatus.REJECTED
    chapter.reviewed_by = editor
    chapter.review_note = clean_note
    chapter.save(update_fields=['status', 'reviewed_by', 'review_note'])
    return chapter


def publish_chapter(chapter, editor):
    if chapter.status != ChapterStatus.APPROVED:
        raise WorkflowError('Chi chapter da APPROVED moi duoc publish.', 400)

    chapter.status = ChapterStatus.PUBLISHED
    chapter.reviewed_by = editor
    chapter.save(update_fields=['status', 'reviewed_by'])
    return chapter

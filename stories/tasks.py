import time
import logging
from celery import shared_task

from .models import Story, StoryProcessingStatus

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def add(self, x, y):
    """Task mẫu: tính tổng (Ngày 1)."""
    return x + y


@shared_task(bind=True, max_retries=3)
def send_email_async(self, user_email, subject, message):
    """
    Task gửi email async (mock - không gửi thật).
    Mục tiêu: demo email nền mà không chờ.
    """
    logger.info(f"[send_email_async] Starting task for {user_email}")
    
    try:
        # Giả lập delay gửi mail
        time.sleep(2)
        
        # Giả lập logic gửi email
        logger.info(f"[send_email_async] Mock email sent to {user_email}")
        logger.info(f"  Subject: {subject}")
        logger.info(f"  Message: {message}")
        
        return {
            "status": "success",
            "email": user_email,
            "message": "Email sent successfully"
        }
    except Exception as exc:
        logger.error(f"[send_email_async] Error: {exc}")
        # Retry sau 5 giây, tối đa 3 lần
        raise self.retry(exc=exc, countdown=5)


@shared_task(bind=True, max_retries=2)
def process_story_async(self, story_id, action="summarize"):
    """
    Task xử lý truyện async (mock - giả lập AI processing).
    Mục tiêu: delay + retry khi fail.
    
    Args:
        story_id: ID của truyện cần xử lý
        action: loại xử lý (summarize, classify, etc.)
    """
    logger.info(f"[process_story_async] Starting {action} for story {story_id}")
    
    try:
        story = Story.all_objects.get(pk=story_id)

        # Giả lập delay xử lý (1-3 giây tùy action)
        if action == "summarize":
            time.sleep(3)
            base_text = (story.description or '').strip() or story.title
            result = f"AI summary: {base_text[:120]}{'...' if len(base_text) > 120 else ''}"
        elif action == "classify":
            time.sleep(2)
            result = f"AI classification: {story.genre or 'Uncategorized'}"
        else:
            time.sleep(1)
            result = f"AI processed action '{action}' for story {story_id}"

        story.ai_summary = result
        story.processing_status = StoryProcessingStatus.COMPLETED
        story.save(update_fields=['ai_summary', 'processing_status'])
        
        logger.info(f"[process_story_async] Completed: {result}")
        
        return {
            "status": "success",
            "story_id": story_id,
            "action": action,
            "result": result
        }
    except Exception as exc:
        logger.error(f"[process_story_async] Error on story {story_id}: {exc}")
        Story.all_objects.filter(pk=story_id).update(processing_status=StoryProcessingStatus.FAILED)
        # Retry sau 10 giây, tối đa 2 lần
        raise self.retry(exc=exc, countdown=10)
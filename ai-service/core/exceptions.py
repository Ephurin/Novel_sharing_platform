"""
Custom exceptions cho AI Service.

Tập trung định nghĩa tại đây để:
- Tránh try-except thủ công lặp lại ở mọi route
- FastAPI exception handlers trong main.py sẽ bắt và trả response chuẩn
- Dễ mở rộng thêm loại lỗi mới
"""


class AIServiceError(Exception):
    """Base exception cho tất cả lỗi nghiệp vụ trong AI Service."""

    def __init__(self, message: str = "An internal AI service error occurred."):
        self.message = message
        super().__init__(self.message)


class EntityExtractionError(AIServiceError):
    """Lỗi khi entity pipeline trích xuất thất bại."""

    def __init__(self, detail: str = "Entity extraction failed."):
        super().__init__(f"Entity extraction error: {detail}")


class EventExtractionError(AIServiceError):
    """Lỗi khi event pipeline gọi provider hoặc validate output thất bại."""

    def __init__(self, detail: str = "Event extraction failed."):
        super().__init__(f"Event extraction error: {detail}")


class StateExtractionError(AIServiceError):
    """Lỗi khi state pipeline gọi provider hoặc validate output thất bại."""

    def __init__(self, detail: str = "State extraction failed."):
        super().__init__(f"State extraction error: {detail}")


class KBWriteError(AIServiceError):
    """Lỗi khi ghi dữ liệu vào Knowledge Base."""

    def __init__(self, story_id: str, detail: str = ""):
        msg = f"Knowledge Base write failed for story '{story_id}'"
        if detail:
            msg += f": {detail}"
        self.story_id = story_id
        super().__init__(msg)


class LLMUnavailableError(AIServiceError):
    """LLM Service chưa được khởi tạo hoặc không khả dụng."""

    def __init__(self):
        super().__init__("LLMService is not initialized or unavailable.")

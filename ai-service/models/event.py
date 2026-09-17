from typing import Optional
from pydantic import BaseModel, Field

class Event(BaseModel):
    id: str
    subject_id: str
    subject_type: str = "UNKNOWN"
    action: str
    object_id: str
    object_type: str = "UNKNOWN"
    intent: Optional[str] = None
    emotion: Optional[str] = None
    polarity: Optional[float] = None
    intensity: Optional[float] = None
    confidence: float = Field(default=1.0)
    source: str = Field(default="AI")
    raw_text: Optional[str] = None

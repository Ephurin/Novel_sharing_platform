from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class EntityState(BaseModel):
    """Represents a single state attribute for an entity at a point in time."""
    entity_id: str
    attribute: str = Field(
        ...,
        description="Normalized attribute: health | location | emotion | status"
    )
    value: str
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    source: str = Field(default="AI")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    raw_text: Optional[str] = None

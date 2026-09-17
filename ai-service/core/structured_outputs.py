from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


EntityType = Literal["PER", "LOC", "ORG", "ITEM", "SKILL"]


class StrictOutputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PipelineMetadata(StrictOutputModel):
    pipeline_version: str
    model_name: str
    prompt_version: str


class ExtractedEntity(StrictOutputModel):
    phrase: str = Field(min_length=1)
    entity: EntityType
    score: float = Field(ge=0.0, le=10.0)


class EntityExtractionOutput(StrictOutputModel):
    entities: list[ExtractedEntity]
    metadata: PipelineMetadata


class NarrativeEventOutput(StrictOutputModel):
    participants: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    event_type: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    emotion_tags: list[str] = Field(default_factory=list)
    consequences: list[str] = Field(default_factory=list)
    importance_score: float = Field(default=0.5, ge=0.0, le=1.0)


class EventExtractionOutput(StrictOutputModel):
    events: list[NarrativeEventOutput]
    metadata: PipelineMetadata


class StateChangeOutput(StrictOutputModel):
    entity: str = Field(min_length=1)
    attribute: Literal["health", "location", "emotion", "status"]
    value: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)


class StateExtractionOutput(StrictOutputModel):
    states: list[StateChangeOutput]
    metadata: PipelineMetadata

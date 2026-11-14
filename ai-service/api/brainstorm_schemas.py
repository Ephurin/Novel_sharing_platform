"""Versioned brainstorm-v1 wire DTOs.

Strict schemas for AI brainstorming suggestions: World Rules, Character Seeds,
and Future Chapter Events. All proposals carry status `model_proposed` and are
strictly separated from Canon / historical records.
"""
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

NonBlank = Annotated[str, Field(min_length=1, pattern=r"\S")]
UUIDString = Annotated[str, Field(pattern=r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$")]
Text = Annotated[str, Field(max_length=10000)]


class StrictDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class BrainstormParticipant(StrictDTO):
    entity_id: UUIDString | None = None
    name_hint: Annotated[str, Field(min_length=1, max_length=255)] | None = None

    @model_validator(mode="after")
    def validate_one_field(self):
        if (self.entity_id is None) == (self.name_hint is None):
            raise ValueError("Choose exact approved entity_id or unresolved name_hint")
        return self


class ProposedWorldRule(StrictDTO):
    rule_id: UUIDString
    fact_key: Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")]
    text: Annotated[str, Field(min_length=1, max_length=10000, pattern=r"\S")]
    category: Literal["magic_system", "geography", "faction", "law", "cosmology", "general"] = "general"
    origin: Literal["model_proposed"] = "model_proposed"
    status: Literal["model_proposed"] = "model_proposed"
    is_canon: Literal[False] = False
    is_historical: Literal[False] = False


class ProposedCharacter(StrictDTO):
    character_id: UUIDString
    name: Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]
    canonical_name: Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]
    entity_type: Literal["character"] = "character"
    role: Literal["protagonist", "antagonist", "ally", "mentor", "bystander", "rival", "other"] = "other"
    description: Annotated[str, Field(max_length=5000)] = ""
    archetype: Annotated[str, Field(max_length=255)] = ""
    aliases: list[Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]] = Field(default_factory=list)
    origin: Literal["model_proposed"] = "model_proposed"
    status: Literal["model_proposed"] = "model_proposed"
    is_canon: Literal[False] = False
    is_historical: Literal[False] = False


class ProposedFutureEvent(StrictDTO):
    event_id: UUIDString
    target_chapter: Annotated[int, Field(ge=1)]
    title: Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]
    description: Annotated[str, Field(max_length=10000)] = ""
    text: Annotated[str, Field(max_length=10000)] = ""
    ending: bool = False
    min_words: Annotated[int, Field(ge=0)] = 1500
    participants: list[BrainstormParticipant] = Field(default_factory=list, max_length=100)
    origin: Literal["model_proposed"] = "model_proposed"
    status: Literal["model_proposed"] = "model_proposed"
    is_canon: Literal[False] = False
    is_historical: Literal[False] = False

    @model_validator(mode="after")
    def sync_text(self):
        if not self.text and self.description:
            self.text = self.description
        elif not self.description and self.text:
            self.description = self.text
        return self


class BrainstormProvenance(StrictDTO):
    contract_version: Literal["brainstorm-v1"] = "brainstorm-v1"
    provider: str
    model: str
    status: Literal["model_proposed"] = "model_proposed"
    grounding_rules_count: int = 0
    grounding_entities_count: int = 0
    # #147: model suggestions dropped because they repeat an approved rule or character.
    duplicates_removed: int = 0
    timestamp: str


class BrainstormRequest(StrictDTO):
    contract_version: Literal["brainstorm-v1"] = "brainstorm-v1"
    target: Literal["all", "world_rules", "characters", "future_events"] = "all"
    instruction: Annotated[str, Field(max_length=10000)] = ""
    current_chapter: Annotated[int, Field(ge=1)] | None = None
    target_chapter: Annotated[int, Field(ge=1)] | None = None
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128)] | None = None
    expected_brain_version: Annotated[int, Field(ge=0)] | None = None
    expected_plan_version: Annotated[int, Field(ge=0)] | None = None
    private_notes: Annotated[str, Field(max_length=10000)] = ""
    private_author_notes: list[Annotated[str, Field(max_length=10000)]] = Field(default_factory=list)


class BrainstormResponse(StrictDTO):
    contract_version: Literal["brainstorm-v1"] = "brainstorm-v1"
    novel_id: UUIDString
    story_brain_id: UUIDString
    brain_version: int
    plan_version: int | None = None
    world_rules: list[ProposedWorldRule] = Field(default_factory=list)
    characters: list[ProposedCharacter] = Field(default_factory=list)
    character_seeds: list[ProposedCharacter] = Field(default_factory=list)
    future_events: list[ProposedFutureEvent] = Field(default_factory=list)
    events: list[ProposedFutureEvent] = Field(default_factory=list)
    provenance: BrainstormProvenance


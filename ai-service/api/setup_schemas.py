"""Versioned setup-v1 wire DTOs. Legacy idea DTOs stay unchanged."""
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

NonBlank = Annotated[str, Field(min_length=1, pattern=r"\S")]
Label = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")]

class StrictDTO(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class Declaration(StrictDTO):
    declaration_id: Label
    entity_type: Literal['character', 'location']
    display_name: NonBlank
    aliases: list[NonBlank] = Field(default_factory=list)
    @model_validator(mode='after')
    def unique_aliases(self):
        if len(self.aliases) != len(set(self.aliases)):
            raise ValueError('Duplicate aliases')
        return self

class WorldRule(StrictDTO):
    declaration_id: Label
    text: NonBlank

class InitialCondition(StrictDTO):
    declaration_id: Label
    subject_declaration_id: Label
    attribute_key: NonBlank
    value: str | int | float | bool | None

class SetupSource(StrictDTO):
    text: str
    declarations: list[Declaration]
    world_rules: list[WorldRule]
    initial_conditions: list[InitialCondition]
    @model_validator(mode='after')
    def references(self):
        items = self.declarations + self.world_rules + self.initial_conditions
        keys = [x.declaration_id for x in items]
        if len(keys) != len(set(keys)):
            raise ValueError('Declaration IDs must be unique across setup')
        entities = {x.declaration_id for x in self.declarations}
        if any(x.subject_declaration_id not in entities for x in self.initial_conditions):
            raise ValueError('Initial condition subject must reference a setup declaration')
        return self

class Hint(StrictDTO):
    @model_validator(mode='before')
    @classmethod
    def explicit_null(cls, data):
        if isinstance(data, dict) and 'entity_type' in data and data['entity_type'] is None:
            raise ValueError('entity_type cannot be null')
        return data
    name: NonBlank
    entity_type: Literal['character', 'location'] | None = None

class Preferences(StrictDTO):
    @model_validator(mode='before')
    @classmethod
    def explicit_null(cls, data):
        if isinstance(data, dict) and 'pacing' in data and data['pacing'] is None:
            raise ValueError('pacing cannot be null')
        return data
    genre: list[NonBlank] = Field(default_factory=list)
    tone: NonBlank = 'neutral'
    target_length: NonBlank = 'long_form'
    pacing: NonBlank | None = None

class SetupRequest(StrictDTO):
    contract_version: Literal['setup-v1']
    novel_id: str
    mode: Literal['extract', 'blueprint']
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128)]
    expected_setup_version: Annotated[int, Field(ge=0)]
    setup: SetupSource
    hints: list[Hint] = Field(default_factory=list)
    outline: str = ''
    preferences: Preferences = Field(default_factory=Preferences)
    author_constraints: list[NonBlank] = Field(default_factory=list)
    private_author_notes: list[NonBlank] = Field(default_factory=list)
    locale: NonBlank = 'vi-VN'
    @model_validator(mode='after')
    def valid_uuid(self):
        self.novel_id = str(UUID(self.novel_id))
        return self

class Span(StrictDTO):
    kind: Literal['setup_span']
    field_path: Literal['/setup/text']
    offset_kind: Literal['unicode_codepoints']
    start: Annotated[int, Field(ge=0)]
    end: Annotated[int, Field(ge=1)]
    quote: NonBlank

class ExtractEntity(StrictDTO):
    entity_type: Literal['character', 'location']
    display_name: NonBlank
    source_ref: Span

class ExtractRule(StrictDTO):
    text: NonBlank
    source_ref: Span

class ExtractOutput(StrictDTO):
    entities: list[ExtractEntity]
    world_rules: list[ExtractRule]

class SuggestedEntity(StrictDTO):
    entity_type: Literal['character', 'location']
    display_name: NonBlank

class BlueprintOutput(StrictDTO):
    entities: list[SuggestedEntity]
    world_rules: list[NonBlank]

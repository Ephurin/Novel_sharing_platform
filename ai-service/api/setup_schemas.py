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


class SetupIdentityChoice(StrictDTO):
    kind: Literal['new', 'existing']
    approved_entity_id: str | None = None

    @model_validator(mode='after')
    def identity(self):
        if self.kind == 'existing':
            if self.approved_entity_id is None:
                raise ValueError('Explicit approved ID required')
            self.approved_entity_id = str(UUID(self.approved_entity_id))
        elif self.approved_entity_id is not None:
            raise ValueError('New identities are server reserved')
        return self

class SetupEntityEdit(StrictDTO):
    canonical_name: Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]
    aliases: list[Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]] = Field(default_factory=list)

class SetupRuleEdit(StrictDTO):
    fact_key: Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")]
    fact_value: Annotated[str, Field(min_length=1, max_length=10000, pattern=r"\S")]
    subject_entity_id: str | None = None

    @model_validator(mode='after')
    def subject(self):
        if self.subject_entity_id is not None:
            self.subject_entity_id = str(UUID(self.subject_entity_id))
        return self

class SetupDecision(StrictDTO):
    proposal_id: str
    decision: Literal['accept', 'reject']
    identity: SetupIdentityChoice | None = None
    edited_entity: SetupEntityEdit | None = None
    edited_rule: SetupRuleEdit | None = None
    reason: Annotated[str, Field(max_length=2000)] | None = None

    @model_validator(mode='after')
    def shape(self):
        self.proposal_id = str(UUID(self.proposal_id))
        if self.decision == 'reject' and any(v is not None for v in (self.identity, self.edited_entity, self.edited_rule)):
            raise ValueError('Rejected proposals cannot contain edits or identity choices')
        if self.edited_entity is not None and self.edited_rule is not None:
            raise ValueError('One edited payload type only')
        return self

class SetupReviewRequest(StrictDTO):
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128)]
    dependency_group_id: str
    setup_hash: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    expected_setup_version: Annotated[int, Field(ge=1)]
    expected_review_version: Annotated[int, Field(ge=0)]
    expected_brain_version: Annotated[int, Field(ge=0)]
    decisions: Annotated[list[SetupDecision], Field(min_length=1, max_length=500)]

    @model_validator(mode='after')
    def membership(self):
        self.dependency_group_id = str(UUID(self.dependency_group_id))
        if len({d.proposal_id for d in self.decisions}) != len(self.decisions):
            raise ValueError('Duplicate proposal')
        return self


class SetupActivationRequest(StrictDTO):
    contract_version: Literal['setup-m0-v1']
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128)]
    setup_hash: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    expected_setup_version: Annotated[int, Field(ge=1)]
    expected_review_version: Annotated[int, Field(ge=1)]
    expected_brain_version: Annotated[int, Field(ge=0)]


# ── P2-07E: Post-M0 World Setup Rule Amendment DTOs ──────────────────────────

class SetupRuleAmendmentProposalRequest(StrictDTO):
    contract_version: Literal['setup-rule-amendment-v1']
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]{1,128}$")]
    replacement_text: Annotated[str, Field(min_length=1, max_length=10000, pattern=r"\S")]
    expected_brain_version: Annotated[int, Field(ge=1)]
    private_author_notes: list[NonBlank] = Field(default_factory=list)


class SetupRuleAmendmentProposalResponse(StrictDTO):
    contract_version: Literal['setup-rule-amendment-v1']
    proposal_id: str
    status: Literal['pending']
    novel_id: str
    story_brain_id: str
    parent_fact_id: str
    fact_key: str
    replacement_text: str
    is_locked: bool
    brain_version: int
    created_at: str


class SetupRuleAmendmentDecisionRequest(StrictDTO):
    contract_version: Literal['setup-rule-amendment-v1']
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]{1,128}$")]
    decision: Literal['accept', 'reject']
    expected_brain_version: Annotated[int, Field(ge=1)]
    reason: Annotated[str, Field(max_length=2000)] | None = None


class SetupRuleAmendmentDecisionResponse(StrictDTO):
    contract_version: Literal['setup-rule-amendment-v1']
    decision_type: Literal['amendment_decision']
    decision: Literal['accept', 'reject']
    proposal_id: str
    parent_fact_id: str
    successor_fact_id: str | None
    fact_key: str
    is_locked: bool
    brain_version: int
    decided_at: str
    artifact_ids: list[str]


class SetupRuleLineageEntry(StrictDTO):
    fact_id: str
    fact_value: str
    is_locked: bool
    supersedes_id: str | None
    created_at: str
    created_by: str | None


class SetupRuleAmendmentHistoryItem(StrictDTO):
    proposal_id: str
    status: str
    replacement_text: str
    decision: str | None
    decided_at: str | None
    reason: str | None
    actor_id: str | None
    successor_fact_id: str | None


class SetupRuleAmendmentHistoryResponse(StrictDTO):
    contract_version: Literal['setup-rule-amendment-v1']
    novel_id: str
    fact_key: str
    root_fact_id: str
    effective_head_id: str
    is_locked: bool
    brain_version: int
    lineage: list[SetupRuleLineageEntry]
    proposals: list[SetupRuleAmendmentHistoryItem]


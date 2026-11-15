"""Author-confirmed baseline description, never chapter evidence or private notes."""
from pydantic import BaseModel, ConfigDict, Field, StrictStr, model_validator


PROFILE_FIELDS = ('description', 'appearance', 'personality', 'background')


class EntityProfilePatch(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_version: int = Field(ge=0)
    expected_brain_version: int = Field(ge=1)
    description: StrictStr = Field(default='', max_length=4000)
    appearance: StrictStr = Field(default='', max_length=4000)
    personality: StrictStr = Field(default='', max_length=4000)
    background: StrictStr = Field(default='', max_length=4000)
    author_notes: StrictStr = Field(default='', max_length=8000)
    effective_from_chapter: int | None = Field(default=None, ge=1, le=1000000)

    @model_validator(mode='after')
    def validate_intent(self):
        changed = self.model_fields_set & {*PROFILE_FIELDS, 'author_notes'}
        if not changed:
            raise ValueError('At least one profile field or author_notes is required')
        if self.model_fields_set & set(PROFILE_FIELDS):
            if self.effective_from_chapter is None:
                raise ValueError('Canonical profile edits require effective_from_chapter')
        elif 'effective_from_chapter' in self.model_fields_set:
            raise ValueError('Note-only edits cannot change profile applicability')
        for key in changed:
            if any(ord(c) < 32 and c not in '\n\r\t' for c in getattr(self, key)):
                raise ValueError('Control characters are not allowed')
        return self


def approved_profile(value: dict | None, chapter_number: int | None = None) -> dict:
    # Explicit allowlist: no arbitrary static attributes, notes or audit snapshots.
    if not value or chapter_number is None:
        return {}
    cutoff = value.get('effective_from_chapter')
    if type(cutoff) is not int or cutoff > chapter_number:
        return {}
    return {key: value[key] for key in PROFILE_FIELDS if isinstance(value.get(key), str) and value[key]}

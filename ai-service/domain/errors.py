class NarrativeRepositoryError(Exception):
    pass


class IdempotencyConflictError(NarrativeRepositoryError):
    pass


class OptimisticLockError(NarrativeRepositoryError):
    pass


class ProposalAlreadyDecidedError(NarrativeRepositoryError):
    pass


class BootstrapLimitExceededError(NarrativeRepositoryError):
    def __init__(self, *, chapters: int, characters: int, max_chapters: int, max_characters: int):
        super().__init__("Manuscript exceeds bootstrap limits")
        self.details = {
            "chapters": chapters,
            "characters": characters,
            "max_chapters": max_chapters,
            "max_characters": max_characters,
            "suggested_batch_size": max(1, min(max_chapters, chapters // 2 or 1)),
        }


class BaselineReviewRequiredError(NarrativeRepositoryError):
    def __init__(self, pending_proposal_ids: list[str]):
        super().__init__("Required proposals must be reviewed before baseline activation")
        self.pending_proposal_ids = pending_proposal_ids


class SelectionOutOfBoundsError(NarrativeRepositoryError):
    pass


class ValidationFailedError(NarrativeRepositoryError):
    def __init__(self, validations: list[dict]):
        super().__init__("Writing generation failed deterministic validation")
        self.validations = validations


class WritingGenerationNotFoundError(NarrativeRepositoryError):
    pass


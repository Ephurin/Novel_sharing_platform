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



class ContextRoutingUnresolvedError(NarrativeRepositoryError):
    def __init__(self, *, estimated_tokens: int, max_tier: int, policy: str):
        super().__init__(
            f"Scoped context requires about {estimated_tokens} tokens, above maximum tier {max_tier}"
        )
        self.details = {
            "estimated_tokens": int(estimated_tokens),
            "max_tier": int(max_tier),
            "policy": str(policy),
            "routing_status": "unresolved",
            "routing_reason": "scoped_package_exceeds_max_tier",
        }


class ActiveRunConflictError(NarrativeRepositoryError):
    def __init__(self, message: str = "Active autonomous run already exists for this novel"):
        super().__init__(message)


class AnalysisOutputError(ValueError):
    def __init__(self, code, message, *, attempts=0):
        super().__init__(message)
        self.code, self.attempts = code, attempts


class BootstrapConflictError(NarrativeRepositoryError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class WritingContextAuthorityError(NarrativeRepositoryError):
    """Public error deliberately contains no source data or scope identifiers."""
    def __init__(self):
        super().__init__('Writing context authorization failed')

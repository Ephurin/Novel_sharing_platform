class NarrativeRepositoryError(Exception):
    pass


class IdempotencyConflictError(NarrativeRepositoryError):
    pass


class OptimisticLockError(NarrativeRepositoryError):
    pass


class ProposalAlreadyDecidedError(NarrativeRepositoryError):
    pass

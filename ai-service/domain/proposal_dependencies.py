"""Conservative checks for removing proposals from an extraction batch one at a time."""
import re
from collections.abc import Iterable

from domain.models import NarrativeProposal


# Live retest 10 (X3): an author could not drop one repeated event, or an alias already approved,
# without rejecting the whole chapter's group. These kinds are never referenced by another proposal
# of the batch except state changes, which point at their event and go with it.
INDEPENDENT_TYPES = frozenset({"alias", "fact", "state_transition"})


def _refers(value, key: str) -> bool:
    if isinstance(value, str):
        return value == key
    if isinstance(value, dict):
        return any(_refers(k, key) or _refers(v, key) for k, v in value.items())
    if isinstance(value, (list, tuple)):
        return any(_refers(v, key) for v in value)
    return False


def rejection_set(proposal: NarrativeProposal, members: Iterable[NarrativeProposal]) -> list[NarrativeProposal] | None:
    """The proposals rejecting this one takes with it, or None when only the whole group can go."""
    members = list(members)
    others = [m for m in members if m.proposal_id != proposal.proposal_id]
    if not others:
        return [proposal]
    if proposal.proposal_type == "event":
        keys = {proposal.proposal_id, str(proposal.payload.get("event_id") or "")} - {""}
        dependents = [m for m in others if any(_refers(m.payload, k) for k in keys)]
        if any(m.proposal_type != "state_transition" for m in dependents):
            return None
        return [proposal, *dependents]
    if proposal.proposal_type in INDEPENDENT_TYPES:
        if any(_refers(m.payload, proposal.proposal_id) for m in others):
            return None
        return [proposal]
    return [proposal] if _unused_entity(proposal, members) else None


def can_reject_individually(proposal: NarrativeProposal, members: Iterable[NarrativeProposal]) -> bool:
    return rejection_set(proposal, members) is not None


def _unused_entity(proposal: NarrativeProposal, members) -> bool:
    members = list(members)
    # Reviewed identities and compound operations retain their atomic contract.
    if proposal.proposal_type != "entity" or not set(proposal.payload) <= {
        "canonical_name", "normalized_name", "entity_type"
    }:
        return False
    names = {str(proposal.payload.get(key, "")).strip().casefold()
             for key in ("canonical_name", "normalized_name")}
    names.discard("")
    if not names:
        return False
    references = names | {proposal.proposal_id.casefold()}

    def mentions(value):
        if isinstance(value, str):
            return any(re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", value.casefold())
                       for name in references)
        if isinstance(value, dict):
            return any(mentions(key) or mentions(item) for key, item in value.items())
        if isinstance(value, (list, tuple)):
            return any(mentions(item) for item in value)
        return False

    return not any(mentions(member.payload) for member in members
                   if member.proposal_id != proposal.proposal_id)

"""Conservative checks for removing an unused entity from an extraction batch."""
import re
from collections.abc import Iterable

from domain.models import NarrativeProposal


def can_reject_individually(proposal: NarrativeProposal, members: Iterable[NarrativeProposal]) -> bool:
    members = list(members)
    if len(members) == 1:
        return True
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

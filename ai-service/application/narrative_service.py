from __future__ import annotations

from typing import Any

from domain.errors import ProposalAlreadyDecidedError
from domain.models import NarrativeProposal, ProposalStatus, StoryBrain
from domain.repositories import NarrativeRepository


class NarrativeApplicationService:
    def __init__(self, repository: NarrativeRepository) -> None:
        self._repository = repository

    def get_story_brain(self, story_id: str) -> StoryBrain:
        return self._repository.get_story_brain(story_id)

    def get_story_brain_summary(self, story_id: str) -> dict[str, Any]:
        brain = self._repository.get_story_brain(story_id)
        from domain.canon_identity import active_events
        return {
            "id": brain.metadata.get("brain_id", story_id),
            "novel_id": story_id,
            "status": brain.metadata.get("status", "active"),
            "brain_version": int(brain.metadata.get("brain_version", "1")),
            "baseline_revision_id": brain.metadata.get("baseline_revision_id"),
            "counts": {
                "entities": len(brain.entities),
                "events": len(active_events(brain.events)),
                "pending_proposals": sum(
                    item.status == ProposalStatus.PENDING for item in brain.proposals
                ),
                "open_findings": 0,
            },
        }

    def get_current_state(self, story_id: str) -> dict[str, Any]:
        return self._repository.get_current_state(story_id)

    def propose_event_correction(self, story_id: str, event_id: str, replacement: dict,
                                 transitions: list[dict], expected_brain_version: int) -> list[NarrativeProposal]:
        import uuid
        from domain.errors import OptimisticLockError
        from domain.projection import ProjectionError
        brain = self._repository.get_story_brain(story_id)
        if int(brain.metadata.get("brain_version", "1")) != expected_brain_version:
            raise OptimisticLockError(story_id)
        original = next((e for e in brain.events if e.event_id == event_id), None)
        if original is None:
            raise KeyError(event_id)
        if any(e.metadata.get("supersedes_id") == event_id for e in brain.events):
            raise ProjectionError("Event has already been superseded")
        group_id, proposal_id = str(uuid.uuid4()), str(uuid.uuid4())
        orig_chapter = getattr(original, "chapter", None) or original.metadata.get("chapter_number") or original.metadata.get("chapter")
        payload = {"chapter": orig_chapter, **replacement, "event_id": proposal_id, "supersedes_id": event_id, "source_type": "author"}
        proposals = [NarrativeProposal(proposal_id=proposal_id, proposal_type="event", payload=payload,
            dependency_group_id=group_id, expected_brain_version=expected_brain_version,
            evidence=tuple(original.metadata.get("evidence", [])))]
        for order, transition in enumerate(transitions, 1):
            proposals.append(NarrativeProposal(proposal_id=str(uuid.uuid4()), proposal_type="state_transition",
                payload={**transition, "event_id": proposal_id}, dependency_group_id=group_id,
                materialization_order=order, expected_brain_version=expected_brain_version,
                evidence=proposals[0].evidence))
        return self._repository.save_proposals(story_id, proposals)

    def rebuild_projection(self, story_id: str, expected_brain_version: int) -> dict[str, Any]:
        import logging
        import time
        start = time.monotonic()
        try:
            state = self._repository.rebuild_projection(story_id, expected_brain_version)
        except Exception:
            logging.getLogger(__name__).exception("projection_rebuild_failed", extra={"story_id": story_id})
            raise
        logging.getLogger(__name__).info("projection_rebuilt", extra={
            "story_id": story_id, "brain_version": expected_brain_version,
            "entity_count": len(state["entities"]), "duration_ms": (time.monotonic() - start) * 1000})
        return state

    def get_snapshot(self, story_id: str) -> dict[str, Any]:
        return self._repository.export_snapshot(story_id)

    def merge_entities(
        self, story_id: str, source_entity_id: str, target_entity_id: str,
        expected_brain_version: int
    ) -> dict[str, Any]:
        return self._repository.merge_entities(
            story_id, source_entity_id, target_entity_id, expected_brain_version
        )

    def sync_entities(
        self, story_id: str, entities: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        updates: list[dict[str, Any]] = []
        for entity in entities:
            try:
                updates.append(self._repository.upsert_entity(story_id, entity))
            except Exception as exc:
                updates.append(
                    {
                        "entity": entity.get("word", ""),
                        "label": entity.get("entity", ""),
                        "story_id": story_id,
                        "status": "failed",
                        "reason": str(exc),
                    }
                )
        return updates

    def related_entities(
        self, story_id: str, entity_name: str, limit: int
    ) -> list[dict[str, str]]:
        return self._repository.get_related_entities(story_id, entity_name, limit)

    def story_context(self, story_id: str, character_name: str, limit: int) -> str:
        return self._repository.get_story_context(story_id, character_name, limit)

    def consistency_data(
        self, story_id: str, character_name: str
    ) -> list[dict[str, str]]:
        return self._repository.get_consistency_data(story_id, character_name)

    def known_locations(self, story_id: str) -> set[str]:
        return self._repository.get_known_locations(story_id)

    def override_relation(
        self, story_id: str, subject: str, relation_type: str, object_name: str
    ) -> dict[str, Any]:
        return self._repository.override_relation(
            story_id, subject, relation_type, object_name
        )

    def save_proposals(
        self, story_id: str, proposals: list[NarrativeProposal]
    ) -> list[NarrativeProposal]:
        return self._repository.save_proposals(story_id, proposals)

    def list_proposals(
        self,
        story_id: str,
        *,
        status: str | None = None,
        proposal_type: str | None = None,
    ) -> list[NarrativeProposal]:
        return self._repository.list_proposals(
            story_id, status=status, proposal_type=proposal_type
        )

    def accept_proposal(
        self,
        story_id: str,
        proposal_id: str,
        expected_brain_version: int,
        *,
        edited_payload: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        proposal = self._find_proposal(story_id, proposal_id)
        if proposal.status != ProposalStatus.PENDING:
            raise ProposalAlreadyDecidedError(proposal_id)
        result = self._repository.accept_proposal_group(
            story_id,
            [proposal_id],
            expected_brain_version,
            edited_payloads={proposal_id: edited_payload} if edited_payload else None,
            reason=reason,
        )
        return {
            "proposal_id": proposal_id,
            "canonical_artifact_id": result["canonical_artifact_ids"][0],
            "brain_version": result["brain_version"],
            "status": result["status"],
        }

    def accept_proposal_group(
        self,
        story_id: str,
        proposal_ids: list[str],
        expected_brain_version: int,
        reason: str | None = None,
        edited_payloads: dict[str, dict[str, Any]] | None = None,
        controller_intent: dict | None = None,
    ) -> dict[str, Any]:
        return self._repository.accept_proposal_group(
            story_id,
            proposal_ids,
            expected_brain_version,
            reason=reason,
            edited_payloads=edited_payloads,
            **({'controller_intent': controller_intent} if controller_intent is not None else {}),
        )

    def accept_proposal_group_by_ids(
        self,
        group_id: str,
        proposal_ids: list[str],
        expected_brain_version: int,
        reason: str | None = None,
        edited_payloads: dict[str, dict[str, Any]] | None = None,
        controller_intent: dict | None = None,
    ) -> dict[str, Any]:
        if not set(edited_payloads or {}).issubset(proposal_ids):
            raise ValueError("Edits must belong to selected proposals")
        located = [self._repository.locate_proposal(item) for item in proposal_ids]
        story_ids = {story_id for story_id, _ in located}
        if len(story_ids) != 1:
            raise ValueError("All proposals must belong to the same Story Brain")
        if any(proposal.dependency_group_id != group_id for _, proposal in located):
            raise ValueError("Proposal does not belong to dependency group")
        return self.accept_proposal_group(
            story_ids.pop(), proposal_ids, expected_brain_version, reason, edited_payloads, controller_intent
        )

    def accept_proposal_by_id(
        self,
        proposal_id: str,
        expected_brain_version: int,
        *,
        edited_payload: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        story_id, _ = self._repository.locate_proposal(proposal_id)
        return self.accept_proposal(
            story_id,
            proposal_id,
            expected_brain_version,
            edited_payload=edited_payload,
            reason=reason,
        )

    def reject_proposal(
        self, story_id: str, proposal_id: str, reason: str | None = None
    ) -> NarrativeProposal:
        proposal = self._find_proposal(story_id, proposal_id)
        if proposal.status != ProposalStatus.PENDING:
            raise ProposalAlreadyDecidedError(proposal_id)
        return self._repository.decide_proposal(
            story_id, proposal_id, accepted=False, reason=reason
        )

    def reject_proposal_by_id(
        self, proposal_id: str, reason: str | None = None
    ) -> NarrativeProposal:
        story_id, _ = self._repository.locate_proposal(proposal_id)
        return self.reject_proposal(story_id, proposal_id, reason)

    def resolve_proposal_novel(self, proposal_id: str) -> tuple[str, NarrativeProposal]:
        return self._repository.locate_proposal(proposal_id)

    def resolve_proposal_group_novel(self, group_id: str) -> tuple[str, list[NarrativeProposal]]:
        return self._repository.locate_proposal_group(group_id)

    def decide_proposal(
        self, story_id: str, proposal_id: str, accepted: bool, reason: str | None = None
    ) -> NarrativeProposal:

        return self._repository.decide_proposal(story_id, proposal_id, accepted, reason)

    def _find_proposal(self, story_id: str, proposal_id: str) -> NarrativeProposal:
        proposal = next(
            (
                item
                for item in self._repository.list_proposals(story_id)
                if item.proposal_id == proposal_id
            ),
            None,
        )
        if proposal is None:
            raise KeyError(f"Proposal not found: {proposal_id}")
        return proposal

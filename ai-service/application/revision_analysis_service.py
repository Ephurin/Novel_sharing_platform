from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from typing import Any

from application.ports import ContentHashMismatchError, RevisionContentProvider
from domain.models import AnalysisRun, NarrativeProposal
from domain.repositories import NarrativeRepository
from services.entity_pipeline.pipeline import EntityPipeline
from services.event_summarizer import extract_narrative_events
from services.state_transition_proposals import generate_state_transition_proposals


@dataclass(frozen=True, slots=True)
class RevisionAnalysisResult:
    analysis_run: AnalysisRun
    proposals: tuple[NarrativeProposal, ...]
    deduplicated: bool


class RevisionAnalysisService:
    def __init__(
        self,
        repository: NarrativeRepository,
        revision_provider: RevisionContentProvider,
        entity_pipeline: EntityPipeline,
        llm_service: Any,
    ) -> None:
        self._repository = repository
        self._revision_provider = revision_provider
        self._entity_pipeline = entity_pipeline
        self._llm_service = llm_service

    def analyze(
        self,
        *,
        tenant_id: str,
        novel_id: str,
        chapter_id: str,
        revision_id: str,
        content_hash: str,
        operation: str,
        idempotency_key: str,
        options: dict[str, bool],
    ) -> RevisionAnalysisResult:
        revision = self._revision_provider.get_revision(
            tenant_id=tenant_id,
            novel_id=novel_id,
            chapter_id=chapter_id,
            revision_id=revision_id,
        )
        actual_hash = hashlib.sha256(revision.content.encode("utf-8")).hexdigest()
        if revision.content_hash != content_hash or actual_hash != content_hash:
            raise ContentHashMismatchError(revision_id)

        input_hash = hashlib.sha256(
            json.dumps(
                {
                    "revision_id": revision_id,
                    "content_hash": content_hash,
                    "operation": operation,
                    "options": options,
                },
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        run = self._repository.get_or_create_analysis_run(
            novel_id,
            idempotency_key=f"{tenant_id}:{idempotency_key}",
            input_hash=input_hash,
            operation=operation,
            pipeline_version=self._entity_pipeline.pipeline_version,
        )
        existing = self._repository.list_proposals(
            novel_id, analysis_run_id=run.run_id
        )
        if existing:
            return RevisionAnalysisResult(run, tuple(existing), True)

        brain = self._repository.get_story_brain(novel_id)
        brain_version = int(brain.metadata.get("brain_version", "1"))
        group_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"proposal-group:{run.run_id}"))
        chapter_number = getattr(revision, "chapter_number", None)
        if chapter_number is None and hasattr(self._repository, "get_revision_provenance"):
            prov = self._repository.get_revision_provenance(novel_id, revision_id)
            if prov:
                chapter_number = prov.get("chapter_number")
        if chapter_number is None:
            raise ValueError(f"Canonical chapter_number is required for revision analysis of revision {revision_id}")
        if hasattr(self._repository, "record_revision_provenance"):
            self._repository.record_revision_provenance(
                story_id=novel_id,
                chapter_id=chapter_id,
                revision_id=revision_id,
                chapter_number=chapter_number,
            )
        proposals: list[NarrativeProposal] = []

        approved_entities: list[dict[str, str]] = [
            {"normalized_name": e.name, "raw_name": e.name, "type": e.entity_type}
            for e in brain.entities]

        if options.get("extract_entities", True):
            raw_entities = self._entity_pipeline.run(
                revision.content, llm_service=self._llm_service
            )
            for index, item in enumerate(raw_entities):
                name = str(item["phrase"]).strip()
                start = revision.content.casefold().find(name.casefold())
                if start < 0:
                    continue
                evidence = {
                    "revision_id": revision_id,
                    "start": start,
                    "end": start + len(name),
                    "text_hash": content_hash,
                }
                payload = {
                    "canonical_name": name,
                    "normalized_name": name.casefold(),
                    "entity_type": str(item["entity"]),
                }
                proposals.append(
                    self._proposal(
                        run,
                        group_id,
                        "entity",
                        payload,
                        evidence,
                        float(item["score"]),
                        brain_version,
                        index,
                    )
                )
                approved_entities.append(
                    {"normalized_name": name, "raw_name": name, "type": str(item["entity"])}
                )

        if options.get("extract_world_rules", False):
            for match in re.finditer(
                r"(?im)^\s*(?:luật|quy\s*tắc|world\s*rule|rule)\s*:\s*(?P<rule>[^\r\n]+)",
                revision.content,
            ):
                rule = match.group("rule").strip()
                if not rule:
                    continue
                rule_hash = hashlib.sha256(rule.casefold().encode("utf-8")).hexdigest()[:16]
                proposals.append(
                    self._proposal(
                        run,
                        group_id,
                        "fact",
                        {
                            "fact_type": "world_rule",
                            "fact_key": f"world_rule_{rule_hash}",
                            "fact_value": rule,
                            "priority": 100,
                            "chapter_number": chapter_number,
                        },
                        {
                            "revision_id": revision_id,
                            "chapter_id": chapter_id,
                            "chapter_number": chapter_number,
                            "start": match.start("rule"),
                            "end": match.end("rule"),
                            "text_hash": content_hash,
                        },
                        1.0,
                        brain_version,
                        len(proposals),
                    )
                )

        if options.get("extract_events", True):
            events = extract_narrative_events(
                revision.content,
                approved_entities,
                self._llm_service,
                chapter_num=chapter_number,
            )
            for index, event in enumerate(events, start=len(proposals)):
                payload = {
                    "event_type": event.event_type,
                    "participants": event.participants,
                    "summary": event.summary,
                    "chapter": chapter_number,
                    "chapter_number": chapter_number,
                    "locations": event.locations,
                    "consequences": event.consequences,
                }
                evidence = {
                    "revision_id": revision_id,
                    "chapter_id": chapter_id,
                    "chapter_number": chapter_number,
                    "start": 0,
                    "end": len(revision.content),
                    "text_hash": content_hash,
                }
                proposals.append(
                    self._proposal(
                        run,
                        group_id,
                        "event",
                        payload,
                        evidence,
                        event.importance_score,
                        brain_version,
                        index,
                    )
                )

        if options.get("extract_state_transitions", False):
            from dataclasses import replace
            expanded = []
            for proposal in proposals:
                expanded.append(proposal)
                if proposal.proposal_type == "event":
                    expanded.extend(generate_state_transition_proposals(proposal, self._llm_service))
            proposals = [replace(p, materialization_order=i) for i, p in enumerate(expanded)]
        self._repository.save_proposals(novel_id, proposals)
        return RevisionAnalysisResult(run, tuple(proposals), False)

    @staticmethod
    def _proposal(
        run: AnalysisRun,
        group_id: str,
        proposal_type: str,
        payload: dict[str, Any],
        evidence: dict[str, Any],
        confidence: float,
        brain_version: int,
        order: int,
    ) -> NarrativeProposal:
        identity = json.dumps(
            [run.run_id, proposal_type, payload, evidence],
            ensure_ascii=False,
            sort_keys=True,
        )
        return NarrativeProposal(
            proposal_id=str(uuid.uuid5(uuid.NAMESPACE_URL, identity)),
            proposal_type=proposal_type,
            payload=payload,
            analysis_run_id=run.run_id,
            dependency_group_id=group_id,
            materialization_order=order,
            evidence=(evidence,),
            confidence=confidence,
            expected_brain_version=brain_version,
        )

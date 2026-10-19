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
from domain.confidence import score_to_confidence
from core.structured_call import source_scope
from services.state_transition_proposals import generate_state_transition_proposals
from services.source_grounding import find_mention, quote_span, resolve_grounded_quote
from services.prose_facts import extract_prose_facts


@dataclass(frozen=True, slots=True)
class RevisionAnalysisResult:
    analysis_run: AnalysisRun
    proposals: tuple[NarrativeProposal, ...]
    deduplicated: bool


class RevisionAnalysisService:
    def create_author_proposal(self, *, tenant_id, novel_id, chapter_id, revision_id,
                               quote, proposal_type, payload, expected_brain_version):
        from domain.projection import validate_payload, resolve_entity
        from domain.errors import OptimisticLockError
        revision = self._revision_provider.get_revision(tenant_id=tenant_id, novel_id=novel_id,
            chapter_id=chapter_id, revision_id=revision_id)
        actual_hash = hashlib.sha256(revision.content.encode("utf-8")).hexdigest()
        if actual_hash != revision.content_hash:
            raise ContentHashMismatchError(revision_id)
        start, end = quote_span(revision.content, quote)
        brain = self._repository.get_story_brain(novel_id)
        if int(brain.metadata.get("brain_version", "1")) != expected_brain_version:
            raise OptimisticLockError("Reload memory before creating a correction")
        if proposal_type not in {"entity", "event", "fact"}:
            raise ValueError("Unsupported author proposal type")
        allowed = {"entity": {"canonical_name", "entity_type", "initial_status"},
                   "event": {"event_type", "summary", "participants", "locations", "consequences"},
                   "fact": {"fact_key", "fact_value", "subject_entity_id"}}[proposal_type]
        if set(payload) - allowed:
            raise ValueError("Unsupported fields in author proposal")
        payload = dict(payload)
        validate_payload(proposal_type, payload)
        if proposal_type == "entity":
            name = payload.get("canonical_name", "")
            if not name or find_mention(quote, name) is None:
                raise ValueError("Entity name must occur in the evidence quote")
            if payload.get("entity_type") not in {"PER", "LOC", "ITEM", "ORG", "SKILL"}:
                raise ValueError("Choose a valid entity type")
            payload["normalized_name"] = name.casefold()
        if proposal_type == "fact":
            if payload.get("subject_entity_id"):
                resolve_entity(payload["subject_entity_id"], list(brain.entities))
            payload["fact_type"] = "author_fact"
        payload["chapter_number"] = revision.chapter_number
        if proposal_type == "event":
            payload["chapter"] = revision.chapter_number
        payload["source_type"] = "author"
        if revision.chapter_number is None:
            raise ValueError("Source chapter number is required")
        self._repository.record_revision_provenance(story_id=novel_id, chapter_id=chapter_id,
            revision_id=revision_id, chapter_number=revision.chapter_number)
        identity = json.dumps([revision_id, quote, proposal_type, payload], sort_keys=True, ensure_ascii=False)
        digest = hashlib.sha256(identity.encode()).hexdigest()
        run = self._repository.get_or_create_analysis_run(novel_id,
            idempotency_key=f"{tenant_id}:author:{digest}", input_hash=digest,
            operation="author_memory_proposal", pipeline_version="author-evidence-v1")
        existing = self._repository.list_proposals(novel_id, analysis_run_id=run.run_id)
        if existing:
            return existing[0]
        proposal = self._proposal(run, str(uuid.uuid5(uuid.NAMESPACE_URL, f"author:{run.run_id}")),
            proposal_type, payload, {"revision_id": revision_id, "chapter_id": chapter_id,
                "chapter_number": revision.chapter_number, "start": start, "end": end,
                "text_hash": actual_hash, "quote": quote}, 1.0, expected_brain_version, 0)
        self._repository.save_proposals(novel_id, [proposal])
        return proposal

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

        with source_scope(novel_id=novel_id, chapter_id=chapter_id, revision_id=revision_id,
                          content_hash=content_hash, analysis_run_id=run.run_id):
            approved_entities: list[dict[str, str]] = [
                {"normalized_name": e.name, "raw_name": e.name, "type": e.entity_type}
                for e in brain.entities]

            if options.get("extract_entities", True):
                raw_entities = self._entity_pipeline.run(
                    revision.content, llm_service=self._llm_service
                )
                for index, item in enumerate(raw_entities):
                    name = str(item["phrase"]).strip()
                    span = find_mention(revision.content, name)
                    if span is None:
                        continue
                    start, end = span
                    evidence = {
                        "revision_id": revision_id,
                        "start": start,
                        "end": end,
                        "text_hash": content_hash,
                        "quote": revision.content[start:end],
                    }
                    payload = {
                        "canonical_name": name,
                        "normalized_name": name.casefold(),
                        "entity_type": str(item["entity"]),
                        "initial_status": item.get("initial_status", "Unknown"),
                    }
                    if payload["initial_status"] != "Unknown":
                        try:
                            status_start, status_end, resolved_status_quote = resolve_grounded_quote(
                                revision.content,
                                item.get("status_quote", ""),
                                context_hint=f"{name} is {payload['initial_status']}",
                                llm_service=self._llm_service,
                                max_retries=2,
                            )
                            evidence.update(start=status_start, end=status_end, quote=resolved_status_quote)
                        except ValueError:
                            payload["initial_status"] = "Unknown"
                    proposals.append(
                        self._proposal(
                            run,
                            group_id,
                            "entity",
                            payload,
                            evidence,
                            score_to_confidence(item["score"]),
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
                    try:
                        event_start, event_end, resolved_ev_quote = resolve_grounded_quote(
                            revision.content,
                            event.evidence_quote,
                            context_hint=event.summary,
                            llm_service=self._llm_service,
                            max_retries=2,
                        )
                    except ValueError:
                        continue
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
                        "start": event_start,
                        "end": event_end,
                        "text_hash": content_hash,
                        "quote": resolved_ev_quote,
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

            if options.get("extract_prose_facts", False):
                for fact in extract_prose_facts(revision.content, self._llm_service,
                                              [e["normalized_name"] for e in approved_entities],
                                              review_coverage=options.get('review_fact_coverage', False)):
                    start, end = quote_span(revision.content, fact.quote)
                    payload = {"fact_type": "narrative_fact", "fact_key": fact.fact_key,
                               "fact_value": fact.fact_value, "chapter_number": chapter_number,
                               "certainty": fact.certainty, "subject_name": fact.subject}
                    # Only confirmed state may project onto a subject. Other modalities remain facts
                    # carrying explicit attribution, never live state.
                    if fact.certainty == "confirmed" and fact.subject:
                        payload["subject_entity_name"] = fact.subject
                    else:
                        payload["fact_value"] = {"value": fact.fact_value, "certainty": fact.certainty,
                                                 "subject": fact.subject}
                    proposals.append(self._proposal(run, group_id, "fact", payload,
                        {"revision_id": revision_id, "chapter_id": chapter_id, "chapter_number": chapter_number,
                         "start": start, "end": end, "text_hash": content_hash, "quote": fact.quote}, fact.confidence, brain_version, len(proposals)))

            if options.get("reconcile_canon", True):
                from services.canon_reconciliation import reconcile_proposals
                from dataclasses import replace
                # Preserve source evidence for older facts without relying on a new mutable snapshot.
                enriched = []
                for fact in brain.facts:
                    f = dict(fact)
                    if f.get('chapter_number') == chapter_number and not f.get('evidence') and f.get('source_revision_id'):
                        old = self._revision_provider.get_revision(tenant_id=tenant_id, novel_id=novel_id,
                            chapter_id=chapter_id, revision_id=f['source_revision_id'])
                        if f.get('source_start') is not None and f.get('source_end') is not None:
                            f['evidence'] = [{'quote': old.content[f['source_start']:f['source_end']]}]
                    enriched.append(f)
                proposals = reconcile_proposals(replace(brain, facts=tuple(enriched)), proposals, chapter_number,
                    revision.content, self._llm_service, source_proposal=self._proposal(run, group_id,
                        'revision_source', {}, {'revision_id': revision_id, 'chapter_id': chapter_id,
                            'chapter_number': chapter_number, 'start': 0, 'end': len(revision.content),
                            'text_hash': content_hash}, 1.0, brain_version, 0))
            if options.get("extract_state_transitions", False):
                from dataclasses import replace
                expanded = []
                for proposal in proposals:
                    expanded.append(proposal)
                    if proposal.proposal_type == "event" and not proposal.payload.get('reuse_artifact_id') and not proposal.payload.get('is_retired'):
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

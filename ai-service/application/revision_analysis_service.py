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
    status: str = 'completed'


class RevisionAnalysisService:
    def create_author_entity(self, story_id, name, entity_type):
        from application.entity_review_service import registry
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 255:
            raise ValueError('Provide an entity name of at most 255 characters')
        if entity_type not in {'PER', 'LOC', 'ITEM', 'ORG', 'SKILL'}:
            raise ValueError('Choose a valid entity type')
        name = name.strip()
        # An existing identity is never overwritten or merged by a declaration.
        if any(e['name'].casefold() == name.casefold() for e in registry(self._repository, story_id)['entities']):
            raise ValueError('This identity already exists; use an explicit correction')
        brain = self._repository.get_story_brain(story_id)
        version = int(brain.metadata.get('brain_version', 1))
        payload = {'canonical_name': name, 'normalized_name': name.casefold(), 'entity_type': entity_type,
                   'initial_status': 'Unknown', 'source_type': 'author_declaration'}
        digest = hashlib.sha256(json.dumps([story_id, version, payload], sort_keys=True).encode()).hexdigest()
        # No source occurrence is asserted. Normal group approval and brain-version locking still apply.
        proposal = NarrativeProposal(proposal_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f'author-entity:{digest}')),
            proposal_type='entity', payload=payload, dependency_group_id=f'author-entity:{digest}',
            evidence=(), confidence=1.0, expected_brain_version=version)
        self._repository.save_proposals(story_id, [proposal])
        return proposal

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

    def _prepare_entity_review(self, run, revision, **request):
        from application.entity_review_service import registry
        from services.entity_pipeline.verification import VerifiedEntities
        story_id = request['novel_id']
        guidance = self._repository.get_entity_guidance(story_id)
        request['tenant_id'] = str(request['tenant_id'])
        audit = self._repository.get_entity_candidate_audit(story_id, run.run_id)
        if audit and audit.get('status') == 'completed':
            return RevisionAnalysisResult(run, (), True)
        if audit and audit.get('guidance_version') == guidance['version']:
            if audit.get('status') in {'entities_reviewed', 'completed'}:
                return VerifiedEntities(audit['entities'], audit['aliases'], audit)
            if audit.get('status') == 'waiting_entity_review':
                return RevisionAnalysisResult(run, (), True, 'waiting_entity_review')
        known = registry(self._repository, story_id)
        previous = audit or {}
        trace = {}
        try:
            with source_scope(novel_id=story_id, chapter_id=request['chapter_id'],
                              revision_id=request['revision_id'], content_hash=request['content_hash'],
                              analysis_run_id=run.run_id):
                verified = self._entity_pipeline.run_verified(revision.content,
                    llm_service=self._llm_service, known_entities=known['entities'], known_aliases=known['aliases'],
                    guidance=guidance['entries'], defer_materialization=True,
                    audit_sink=lambda value: trace.update(value))
        except Exception as exc:
            self._repository.save_entity_candidate_audit(story_id, run.run_id,
                {**trace, 'status': 'failed', 'error_code': getattr(exc, 'code', 'ENTITY_CANDIDATE_EXTRACTION_FAILED'),
                 'request': request, 'analysis_run_id': run.run_id,
                 'revision_id': request['revision_id'], 'chapter_id': request['chapter_id'],
                 'review_version': previous.get('review_version', 0) + 1})
            raise
        # Keep decisions only when both occurrence context and the machine identity decision are unchanged.
        old_candidates = {c['candidate_id']: c for c in previous.get('candidates', [])}
        old_machine = {d['candidate_id']: d for d in previous.get('decisions', [])}
        old_review = {d['candidate_id']: d for d in previous.get('reviewed_decisions', [])}
        unchanged = {c['candidate_id'] for c in verified.audit['candidates']
                     if all(old_candidates.get(c['candidate_id'], {}).get(k) == c[k]
                            for k in ('surface', 'start', 'end', 'context_start', 'context_end', 'context'))}
        retained = [old_review[d['candidate_id']] for d in verified.audit['decisions']
                    if d['candidate_id'] in unchanged and old_machine.get(d['candidate_id']) == d
                    and d['candidate_id'] in old_review]
        value = {**verified.audit, 'status': 'waiting_entity_review', 'request': request,
                 'revision_id': request['revision_id'], 'chapter_id': request['chapter_id'],
                 'chapter_number': revision.chapter_number,
                 'analysis_run_id': run.run_id, 'guidance_version': guidance['version'],
                 'analysis_policy': self._entity_pipeline.pipeline_version,
                 'review_version': previous.get('review_version', 0) + 1,
                 'known_entities': known['entities'],
                 'reviewed_decisions': retained, 'entities': verified.entities, 'aliases': verified.aliases}
        self._repository.save_entity_candidate_audit(story_id, run.run_id, value)
        return RevisionAnalysisResult(run, (), False, 'waiting_entity_review')

    def continue_entity_review(self, story_id, run_id, *, tenant_id):
        audit = self._repository.get_entity_candidate_audit(story_id, run_id)
        if not audit or audit.get('request', {}).get('tenant_id') != str(tenant_id):
            raise KeyError(run_id)
        return self.analyze(**audit['request'])

    def review_entities(self, story_id, run_id, *, tenant_id, decisions, expected_version):
        from application.entity_review_service import review_entities
        audit = self._repository.get_entity_candidate_audit(story_id, run_id)
        if not audit or audit.get('request', {}).get('tenant_id') != str(tenant_id):
            raise KeyError(run_id)
        request = audit['request']
        revision = self._revision_provider.get_revision(tenant_id=tenant_id, novel_id=story_id,
            chapter_id=request['chapter_id'], revision_id=request['revision_id'])
        return review_entities(self._repository, story_id, run_id, decisions, expected_version, revision.content)

    def _reopen_entity_review(self, run, story_id, text, names):
        from domain.errors import AnalysisOutputError
        from services.entity_pipeline.candidates import CandidateInventory
        audit = self._repository.get_entity_candidate_audit(story_id, run.run_id)
        inventory = CandidateInventory(text)
        for name in names:
            inventory.add_name(name, 'downstream_unresolved_identity')
        if not inventory.items:
            raise AnalysisOutputError('UNKNOWN_DOWNSTREAM_IDENTITY',
                'Event/fact output references an identity without a source occurrence.', attempts=0)
        candidates = {c['candidate_id']: c for c in audit['candidates']}
        candidates.update((c.candidate_id, c.to_dict()) for c in inventory.items)
        if len(candidates) > 1024:
            raise AnalysisOutputError('ENTITY_CANDIDATE_LIMIT', 'Review inventory exceeds limit.', attempts=0)
        pending_ids = {c.candidate_id for c in inventory.items}
        decisions = {d['candidate_id']: d for d in audit['decisions']}
        decisions.update((c.candidate_id, {'candidate_id': c.candidate_id, 'verdict': 'unresolved',
            'reason': 'Event/fact extraction proposed an identity outside the reviewed inventory'}) for c in inventory.items)
        self._repository.save_entity_candidate_audit(story_id, run.run_id, {**audit,
            'status': 'waiting_entity_review', 'review_version': audit['review_version'] + 1,
            'candidates': list(candidates.values()), 'decisions': list(decisions.values()),
            'reviewed_decisions': [d for d in audit['reviewed_decisions'] if d['candidate_id'] not in pending_ids]},
            expected_version=audit['review_version'])
        return RevisionAnalysisResult(run, (), False, 'waiting_entity_review')

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
        if self._entity_pipeline.candidate_verification_enabled and not options.get('extract_entities', True) and (
                options.get('extract_events', True) or options.get('extract_prose_facts', False)):
            from domain.errors import AnalysisOutputError
            raise AnalysisOutputError('ENTITY_REVIEW_REQUIRED',
                'Event/fact extraction requires the entity review stage in human-review mode.', attempts=0)
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
                    "options": {**options, **({'entity_candidate_policy': self._entity_pipeline.pipeline_version}
                        if self._entity_pipeline.candidate_verification_enabled else {})},
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

        preverified = None
        if self._entity_pipeline.candidate_verification_enabled and options.get('extract_entities', True):
            prepared = self._prepare_entity_review(run, revision, tenant_id=tenant_id, novel_id=novel_id,
                chapter_id=chapter_id, revision_id=revision_id, content_hash=content_hash,
                operation=operation, idempotency_key=idempotency_key, options=options)
            if isinstance(prepared, RevisionAnalysisResult):
                return prepared
            preverified = prepared

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
            verified_aliases = {}

            if options.get("extract_entities", True):
                verified = None
                if self._entity_pipeline.candidate_verification_enabled:
                    verified = preverified
                    raw_entities = verified.entities
                    # Current-source entity inventory, not unverified names or every historical name.
                    approved_entities = []
                    targets = {}
                    for alias in verified.aliases:
                        targets.setdefault(alias['alias'].casefold(), set()).add(alias['entity_name'])
                    verified_aliases = {alias: next(iter(names)) for alias, names in targets.items() if len(names) == 1}
                else:
                    raw_entities = self._entity_pipeline.run(
                        revision.content, llm_service=self._llm_service
                    )
                for index, item in enumerate(raw_entities):
                    name = str(item["phrase"]).strip()
                    span = ((item['verified_start'], item['verified_end']) if verified is not None
                            else find_mention(revision.content, name))
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
                    if verified is not None:
                        payload['entity_candidate_policy'] = self._entity_pipeline.pipeline_version
                        payload['candidate_ids'] = item['candidate_ids']
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
                if verified is not None:
                    for alias in verified.aliases:
                        if alias['alias'].casefold() not in verified_aliases:
                            continue
                        existing_alias = any(a.alias.casefold() == alias['alias'].casefold()
                                             and a.entity_id == alias['entity_id'] for a in brain.aliases)
                        if existing_alias:
                            continue
                        start, end = alias['start'], alias['end']
                        alias_payload = {'alias': alias['alias'], 'entity_name': alias['entity_name'],
                                         'identity_quote': alias['identity_quote']}
                        if alias['entity_id']:
                            alias_payload['entity_id'] = alias['entity_id']
                        proposals.append(self._proposal(run, group_id, 'alias', alias_payload,
                            {'revision_id': revision_id, 'chapter_id': chapter_id, 'chapter_number': chapter_number,
                             'start': start, 'end': end, 'text_hash': content_hash,
                             'quote': revision.content[start:end]}, alias['confidence'], brain_version, len(proposals)))
                    approved_entities.extend({'normalized_name': name, 'raw_name': alias, 'type': ''}
                                             for alias, name in verified_aliases.items())

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
                    if verified_aliases:
                        event = event.model_copy(update={
                            'participants': [verified_aliases.get(p.casefold(), p) for p in event.participants],
                            'locations': [verified_aliases.get(p.casefold(), p) for p in event.locations]})
                    if preverified is not None:
                        allowed = {e['normalized_name'].casefold() for e in approved_entities}
                        unknown = [n for n in [*event.participants, *event.locations] if n.casefold() not in allowed]
                        if unknown:
                            return self._reopen_entity_review(run, novel_id, revision.content, unknown)
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
                                              review_coverage=options.get('review_fact_coverage', False),
                                              verified_aliases=verified_aliases):
                    fact.subject = verified_aliases.get(fact.subject.casefold(), fact.subject)
                    if preverified is not None and fact.subject and fact.subject.casefold() not in {
                            e['normalized_name'].casefold() for e in approved_entities}:
                        return self._reopen_entity_review(run, novel_id, revision.content, [fact.subject])
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
        if preverified is not None:
            audit = self._repository.get_entity_candidate_audit(novel_id, run.run_id)
            self._repository.save_entity_candidate_audit(novel_id, run.run_id,
                {**audit, 'status': 'completed'}, expected_version=audit['review_version'])
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

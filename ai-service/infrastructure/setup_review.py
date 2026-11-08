"""Setup-only adapter of the existing proposal/decision/entity/fact authority.

No P1 writer behavior is changed. Advisory -> Brain -> source -> group -> entities.
"""
from copy import deepcopy
from datetime import datetime, timezone
import uuid
from sqlalchemy import select
from infrastructure.database import session_scope
from infrastructure.orm_models import (BootstrapJobRecord, ProposalRecord, AnalysisRunRecord,
    EntityRecord, EntityAliasRecord, FactRecord, ProposalDecisionRecord)
from domain.errors import BootstrapConflictError
from api.setup_schemas import SetupEntityEdit, SetupRuleEdit
from application.setup_service import digest


def conflict(code='SETUP_REVIEW_CONFLICT'):
    raise BootstrapConflictError(code)


def review_setup(repo, story_id, snapshot_id, request, *, actor_id):
    novel = repo._novel_id(story_id)
    actor = str(uuid.UUID(actor_id))
    body = request.model_dump(mode='json')
    # Set membership is unordered; keyed replay binds normalized full decisions.
    body['decisions'] = sorted(body['decisions'], key=lambda d: d['proposal_id'])
    fingerprint = digest(body)
    with session_scope(repo._session_factory) as session:
        # Do not create a Brain for a foreign/missing source.
        source_filter = [*repo._scope(BootstrapJobRecord, novel),
            BootstrapJobRecord.id == uuid.UUID(snapshot_id),
            BootstrapJobRecord.result['contract_version'].as_string() == 'setup-v1',
            BootstrapJobRecord.result['author_id'].as_string() == actor]
        if session.scalar(select(BootstrapJobRecord.id).where(*source_filter)) is None:
            raise KeyError('SETUP_NOT_FOUND')
        brain = repo._bootstrap_brain(session, novel)
        job = session.scalar(select(BootstrapJobRecord).where(*source_filter).with_for_update())
        result = deepcopy(job.result)
        previous = result.get('setup_review')
        if previous:
            if previous['idempotency_key'] == request.idempotency_key and previous['request_hash'] == fingerprint:
                return deepcopy(previous['response'])
            conflict('SETUP_REVIEW_ALREADY_DECIDED')
        latest = max((r.get('setup_version', 0) for r in session.scalars(
            select(BootstrapJobRecord.result).where(*repo._scope(BootstrapJobRecord, novel))).all()
            if r and r.get('contract_version') == 'setup-v1'), default=0)
        if (job.status != 'waiting_review' or brain.status == 'active'
                or request.expected_setup_version != result['setup_version']
                or latest != result['setup_version'] or request.setup_hash != result['setup_hash']
                or digest(result['setup_source']['setup']) != result['setup_hash']
                or request.expected_review_version != result['review_version']
                or request.expected_brain_version != brain.brain_version):
            conflict('SETUP_REVIEW_VERSION_CONFLICT')
        if result.get('provisional_scope') != digest(['setup-v1', str(repo._tenant_id), str(novel),
                str(job.id), result['setup_hash'], result['setup_version']]):
            conflict('SETUP_IDENTITY_SCOPE_INVALID')
        cards = {c['proposal_id']: c for c in result['setup_cards'] if c['card_type'] != 'initial_condition'}
        ids = {d.proposal_id for d in request.decisions}
        if not cards or ids != set(cards) or ids != set(result['required_proposal_ids']):
            conflict('SETUP_GROUP_INCOMPLETE')
        group = uuid.UUID(request.dependency_group_id)
        rows = session.scalars(select(ProposalRecord).where(
            *repo._scope(ProposalRecord, novel), ProposalRecord.dependency_group_id == group)
            .order_by(ProposalRecord.materialization_order, ProposalRecord.id).with_for_update()).all()
        if {str(p.id) for p in rows} != ids:
            conflict('SETUP_GROUP_INCOMPLETE')
        proposals = {str(p.id): p for p in rows}
        for pid, card in cards.items():
            p = proposals[pid]
            run = session.scalar(select(AnalysisRunRecord).where(
                *repo._scope(AnalysisRunRecord, novel), AnalysisRunRecord.id == p.analysis_run_id))
            expected_evidence = dict(setup_snapshot_id=str(job.id), setup_version=result['setup_version'],
                setup_hash=result['setup_hash'], source_kind=card['source_kind'], origin=card['origin'],
                source_refs=card['source_refs'])
            if (p.status != 'pending' or card['dependency_group_id'] != str(group)
                    or p.expected_brain_version != request.expected_brain_version
                    or p.payload != card['payload'] or p.evidence != [expected_evidence]
                    or run is None or run.operation != 'bootstrap_setup'
                    or p.proposal_type != ('entity' if card['card_type'] == 'entity' else 'fact')
                    or card['source_kind'] not in ('author_setup', 'model_suggestion')):
                conflict('SETUP_PROPOSAL_SOURCE_INVALID')
        confirmed = {str(e.id): e for e in session.scalars(select(EntityRecord).where(
            *repo._scope(EntityRecord, novel), EntityRecord.confirmation_status == 'confirmed')
            .order_by(EntityRecord.id).with_for_update()).all()}
        prepared, new_ids, used = {}, set(), set()
        # Validate the entire group and identity resolution before any write.
        for decision in request.decisions:
            pid = decision.proposal_id
            card, p = cards[pid], proposals[pid]
            payload = deepcopy(p.payload)
            if decision.decision == 'reject':
                prepared[pid] = (payload, None)
                continue
            if card['card_type'] == 'entity':
                if decision.identity is None or decision.edited_rule is not None:
                    conflict('SETUP_IDENTITY_REQUIRED')
                if payload.get('entity_type') not in ('character', 'location'):
                    conflict('SETUP_ENTITY_TYPE_INVALID')
                edit = decision.edited_entity or SetupEntityEdit(canonical_name=payload['canonical_name'], aliases=payload.get('aliases', []))
                payload.update(canonical_name=edit.canonical_name, normalized_name=edit.canonical_name.casefold(), aliases=edit.aliases)
                if len(set(a.casefold() for a in edit.aliases)) != len(edit.aliases):
                    conflict('SETUP_ALIAS_COLLISION')
                if decision.identity.kind == 'existing':
                    target = confirmed.get(decision.identity.approved_entity_id)
                    if target is None or target.entity_type != payload['entity_type']:
                        conflict('SETUP_APPROVED_ID_INVALID')
                    # Selecting an identity never silently renames/rewrites locked or approved records.
                    if decision.edited_entity is not None and (edit.canonical_name != target.canonical_name or edit.aliases):
                        conflict('SETUP_EXISTING_ID_EDIT_CONFLICT')
                    target_id = str(target.id)
                    payload.update(entity_id=target_id, canonical_name=target.canonical_name, normalized_name=target.normalized_name)
                    payload['aliases'] = []
                else:
                    target_id = str(uuid.UUID(p.payload['entity_id']))
                    if session.get(EntityRecord, uuid.UUID(target_id)) is not None:
                        conflict('SETUP_RESERVED_ID_COLLISION')
                    new_ids.add(target_id)
                if target_id in used:
                    conflict('SETUP_IDENTITY_REUSED')
                used.add(target_id)
                prepared[pid] = (payload, target_id)
            elif card['card_type'] == 'world_rule':
                if decision.identity is not None or decision.edited_entity is not None or payload.get('fact_type') != 'world_rule':
                    conflict('SETUP_RULE_INVALID')
                edit = decision.edited_rule or SetupRuleEdit(fact_key=payload['fact_key'], fact_value=payload['fact_value'])
                payload = dict(fact_type='world_rule', **edit.model_dump())
                prepared[pid] = (payload, str(uuid.uuid5(job.id, 'setup-fact:'+pid)))
            else:
                conflict('SETUP_UNSUPPORTED_CARD')
        keys = set()
        for decision in request.decisions:
            if decision.decision != 'accept' or cards[decision.proposal_id]['card_type'] != 'world_rule':
                continue
            payload, artifact_id = prepared[decision.proposal_id]
            subject = payload.get('subject_entity_id')
            if subject is not None and subject not in set(confirmed) | new_ids:
                conflict('SETUP_RULE_SUBJECT_INVALID')
            key = (subject, payload['fact_key'])
            subject_filter = FactRecord.subject_entity_id == uuid.UUID(subject) if subject else FactRecord.subject_entity_id.is_(None)
            if key in keys or session.scalar(select(FactRecord.id).where(*repo._scope(FactRecord, novel),
                    FactRecord.fact_key == payload['fact_key'], subject_filter).limit(1)) is not None:
                conflict('SETUP_FACT_COLLISION')
            keys.add(key)
            if session.get(FactRecord, uuid.UUID(artifact_id)) is not None:
                conflict('SETUP_FACT_COLLISION')
        timestamp = datetime.now(timezone.utc).isoformat()
        decisions, artifacts = [], []
        # Entity before fact regardless of request order; FK integrity stays authoritative.
        ordered = sorted(request.decisions, key=lambda d: cards[d.proposal_id]['card_type'] != 'entity')
        for decision in ordered:
            pid = decision.proposal_id
            p, card = proposals[pid], cards[pid]
            payload, artifact_id = prepared[pid]
            source_kind = card['source_kind']
            provenance = dict(snapshot_id=str(job.id), setup_hash=result['setup_hash'], setup_version=result['setup_version'],
                origin=card['origin'], source_kind=source_kind, source_refs=card['source_refs'])
            if decision.decision == 'accept':
                if card['card_type'] == 'entity' and artifact_id in new_ids:
                    session.add(EntityRecord(id=uuid.UUID(artifact_id), story_brain_id=brain.id,
                        tenant_id=repo._tenant_id, novel_id=novel, entity_type=payload['entity_type'],
                        canonical_name=payload['canonical_name'], normalized_name=payload['normalized_name'],
                        source_type=source_kind, confirmation_status='confirmed', created_by=uuid.UUID(actor),
                        static_attributes=dict(mentions=0, source_type=source_kind, setup_provenance=provenance)))
                    session.flush()
                    for alias in payload.get('aliases', []):
                        session.add(EntityAliasRecord(entity_id=uuid.UUID(artifact_id), alias=alias,
                            normalized_alias=alias.casefold(), source_type=source_kind, confirmation_status='confirmed'))
                elif card['card_type'] == 'world_rule':
                    session.add(FactRecord(id=uuid.UUID(artifact_id), story_brain_id=brain.id,
                        tenant_id=repo._tenant_id, novel_id=novel, fact_type='world_rule',
                        subject_entity_id=uuid.UUID(payload['subject_entity_id']) if payload.get('subject_entity_id') else None,
                        fact_key=payload['fact_key'], fact_value=payload['fact_value'], source_type=source_kind,
                        confirmation_status='confirmed', created_by=uuid.UUID(actor), chapter_number=None, source_revision_id=None))
                artifacts.append(artifact_id)
            audit = dict(proposal_id=pid, decision=decision.decision, edited_payload=payload,
                identity=decision.identity.model_dump() if decision.identity else None,
                reason=decision.reason, actor_id=actor, tenant_id=str(repo._tenant_id), novel_id=str(novel),
                provenance=provenance, decided_at=timestamp,
                artifact_ids=[artifact_id] if decision.decision == 'accept' else [])
            decisions.append(audit)
            p.status = 'accepted' if decision.decision == 'accept' else 'rejected'
            p.decision_reason = decision.reason
            # Raw proposal.payload/evidence and original model/source output remain immutable.
            session.add(ProposalDecisionRecord(proposal_id=p.id, actor_id=uuid.UUID(actor),
                decision='edit_accept' if decision.decision == 'accept' and (decision.edited_entity or decision.edited_rule) else decision.decision,
                edited_payload=audit, reason=decision.reason))
        brain.brain_version += 1
        result['review_version'] += 1
        unresolved = [c['proposal_id'] for c in result['setup_cards'] if c['card_type'] == 'initial_condition']
        response = dict(snapshot_id=str(job.id), setup_version=result['setup_version'], review_version=result['review_version'],
            brain_version=brain.brain_version, status='reviewed_with_unresolved' if unresolved else 'review_complete',
            canonical_artifact_ids=artifacts, unresolved_proposal_ids=unresolved, decisions=decisions,
            activation_available=False)
        result['setup_review'] = dict(idempotency_key=request.idempotency_key, request_hash=fingerprint, response=response)
        job.result = result
        job.stage = response['status']
        session.flush()
        return response

"""Author-only P1 APIs behind the authenticated, owner-checking Node Gateway.

Path IDs are public novel IDs, not narrative.story_brains.id. Tenant headers are
accepted only with the shared service credential and must match repository scope.
"""
from dataclasses import asdict, replace
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from api.deps import require_service_token, get_revision_analysis_service
from application import entity_hitl
from application.entity_review_service import save_guidance
from application.ports import ContentHashMismatchError, RevisionNotFoundError
from domain.errors import OptimisticLockError, IdempotencyConflictError


def author_scope(request: Request, tenant: UUID = Header(alias='X-Tenant-Id'),
                 author: UUID = Header(alias='X-Author-Id'),
                 service=Depends(get_revision_analysis_service)):
    configured = getattr(service._repository, '_tenant_id', request.app.state.settings.default_tenant_id)
    if str(tenant) != str(configured):
        raise HTTPException(403, detail={'code': 'TENANT_SCOPE_MISMATCH'})
    if not hasattr(service._repository, 'get_entity_candidate_audit'):
        raise HTTPException(503, detail={'code': 'HITL_REQUIRES_POSTGRES'})
    return str(tenant)


router = APIRouter(prefix='/v1/story-brains', dependencies=[Depends(require_service_token), Depends(author_scope)])


def invoke(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except PermissionError as exc:
        raise HTTPException(403, detail={'code': 'SCOPE_MISMATCH'}) from exc
    except (KeyError, RevisionNotFoundError) as exc:
        raise HTTPException(404, detail={'code': 'RESOURCE_NOT_FOUND'}) from exc
    except (OptimisticLockError, IdempotencyConflictError) as exc:
        raise HTTPException(409, detail={'code': 'CHECKPOINT_CONFLICT', 'message': str(exc)}) from exc
    except (ValueError, ContentHashMismatchError) as exc:
        raise HTTPException(422, detail={'code': 'INVALID_EVIDENCE', 'message': str(exc)}) from exc


class ApprovedMemory(BaseModel):
    schema_version: Literal[1] = 1
    story_id: str
    brain_id: str | None
    brain_version: int
    entities: list[dict]
    aliases: list[dict]
    mentions: list[dict]
    events: list[dict]
    facts: list[dict]
    relations: list[dict]
    current_state: dict
    metadata: dict
    provenance: list[dict]


@router.get('/{novel_id}/memory')
def memory(novel_id: UUID, service=Depends(get_revision_analysis_service)):
    brain = invoke(service._repository.get_story_brain, str(novel_id), read_only=True)
    # Resolve superseded artifacts without exposing historical replacements as current.
    replacements = {e.metadata['supersedes_id']: e for e in brain.events if e.metadata.get('supersedes_id')}
    events = []
    active_events = []
    for event in brain.events:
        if event.metadata.get('supersedes_id'):
            continue
        seen = set()
        while event.event_id in replacements:
            if event.event_id in seen:
                raise HTTPException(409, detail={'code': 'INVALID_CANON_HISTORY'})
            seen.add(event.event_id)
            event = replacements[event.event_id]
        if not event.metadata.get('is_retired'):
            events.append(asdict(event))
            active_events.append(replace(event, metadata={k: v for k, v in event.metadata.items() if k != 'supersedes_id'}))
    replaced = {f['supersedes_id'] for f in brain.facts if f.get('supersedes_id')}
    facts = [f for f in brain.facts if f.get('fact_id') not in replaced and not f.get('is_retired')
             and f.get('confirmation_status', 'confirmed') == 'confirmed']
    fact_ids = {f['fact_id'] for f in facts}
    event_ids = {e.event_id for e in active_events}
    entity_ids = {e.entity_id for e in brain.entities}
    transitions = [t for t in brain.transitions if t['entity_id'] in entity_ids
        and (t.get('fact_id') in fact_ids or t.get('event_id') in event_ids)]
    from domain.projection import project, project_relations
    state = invoke(project, brain.entities, facts, active_events, transitions)
    relations = invoke(project_relations, brain.entities, brain.relations, state)
    entities = [asdict(e) for e in brain.entities]
    for entity in entities:
        attributes = state.get('entities', {}).get(entity['entity_id'], {})
        for key in ('status', 'location'):
            if key in attributes:
                entity[key] = attributes[key]
    dto = ApprovedMemory(story_id=str(novel_id), brain_id=brain.metadata.get('brain_id'),
        brain_version=int(brain.metadata.get('brain_version', 1)), entities=entities,
        aliases=[asdict(a) for a in brain.aliases], mentions=[asdict(m) for m in brain.mentions],
        events=events, facts=facts, relations=[asdict(r) for r in relations],
        current_state=state, metadata=brain.metadata,
        provenance=[{'proposal_id': p.proposal_id, 'proposal_type': p.proposal_type,
            'analysis_run_id': p.analysis_run_id, 'source_type': p.payload.get('source_type', 'AI'),
            'evidence': list(p.evidence)} for p in brain.proposals if p.status.value == 'accepted'])
    return {'data': dto.model_dump()}


class Guidance(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_version: int = Field(ge=0)
    entries: list[dict] = Field(max_length=256)


class Review(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_version: int = Field(ge=1)
    decisions: list[dict] = Field(max_length=1024)
    finalize: bool = True


class Refresh(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_version: int = Field(ge=1)


class AuthorEntity(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=255)
    entity_type: Literal['PER', 'LOC', 'ORG', 'ITEM', 'SKILL']


class AuthorProposal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    chapter_id: UUID
    revision_id: UUID
    quote: str = Field(min_length=1, max_length=30000)
    proposal_type: Literal['entity', 'event', 'fact']
    payload: dict
    expected_brain_version: int = Field(ge=1)


@router.get('/{novel_id}/entity-candidate-audits/{run_id}')
def audit(novel_id: UUID, run_id: UUID, service=Depends(get_revision_analysis_service)):
    value = service._repository.get_entity_candidate_audit(str(novel_id), str(run_id))
    if value is None:
        raise HTTPException(404, detail={'code': 'AUDIT_NOT_FOUND'})
    return {'data': value}


@router.get('/{novel_id}/entity-guidance')
def guidance(novel_id: UUID, service=Depends(get_revision_analysis_service)):
    return {'data': {**service._repository.get_entity_guidance(str(novel_id)),
        'chapter_review_enabled': service._entity_pipeline.candidate_verification_enabled}}


@router.post('/{novel_id}/entity-guidance')
def update_guidance(novel_id: UUID, payload: Guidance, service=Depends(get_revision_analysis_service)):
    return {'data': invoke(save_guidance, service._repository, str(novel_id), payload.entries, payload.expected_version)}


@router.post('/{novel_id}/author-entities', status_code=201)
def author_entity(novel_id: UUID, payload: AuthorEntity, service=Depends(get_revision_analysis_service)):
    return {'data': asdict(invoke(service.create_author_entity, str(novel_id), **payload.model_dump()))}


@router.get('/{novel_id}/entity-reviews')
def reviews(novel_id: UUID, service=Depends(get_revision_analysis_service)):
    return {'data': service._repository.list_entity_reviews(str(novel_id))}


@router.post('/{novel_id}/entity-reviews/{run_id}/review')
def review(novel_id: UUID, run_id: UUID, payload: Review, tenant=Depends(author_scope), service=Depends(get_revision_analysis_service)):
    return {'data': invoke(entity_hitl.review, service, str(novel_id), str(run_id), tenant, **payload.model_dump())}


@router.post('/{novel_id}/entity-reviews/{run_id}/continue')
def continue_review(novel_id: UUID, run_id: UUID, tenant=Depends(author_scope), service=Depends(get_revision_analysis_service)):
    result = invoke(entity_hitl.continue_review, service, str(novel_id), str(run_id), tenant)
    return {'data': {'analysis_run_id': str(run_id), 'status': result.status,
        'proposal_count': len(result.proposals), 'deduplicated': result.deduplicated}}


@router.post('/{novel_id}/entity-reviews/{run_id}/refresh')
def refresh(novel_id: UUID, run_id: UUID, payload: Refresh, tenant=Depends(author_scope), service=Depends(get_revision_analysis_service)):
    return {'data': invoke(entity_hitl.refresh, service, str(novel_id), str(run_id), tenant, payload.expected_version)}


@router.post('/{novel_id}/author-proposals', status_code=201)
def author_proposal(novel_id: UUID, payload: AuthorProposal, tenant=Depends(author_scope), service=Depends(get_revision_analysis_service)):
    return {'data': asdict(invoke(service.create_author_proposal, tenant_id=tenant,
        novel_id=str(novel_id), **payload.model_dump(mode='json')))}

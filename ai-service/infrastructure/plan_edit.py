"""Immutable future-plan snapshots in the existing plan/objective tables."""
from copy import deepcopy
from dataclasses import asdict
from datetime import datetime,timezone
import uuid, hashlib
from sqlalchemy import select,func,text,update
from infrastructure.database import session_scope
from infrastructure.orm_models import StoryPlanRecord as Plan, StoryPlanObjectiveRecord as Objective, EntityRecord
from application.setup_service import digest
from domain.errors import BootstrapConflictError


def lock(repo,session,novel):
    key=int.from_bytes(hashlib.sha256(f'{repo._tenant_id}:{novel}:plans'.encode()).digest()[:8],'big',signed=True)
    session.execute(text('SELECT pg_advisory_xact_lock(:key)'),{'key':key})


def public_objective(row):
    m=row.objective_metadata or {}
    return dict(objective_id=m.get('logical_id',str(row.id)),intent_version=row.intent_version,
        target_chapter=row.target_chapter,title=row.title,description=row.description,
        events=deepcopy(m.get('events',[])),dependencies=list(m.get('dependencies',[])))


def manual(row):
    return (row.edit_metadata or {}).get('contract_version')=='plan-edit-v1'


def source_states(rows):
    # Append-only delete receipts archive exactly the named snapshot, not descendants.
    archived={r.edit_metadata.get('source_plan_id') for r in rows if manual(r) and r.edit_metadata.get('action')=='delete'}
    def state(row):
        action=(row.edit_metadata or {}).get('action')
        if action=='delete':return 'tombstone'
        if action=='skip':return 'skipped'
        return 'archived' if str(row.id) in archived else row.status
    return state


def read(repo,novel,actor,plan_id=None):
    novel=repo._novel_id(novel);actor=uuid.UUID(actor)
    with session_scope(repo._session_factory) as session:
        rows=session.scalars(select(Plan).where(*repo._scope(Plan,novel)).order_by(Plan.plan_version)).all()
        # Current ownership is Gateway authority; source creator never auto-delegates.
        if any(manual(r) and r.created_by!=actor for r in rows):raise KeyError('PLAN_NOT_FOUND')
        head=max((r.plan_version for r in rows),default=0)
        visible=[r for r in rows if manual(r) and r.created_by==actor]
        effective=source_states(visible)
        def serialize(r):
            objs=session.scalars(select(Objective).where(Objective.plan_id==r.id).order_by(Objective.order_index)).all()
            state=effective(r)
            content=state not in ('tombstone','skipped')
            return dict(plan_id=str(r.id),plan_version=r.plan_version,status=r.status,
                effective_status=state,snapshot_status=(r.edit_metadata or {}).get('receipt',{}).get('status',r.status),is_historical=r.plan_version!=head,
                can_save=content and state!='archived' and r.plan_version==head,
                can_activate=content and state!='archived' and bool(objs),
                can_fork=content,can_archive=content and state!='archived',
                contract_version='plan-edit-v1',source_outline=r.source_outline or '',
                objectives=[public_objective(o) for o in objs],private_notes=(r.edit_metadata or {}).get('private_notes',''),
                source_plan_id=(r.edit_metadata or {}).get('source_plan_id'),head_version=head,
                action=(r.edit_metadata or {}).get('action','legacy'))
        if plan_id is not None:
            row=next((r for r in visible if str(r.id)==plan_id),None)
            if row is None:raise KeyError('PLAN_NOT_FOUND')
            return serialize(row)
        return dict(head_version=head,active_plan_id=next((str(r.id) for r in visible if r.status=='active'),None),
                    active_plan_unavailable=any(r.status=='active' and r not in visible for r in rows),
                    plans=[serialize(r) for r in visible])


def command(repo,novel,actor,body):
    novel=repo._novel_id(novel);actor=uuid.UUID(actor)
    data=body.model_dump(mode='json');fingerprint=digest(data)
    with session_scope(repo._session_factory) as session:
        lock(repo,session,novel)
        rows=session.scalars(select(Plan).where(*repo._scope(Plan,novel)).order_by(Plan.plan_version).with_for_update()).all()
        if any(manual(r) and r.created_by!=actor for r in rows):raise KeyError('PLAN_NOT_FOUND')
        existing=next((r for r in rows if r.idempotency_key==body.idempotency_key),None)
        if existing:
            if (existing.edit_metadata or {}).get('contract_version')!='plan-edit-v1':raise BootstrapConflictError('PLAN_IDEMPOTENCY_CONFLICT')
            if existing.input_hash!=fingerprint:raise BootstrapConflictError('PLAN_IDEMPOTENCY_CONFLICT')
            return deepcopy(existing.edit_metadata['receipt'])
        head=max((r.plan_version for r in rows),default=0)
        if head!=body.expected_plan_version:raise BootstrapConflictError('PLAN_VERSION_CONFLICT')
        source=next((r for r in rows if str(r.id)==body.source_plan_id),None)
        if body.source_plan_id and (source is None or source.created_by!=actor):raise KeyError('PLAN_NOT_FOUND')
        if source and (source.edit_metadata or {}).get('contract_version')!='plan-edit-v1':raise BootstrapConflictError('LEGACY_PLAN_REQUIRES_IMPORT')
        if source and body.action!='skip':
            state=source_states(rows)(source)
            if state in ('tombstone','skipped'):raise BootstrapConflictError('PLAN_SOURCE_NOT_EDITABLE')
            if state=='archived' and body.action!='fork':raise BootstrapConflictError('PLAN_SOURCE_ARCHIVED')
        if source and body.action=='save' and source.plan_version!=head:raise BootstrapConflictError('PLAN_VERSION_CONFLICT')
        old_rows=session.scalars(select(Objective).where(Objective.plan_id==source.id).order_by(Objective.order_index)).all() if source else []
        old={r.objective_metadata['logical_id']:r for r in old_rows}
        objectives=[]
        if body.action in ('save','fork'):
            confirmed={str(i) for i in session.scalars(select(EntityRecord.id).where(*repo._scope(EntityRecord,novel),EntityRecord.confirmation_status=='confirmed')).all()}
            metadata=session.scalars(select(Objective.objective_metadata).join(Plan,Plan.id==Objective.plan_id).where(
                *repo._scope(Objective,novel),*repo._scope(Plan,novel),Plan.edit_metadata['contract_version'].as_string()=='plan-edit-v1')).all()
            known={m.get('logical_id') for m in metadata}
            known_events={e['event_id'] for m in metadata for e in m.get('events',[])}
            source_events={e['event_id'] for r in old_rows for e in (r.objective_metadata or {}).get('events',[])}
            for o in body.objectives:
                prev=old.get(o.objective_id)
                if o.expected_intent_version!=(prev.intent_version if prev else 0) or (prev is None and o.objective_id in known):raise BootstrapConflictError('OBJECTIVE_VERSION_CONFLICT')
                for e in o.events:
                    if e.event_id in known_events and e.event_id not in source_events:raise BootstrapConflictError('FUTURE_EVENT_ID_REUSED')
                    if any(p.entity_id and p.entity_id not in confirmed for p in e.participants):raise BootstrapConflictError('PLAN_PARTICIPANT_INVALID')
                value=o.model_dump(exclude={'expected_intent_version'})
                prior=public_objective(prev) if prev else None
                if prior:prior.pop('intent_version')
                version=(prev.intent_version+(value!=prior)) if prev else 1
                objectives.append(dict(**value,intent_version=version))
            outline,notes=body.source_outline,body.private_notes
        elif body.action=='activate':
            objectives=[public_objective(o) for o in old_rows]
            if not objectives:raise BootstrapConflictError('EMPTY_PLAN_NOT_ACTIVATABLE')
            outline,notes=source.source_outline,(source.edit_metadata or {}).get('private_notes','')
        else:outline,notes='', ''
        switches=body.action in ('activate','skip') or (body.action=='delete' and source.status=='active')
        if switches and any(r.status=='active' and not manual(r) and r.created_by!=actor for r in rows):
            raise BootstrapConflictError('LEGACY_ACTIVE_PLAN_HANDOFF_REQUIRED')
        if switches:
            session.execute(update(Plan).where(*repo._scope(Plan,novel),Plan.status=='active').values(status='superseded'))
        plan_id=uuid.uuid4();version=head+1
        status={'activate':'active','skip':'skipped','delete':'deleted'}.get(body.action,'draft')
        receipt=dict(plan_id=str(plan_id),plan_version=version,status=status,contract_version='plan-edit-v1',
            source_plan_id=body.source_plan_id,head_version=version,source_outline=outline,objectives=objectives,
            action=body.action)  # Notes never enter command/public/provider result.
        record=Plan(id=plan_id,tenant_id=repo._tenant_id,novel_id=novel,plan_version=version,status=status,
            source_outline=outline,source_outline_hash=hashlib.sha256((outline or '').encode()).hexdigest(),
            idempotency_key=body.idempotency_key,input_hash=fingerprint,created_by=actor,
            edit_metadata=dict(contract_version='plan-edit-v1',source_plan_id=body.source_plan_id,
                private_notes=notes,action=body.action,actor_id=str(actor),created_at=datetime.now(timezone.utc).isoformat(),receipt=receipt))
        session.add(record);session.flush()
        for i,o in enumerate(objectives):
            session.add(Objective(id=uuid.uuid4(),plan_id=plan_id,tenant_id=repo._tenant_id,novel_id=novel,
                order_index=i+1,target_chapter=o['target_chapter'],objective_type='chapter_goal',title=o['title'],description=o['description'],
                status='pending',intent_version=o['intent_version'],objective_metadata=dict(contract_version='plan-edit-v1',
                    logical_id=o['objective_id'],events=o['events'],dependencies=o['dependencies'])))
        session.flush()
        return receipt

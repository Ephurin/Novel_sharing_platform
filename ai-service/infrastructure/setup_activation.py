"""setup-m0-v1: explicit reviewed setup consent, never chapter history.

Lock order: bootstrap advisory -> Brain -> current Platform owner -> source job
-> proposals/decisions -> materialized artifacts. No provider calls.
"""
from copy import deepcopy
from datetime import datetime, timezone
import uuid
from sqlalchemy import select, text
from infrastructure.database import session_scope
from infrastructure.orm_models import (BootstrapJobRecord as Job, ProposalRecord as Proposal,
    ProposalDecisionRecord as Decision, AnalysisRunRecord as Run, EntityRecord as Entity,
    FactRecord as Fact, EventRecord, EntityMentionRecord, StateTransitionRecord)
from domain.errors import BootstrapConflictError
from application.setup_service import digest


def deny(code):
    raise BootstrapConflictError(code)


def eligibility(repo, session, novel, brain, job, actor):
    r=job.result
    if brain.status=='active':deny('M0_ALREADY_ACTIVE')
    if job.status!='waiting_review':deny('M0_SETUP_NOT_REVIEWED')
    sources=session.scalars(select(Job).where(*repo._scope(Job,novel))).all()
    latest=max((j.result.get('setup_version',0) for j in sources if (j.result or {}).get('contract_version')=='setup-v1'),default=0)
    if r['setup_version']!=latest:deny('M0_STALE_SETUP')
    if any(j.id!=job.id and (j.status in ('running','queued','importing') or
            (j.status=='waiting_review' and not (j.result or {}).get('setup_review')))
            for j in sources):deny('M0_BOOTSTRAP_IN_PROGRESS')
    if digest(r['setup_source']['setup'])!=r['setup_hash']:deny('M0_SOURCE_INVALID')
    if r.get('provisional_scope')!=digest(['setup-v1',str(repo._tenant_id),str(novel),str(job.id),r['setup_hash'],r['setup_version']]):deny('M0_SOURCE_INVALID')
    review=(r.get('setup_review') or {}).get('response')
    if not review or review.get('status') not in ('review_complete','reviewed_with_unresolved'):deny('M0_SETUP_NOT_REVIEWED')
    if (review['setup_version']!=r['setup_version'] or review['review_version']!=r['review_version']
            or review['brain_version']!=brain.brain_version):deny('M0_REVIEW_STALE')
    cards={c['proposal_id']:c for c in r.get('setup_cards',[]) if c['card_type']!='initial_condition'}
    audits={d['proposal_id']:d for d in review['decisions']}
    if not cards or set(cards)!=set(r['required_proposal_ids']) or set(audits)!=set(cards):deny('M0_GROUP_INCOMPLETE')
    unresolved=[c['proposal_id'] for c in r['setup_cards'] if c['card_type']=='initial_condition']
    if sorted(unresolved)!=sorted(review['unresolved_proposal_ids']):deny('M0_GROUP_INCOMPLETE')
    proposals=session.scalars(select(Proposal).where(*repo._scope(Proposal,novel),Proposal.id.in_([uuid.UUID(i) for i in cards])).order_by(Proposal.id).with_for_update()).all()
    if len(proposals)!=len(cards):deny('M0_GROUP_INCOMPLETE')
    groups={p.dependency_group_id for p in proposals}
    if len(groups)!=1 or set(session.scalars(select(Proposal.id).where(*repo._scope(Proposal,novel),Proposal.dependency_group_id.in_(groups))).all())!={p.id for p in proposals}:deny('M0_GROUP_INCOMPLETE')
    artifacts=[]
    for p in proposals:
        pid=str(p.id);card=cards[pid];audit=audits[pid]
        run=session.scalar(select(Run).where(*repo._scope(Run,novel),Run.id==p.analysis_run_id))
        rows=session.scalars(select(Decision).where(Decision.proposal_id==p.id).with_for_update()).all()
        expected_status='accepted' if audit['decision']=='accept' else 'rejected'
        evidence=dict(setup_snapshot_id=str(job.id),setup_version=r['setup_version'],setup_hash=r['setup_hash'],source_kind=card['source_kind'],origin=card['origin'],source_refs=card['source_refs'])
        if (run is None or run.operation!='bootstrap_setup' or p.status!=expected_status
                or str(p.dependency_group_id)!=card['dependency_group_id'] or p.payload!=card['payload']
                or p.evidence!=[evidence] or len(rows)!=1 or str(rows[0].actor_id)!=actor
                or rows[0].edited_payload!=audit or rows[0].decision not in (('accept','edit_accept') if expected_status=='accepted' else ('reject',))
                or audit.get('actor_id')!=actor or audit.get('novel_id')!=str(novel)
                or audit.get('tenant_id')!=str(repo._tenant_id)):
            deny('M0_DECISION_INCONSISTENT')
        ids=audit['artifact_ids']
        if expected_status=='rejected':
            if ids:deny('M0_ARTIFACT_INCONSISTENT')
            continue
        if len(ids)!=1:deny('M0_ARTIFACT_INCONSISTENT')
        target=uuid.UUID(ids[0]);payload=audit['edited_payload']
        if card['card_type']=='entity':
            entity=session.scalar(select(Entity).where(*repo._scope(Entity,novel),Entity.id==target).with_for_update(read=True))
            if (p.proposal_type!='entity' or entity is None or entity.confirmation_status!='confirmed'
                    or entity.canonical_name!=payload['canonical_name'] or str(target)!=payload['entity_id']):deny('M0_ARTIFACT_INCONSISTENT')
        elif card['card_type']=='world_rule':
            fact=session.scalar(select(Fact).where(*repo._scope(Fact,novel),Fact.id==target).with_for_update(read=True))
            if (p.proposal_type!='fact' or fact is None or fact.confirmation_status!='confirmed'
                    or fact.is_retired or fact.fact_type!='world_rule' or fact.fact_key!=payload['fact_key']
                    or fact.fact_value!=payload['fact_value'] or fact.source_revision_id is not None
                    or fact.chapter_number is not None or str(fact.created_by)!=actor):deny('M0_ARTIFACT_INCONSISTENT')
        else:deny('M0_UNSUPPORTED_ARTIFACT')
        artifacts.extend(ids)
    if not artifacts or sorted(artifacts)!=sorted(review['canonical_artifact_ids']):deny('M0_NO_ACCEPTED_ARTIFACT')
    # M0 is genuinely chapterless, not an alias for manuscript bootstrap.
    for table in ('chapter_revisions','revision_outbox_events'):
        if session.execute(text(f'SELECT 1 FROM {table} WHERE novel_id=:n LIMIT 1'),dict(n=novel)).first():deny('M0_REQUIRES_CHAPTERLESS_BASELINE')
    for model in (EventRecord,EntityMentionRecord,StateTransitionRecord):
        if session.scalar(select(model.id).where(*repo._scope(model,novel)).limit(1)) is not None:deny('M0_HISTORY_EXISTS')
    for table in ('revision_provenances','current_entity_states'):
        if session.execute(text(f'SELECT 1 FROM narrative.{table} WHERE tenant_id=:t AND novel_id=:n LIMIT 1'),dict(t=repo._tenant_id,n=novel)).first():deny('M0_HISTORY_EXISTS')
    return artifacts,unresolved


def activate(repo,novel_id,snapshot_id,actor_id,request=None):
    novel=uuid.UUID(novel_id);actor=str(uuid.UUID(actor_id));source=uuid.UUID(snapshot_id)
    fingerprint=digest(dict(novel_id=str(novel),snapshot_id=str(source),actor_id=actor,tenant_id=str(repo._tenant_id),request=request.model_dump(mode='json'))) if request else None
    with session_scope(repo._session_factory) as session:
        scope=[*repo._scope(Job,novel),Job.id==source,Job.result['contract_version'].as_string()=='setup-v1',Job.result['author_id'].as_string()==actor]
        if session.scalar(select(Job.id).where(*scope)) is None:raise KeyError('SETUP_NOT_FOUND')
        brain=repo._bootstrap_brain(session,novel)
        if session.execute(text('SELECT novel_id FROM novels WHERE novel_id=:n AND author_id=:a FOR SHARE'),dict(n=novel,a=uuid.UUID(actor))).first() is None:raise KeyError('SETUP_NOT_FOUND')
        job=session.scalar(select(Job).where(*scope).with_for_update())
        r=deepcopy(job.result);previous=r.get('setup_activation')
        if previous and request:
            if previous['idempotency_key']==request.idempotency_key and previous['request_hash']==fingerprint:return deepcopy(previous['response'])
            deny('M0_IDEMPOTENCY_CONFLICT')
        if previous:
            return dict(contract_version='setup-m0-v1',eligible=False,reason='M0_ALREADY_ACTIVE',activation=previous['response'])
        try:
            artifacts,unresolved=eligibility(repo,session,novel,brain,job,actor)
        except BootstrapConflictError as exc:
            if request:raise
            return dict(contract_version='setup-m0-v1',eligible=False,reason=exc.code)
        tokens=dict(setup_hash=r['setup_hash'],expected_setup_version=r['setup_version'],expected_review_version=r['review_version'],expected_brain_version=brain.brain_version)
        if request is None:return dict(contract_version='setup-m0-v1',eligible=True,reason=None,**tokens)
        if any(getattr(request,k)!=v for k,v in tokens.items()):deny('M0_VERSION_CONFLICT')
        brain.brain_version+=1
        receipt=dict(contract_version='setup-m0-v1',baseline_kind='M0',novel_id=str(novel),brain_id=str(brain.id),snapshot_id=str(job.id),setup_hash=r['setup_hash'],setup_version=r['setup_version'],review_version=r['review_version'],brain_version=brain.brain_version,baseline_revision_id=None,status='active',activated_by=actor,activated_at=datetime.now(timezone.utc).isoformat(),canonical_artifact_ids=artifacts,unresolved_proposal_ids=unresolved)
        r['setup_activation']=dict(contract_version='setup-m0-v1',idempotency_key=request.idempotency_key,request_hash=fingerprint,response=receipt)
        job.result=r;job.status='completed';job.stage='m0_active'
        brain.status='active';brain.baseline_revision_id=None
        session.flush()
        return deepcopy(receipt)

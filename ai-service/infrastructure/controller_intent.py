"""Controller-only downstream fencing in the transaction that writes canon/progress."""
import re
import uuid
from sqlalchemy import select, text
from domain.errors import ControllerIntentSupersededError
from infrastructure.orm_models import AutonomousRunRecord, StoryPlanRecord, StoryPlanObjectiveRecord, WritingGenerationRecord

_UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
_ATTEMPT = re.compile(rf'^auto-({_UUID})-obj-({_UUID})-intent-(\d+)-plan-(\d+)-iter-(\d+)-try-(\d+)$')

def lock_controller_intent(session, *, novel_id, tenant_id, intent):
    """Lock order matches acceptDraft: run → plan → objective, then canon rows.

    The key is loaded from the persisted job, never trusted from request text.
    No provider or cross-service call occurs while these locks are held.
    """
    def stale(): raise ControllerIntentSupersededError('Controller intent changed; accepted history requires author review')
    actor_id = uuid.UUID(intent['actor_id'])
    job = session.scalar(select(WritingGenerationRecord).where(
        WritingGenerationRecord.job_id == uuid.UUID(intent['generation_id']),
        WritingGenerationRecord.novel_id == novel_id, WritingGenerationRecord.tenant_id == tenant_id))
    match = _ATTEMPT.fullmatch(job.idempotency_key) if job else None
    if not match: stale()
    run_id, objective_id, epoch, version, iteration, retry = match.groups()
    run = session.scalar(select(AutonomousRunRecord).where(
        AutonomousRunRecord.id == uuid.UUID(run_id), AutonomousRunRecord.novel_id == novel_id,
        AutonomousRunRecord.tenant_id == tenant_id, AutonomousRunRecord.created_by == actor_id).with_for_update())
    if not run or run.status != 'running' or run.plan_version != int(version) or str(run.current_objective_id) != objective_id or run.current_chapter_id != job.chapter_id or run.last_generation_id != job.job_id or run.current_iteration != int(iteration) or run.current_retries != int(retry): stale()
    plan = session.scalar(select(StoryPlanRecord).where(StoryPlanRecord.id == run.plan_id,
        StoryPlanRecord.novel_id == novel_id, StoryPlanRecord.tenant_id == tenant_id).with_for_update())
    if not plan or plan.status != 'active' or plan.plan_version != int(version): stale()
    objective = session.scalar(select(StoryPlanObjectiveRecord).where(
        StoryPlanObjectiveRecord.id == uuid.UUID(objective_id), StoryPlanObjectiveRecord.plan_id == run.plan_id,
        StoryPlanObjectiveRecord.novel_id == novel_id, StoryPlanObjectiveRecord.tenant_id == tenant_id).with_for_update())
    if not objective or objective.status != 'in_progress' or objective.intent_version != int(epoch): stale()
    # PG history is the acceptance authority. Mongo reconciliation is independent.
    revision = session.execute(text('select revision_id from public.chapter_revisions where revision_id=:revision and novel_id=:novel and chapter_id=:chapter and source_generation_id=:job and source_type=\'AI_DRAFT_ACCEPT\''),
        {'revision':uuid.UUID(intent['revision_id']), 'novel':novel_id, 'chapter':job.chapter_id, 'job':job.job_id}).first()
    if not revision: stale()
    return run, objective

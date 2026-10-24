import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors/app-error.js';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const attemptPattern = new RegExp(`^auto-(${uuid})-obj-(${uuid})-intent-(\\d+)-plan-(\\d+)-iter-(\\d+)-try-(\\d+)$`);
export function controllerAttempt(key: string) {
  const match = attemptPattern.exec(key);
  if (match) return { runId: match[1], objectiveId: match[2], intent: Number(match[3]),
    planVersion: Number(match[4]), iteration: Number(match[5]), retry: Number(match[6]) };
  if (new RegExp(`^auto-${uuid}-(?:iter|obj)-`).test(key)) {
    throw new AppError(409, 'OBJECTIVE_INTENT_REQUIRED', 'Legacy controller output requires regeneration with a durable intent');
  }
  return null; // Ordinary P1/P2 generations have no controller attempt identity.
}

// Same transaction as revision/outbox INSERT. No provider/network work under row locks.
// Author objective/stop UPDATEs use these same rows: whichever transaction commits
// first determines whether new acceptance is permitted; intent epochs prevent ABA.
export async function assertControllerIntent(client: PoolClient, input: {
  key: string; jobId: string; novelId: string; chapterId: string; authorId: string;
}) {
  const attempt = controllerAttempt(input.key);
  if (!attempt) return;
  const superseded = () => new AppError(409, 'OBJECTIVE_INTENT_SUPERSEDED',
    'Controller intent changed; retain this generation only as an unaccepted candidate');
  const run = (await client.query(`select * from narrative.autonomous_runs
    where id=$1 and novel_id=$2 and created_by=$3 for update`,
    [attempt.runId, input.novelId, input.authorId])).rows[0];
  if (!run || run.status !== 'running' || run.plan_version !== attempt.planVersion ||
      run.current_objective_id !== attempt.objectiveId || run.current_chapter_id !== input.chapterId ||
      run.last_generation_id !== input.jobId || run.current_iteration !== attempt.iteration ||
      run.current_retries !== attempt.retry) throw superseded();
  const plan = (await client.query(`select * from narrative.story_plans
    where id=$1 and novel_id=$2 and tenant_id=$3 for update`,
    [run.plan_id, input.novelId, run.tenant_id])).rows[0];
  if (!plan || plan.status !== 'active' || plan.plan_version !== attempt.planVersion) throw superseded();
  const objective = (await client.query(`select * from narrative.story_plan_objectives
    where id=$1 and plan_id=$2 and novel_id=$3 and tenant_id=$4 for update`,
    [attempt.objectiveId, run.plan_id, input.novelId, run.tenant_id])).rows[0];
  if (!objective || objective.status !== 'in_progress' || objective.intent_version !== attempt.intent) throw superseded();
}

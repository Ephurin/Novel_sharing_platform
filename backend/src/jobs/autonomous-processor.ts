import { listRunningAutonomousRuns } from '../modules/ai/autonomous-run.repository.js';
import { autonomousControllerService } from '../modules/ai/autonomous-controller.service.js';
import { AppError } from '../core/errors/app-error.js';
import { logger } from '../core/logger/logger.js';

let timer: NodeJS.Timeout | null = null;
let processing = false;

export async function processAutonomousRunsOnce(deps?: {
  listRuns?: typeof listRunningAutonomousRuns;
  step?: (authorId: string, runId: string) => Promise<unknown>;
}) {
  if (processing) return;
  processing = true;
  try {
    for (const run of await (deps?.listRuns ?? listRunningAutonomousRuns)()) {
      try {
        if (deps?.step) await deps.step(run.author_id, run.run_id);
        else await autonomousControllerService.stepRun({ userId: run.author_id, role: 'AUTHOR' }, run.run_id);
      } catch (error) {
        if (error instanceof AppError && error.code === 'RUN_STEP_BUSY') continue;
        logger.warn({ runId: run.run_id, error: error instanceof Error ? error.message : 'Unknown error' }, 'Full auto step failed');
        // Every provider/error path is bounded, including an unavailable evaluator.
        const current = await autonomousControllerService.getRun({ userId: run.author_id, role: 'AUTHOR' }, run.run_id);
        if (current.status !== 'running') continue;
        const { aiGatewayService } = await import('../modules/ai/ai-gateway.service.js');
        const retries = current.current_retries + 1;
        await aiGatewayService.forwardRequest({ method: 'PATCH', path: `/v1/autonomous/runs/${run.run_id}`,
          body: { current_retries: retries, status: retries >= current.max_retries_per_objective ? 'failed' : 'running',
            stop_reason: 'autonomous_step_error' }, userId: run.author_id });
      }
    }
  } finally { processing = false; }
}

export function startAutonomousProcessor() {
  if (timer) return;
  timer = setInterval(() => { processAutonomousRunsOnce().catch(error => logger.warn({ error: String(error) }, 'Full auto worker error')); }, 5000);
}
export function stopAutonomousProcessor() {
  if (timer) clearInterval(timer);
  timer = null;
}

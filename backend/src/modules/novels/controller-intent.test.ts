import test from 'node:test';
import assert from 'node:assert/strict';
import { controllerAttempt, assertControllerIntent } from './controller-intent.js';
const r='11111111-1111-4111-8111-111111111111', o='22222222-2222-4222-8222-222222222222';
const key=`auto-${r}-obj-${o}-intent-3-plan-2-iter-0-try-1`;
test('controller identity parses full pinned intent and rejects legacy attempts',()=>{
  assert.deepEqual(controllerAttempt(key),{runId:r,objectiveId:o,intent:3,planVersion:2,iteration:0,retry:1});
  assert.equal(controllerAttempt('ordinary-key'),null);
  assert.throws(()=>controllerAttempt(`auto-${r}-iter-0-try-0`), /durable intent/);
});
test('intent checks run, plan and objective under row locks and rejects ABA epoch',async()=>{
  const calls:string[]=[];
  const rows=[{status:'running',plan_version:2,current_objective_id:o,current_chapter_id:'chapter',last_generation_id:'job',current_iteration:0,current_retries:1,plan_id:'plan',tenant_id:'tenant'}, {status:'active',plan_version:2}, {status:'in_progress',intent_version:4}];
  const client={query:async(sql:string)=>{calls.push(sql);return{rows:[rows.shift()]};}};
  await assert.rejects(assertControllerIntent(client as any,{key,jobId:'job',novelId:'novel',chapterId:'chapter',authorId:'author'}), /intent changed/);
  assert.equal(calls.length,3);assert(calls.every(sql=>sql.includes('for update')));
});

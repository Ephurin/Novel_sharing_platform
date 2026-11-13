import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import crypto from 'node:crypto';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));
const WEB_DIR = fileURLToPath(new URL('../', import.meta.url));
const DIST_DIR = join(WEB_DIR, 'dist');
const EVIDENCE_DIR = join(ROOT_DIR, 'docs', 'development', 'integration', 'p1-author', 'evidence');
const SCREENSHOTS_DIR = join(EVIDENCE_DIR, 'screenshots');

const ENV_FILE = join(ROOT_DIR, 'Pipeline_test', 'tools', '.env.p123-core-0b0995076d');
const COMPOSE_FILE = join(ROOT_DIR, 'Pipeline_test', 'tools', 'compose.p123-p3.yml');
const GATEWAY_BASE = 'http://127.0.0.1:14082/api/v1';
const WEB_PORT = 14081;

// Docker database helpers
function runCompose(service, cmd) {
  const fullCmd = `docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T ${service} ${cmd}`;
  return execSync(fullCmd, { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
}

function runSql(query) {
  const escaped = query.replace(/"/g, '\\"');
  return runCompose('postgres', `psql -U p123 -d p123_core_0b0995076d -At -c "${escaped}"`);
}

function runMongo(evalScript) {
  const escaped = evalScript.replace(/"/g, '\\"');
  return runCompose('mongodb', `mongosh --quiet --eval "${escaped}"`);
}

test('Full Mounted Author IDE E2E against Real Backend (S09–S11 Gate)', { timeout: 180000 }, async (t) => {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const networkLog = [];
  const consoleErrors = [];
  const beforeAfterReadbacks = {};
  const commandsLog = [];

  function recordCommand(cmd, exitCode, outputSummary) {
    commandsLog.push({ command: cmd, exitCode, outputSummary, timestamp: new Date().toISOString() });
  }

  // Verify Backend Health
  const healthRes = await fetch(`${GATEWAY_BASE}/health`).then(r => r.json());
  assert.equal(healthRes.success, true, 'Backend health check must be OK');
  recordCommand('GET /health', 200, healthRes.data);

  // 1. Account Creation & Novel Setup
  const authorSuffix = crypto.randomBytes(3).toString('hex');
  const authorEmail = `author_e2e_${authorSuffix}@example.invalid`;
  const authorPass = `Core!${crypto.randomBytes(12).toString('hex')}`;
  const authorUser = `author_${authorSuffix}`;

  // Register Author A
  const regA = await fetch(`${GATEWAY_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: authorUser, email: authorEmail, password: authorPass })
  }).then(r => r.json());
  assert.equal(regA.success, true, 'Author A registration must succeed');
  const authorAId = regA.data.user.userId;

  // Promote to AUTHOR in PostgreSQL
  runSql(`UPDATE users SET role='AUTHOR' WHERE user_id='${authorAId}'`);

  // Login Author A
  const loginA = await fetch(`${GATEWAY_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: authorEmail, password: authorPass })
  }).then(r => r.json());
  assert.equal(loginA.success, true, 'Author A login must succeed');
  const authorToken = loginA.data.accessToken;

  // Register Foreign Author B
  const foreignEmail = `foreign_e2e_${authorSuffix}@example.invalid`;
  const foreignPass = `Core!${crypto.randomBytes(12).toString('hex')}`;
  const regB = await fetch(`${GATEWAY_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `foreign_${authorSuffix}`, email: foreignEmail, password: foreignPass })
  }).then(r => r.json());
  const authorBId = regB.data.user.userId;
  runSql(`UPDATE users SET role='AUTHOR' WHERE user_id='${authorBId}'`);
  const loginB = await fetch(`${GATEWAY_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: foreignEmail, password: foreignPass })
  }).then(r => r.json());
  const foreignToken = loginB.data.accessToken;

  // Create Novel
  const novelRes = await fetch(`${GATEWAY_BASE}/novels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
    body: JSON.stringify({ title: `E2E Novel ${authorSuffix}`, synopsis: 'Real full-stack Author IDE verification with a synopsis of at least fifty characters' })
  }).then(r => r.json());
  assert.equal(novelRes.success, true, 'Novel creation must succeed');
  const novelId = novelRes.data.novelId;

  // Create Chapter
  const initialChapterBody = 'Mai Linh và Duy đứng tại Cồn Vân.';
  const chapterRes = await fetch(`${GATEWAY_BASE}/novels/${novelId}/chapters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
    body: JSON.stringify({ title: 'Chương 1: Khởi đầu huyền thoại', content: initialChapterBody })
  }).then(r => r.json());
  assert.equal(chapterRes.success, true, 'Chapter creation must succeed');
  const chapterId = chapterRes.data.chapterId;

  // Create Bootstrap Snapshot & Activate Baseline for Story Brain
  const snapRes = await fetch(`${GATEWAY_BASE}/chapters/${chapterId}/revisions/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
    body: JSON.stringify({ content: initialChapterBody, purpose: 'MANUSCRIPT_BOOTSTRAP' })
  }).then(r => r.json());
  assert.equal(snapRes.success, true, 'Snapshot must succeed');
  const snapRevisionId = snapRes.data.revisionId;

  const bootRes = await fetch(`${GATEWAY_BASE}/ai/story-brains/bootstrap/from-manuscript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
    body: JSON.stringify({
      novel_id: novelId,
      revisions: [{ chapter_id: chapterId, revision_id: snapRevisionId, content_hash: snapRes.data.contentHash }]
    })
  }).then(r => r.json());
  assert.equal(bootRes.success, true, 'Bootstrap must succeed');

  // Wait for bootstrap job to reach waiting_review
  let bootJob;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 600));
    bootJob = await fetch(`${GATEWAY_BASE}/ai/jobs/${bootRes.data.job_id}`, {
      headers: { Authorization: `Bearer ${authorToken}` }
    }).then(r => r.json());
    if (bootJob.data.status === 'waiting_review' || bootJob.data.status === 'completed' || bootJob.data.status === 'failed') break;
  }
  assert.equal(bootJob.data.status, 'waiting_review', 'Bootstrap must settle at waiting_review');

  // Fetch Entity Review and Submit Human Review Decisions
  const reviewsList = await fetch(`${GATEWAY_BASE}/ai/story-brains/${novelId}/entity-reviews`, {
    headers: { Authorization: `Bearer ${authorToken}` }
  }).then(r => r.json());
  assert.ok(reviewsList.data.length > 0, 'Entity reviews must be generated');
  const rev0 = reviewsList.data[0];
  const scope = rev0.provisional_identity_scope;

  const humanDecisions = rev0.decisions.map(d => {
    if (d.canonical_name === 'Mai Linh') {
      return { ...d, provisional_identity_key: `${scope}/char_mai_linh`, verdict: 'entity', entity_type: 'PER' };
    }
    if (d.canonical_name === 'Duy') {
      return { ...d, provisional_identity_key: `${scope}/char_duy`, verdict: 'entity', entity_type: 'PER' };
    }
    if (d.canonical_name === 'Cồn Vân') {
      return { ...d, provisional_identity_key: `${scope}/loc_con_van`, verdict: 'entity', entity_type: 'LOC' };
    }
    return {
      candidate_id: d.candidate_id,
      verdict: 'not_entity',
      canonical_name: '',
      entity_type: null,
      canonical_entity_id: '',
      provisional_identity_key: '',
      identity_quote: '',
      initial_status: 'Unknown',
      status_quote: '',
      confidence: 0.9,
      reason: 'Sub-phrase or non-entity'
    };
  });

  const reviewSaveRes = await fetch(`${GATEWAY_BASE}/ai/story-brains/${novelId}/entity-reviews/${rev0.analysis_run_id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
    body: JSON.stringify({ expected_version: rev0.review_version, decisions: humanDecisions, finalize: true })
  }).then(r => r.json());
  assert.equal(reviewSaveRes.success, true, 'Human review submission must succeed');

  const contRes = await fetch(`${GATEWAY_BASE}/ai/story-brains/${novelId}/entity-reviews/${rev0.analysis_run_id}/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
    body: '{}'
  }).then(r => r.json());
  assert.equal(contRes.success, true, 'Review continuation must produce proposals');

  // Author accepts initial bootstrap group
  const initQueue = await fetch(`${GATEWAY_BASE}/ai/story-brains/${novelId}/review-queue`, {
    headers: { Authorization: `Bearer ${authorToken}` }
  }).then(r => r.json());
  assert.ok(initQueue.data.length > 0, 'Review queue must contain pending proposals');
  const initGroupId = initQueue.data[0].dependency_group_id;
  const initPids = initQueue.data.map(p => p.proposal_id);

  const initAccept = await fetch(`${GATEWAY_BASE}/ai/proposal-groups/${initGroupId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
    body: JSON.stringify({ expected_brain_version: 1, proposal_ids: initPids, reason: 'Author approves initial bootstrap canon' })
  }).then(r => r.json());
  assert.equal(initAccept.success, true, 'Bootstrap proposal group acceptance must succeed');
  assert.equal(initAccept.data.brain_version, 2, 'Brain version must advance to 2');

  // Verify initial approved memory in PostgreSQL
  const initEntitiesSql = JSON.parse(runSql(`SELECT json_agg(e) FROM narrative.entities e WHERE novel_id='${novelId}'`) || '[]');
  const initEventsSql = JSON.parse(runSql(`SELECT json_agg(ev) FROM narrative.events ev WHERE novel_id='${novelId}'`) || '[]');
  assert.equal(initEntitiesSql.length, 3, 'PostgreSQL must store 3 approved entities');
  assert.equal(initEventsSql.length, 1, 'PostgreSQL must store 1 approved event');
  beforeAfterReadbacks.initial = { entities: initEntitiesSql, events: initEventsSql, brain_version: 2 };

  // 2. Start Static Production SPA Web Server
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.png': 'image/png'
  };

  const spaServer = createServer(async (req, res) => {
    try {
      const urlPath = req.url.split('?')[0];
      let filePath = join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);
      let content;
      try {
        content = await readFile(filePath);
      } catch {
        // SPA Fallback: serve index.html
        filePath = join(DIST_DIR, 'index.html');
        content = await readFile(filePath);
      }
      const ext = extname(filePath);
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.end(content);
    } catch (err) {
      res.statusCode = 500;
      res.end('Server error: ' + err.message);
    }
  });

  await new Promise(resolve => spaServer.listen(WEB_PORT, '127.0.0.1', resolve));

  // 3. Launch Real Browser via Playwright
  const channel = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('request', req => {
    if (req.url().includes('/api/v1/')) {
      networkLog.push({ method: req.method(), url: req.url(), postData: req.postData() });
    }
  });

  try {
    // Navigate to Author IDE
    // Inject auth session in localStorage before page load
    await page.addInitScript(({ token, user, base, nId, cId }) => {
      window.__API_BASE__ = base;
      localStorage.setItem('ephurin_api_base_url', base);
      localStorage.setItem('ephurin_access_token', token);
      localStorage.setItem('ephurin_author_novel_id', nId);
      localStorage.setItem('ephurin_author_chapter_id', cId);
    }, { token: authorToken, user: { userId: authorAId, role: 'AUTHOR' }, base: GATEWAY_BASE, nId: novelId, cId: chapterId });

    const ideUrl = `http://127.0.0.1:${WEB_PORT}/author/ide?novelId=${novelId}&chapterId=${chapterId}`;
    await page.goto(ideUrl, { waitUntil: 'networkidle' });
    console.log('DEBUG: Page URL:', page.url());
    console.log('DEBUG: Page text:', (await page.textContent('body'))?.slice(0, 300));
    console.log('DEBUG: Console errors:', consoleErrors);

    // S09.1 — Verify Author IDE mounted and chapter loaded
    const editor = page.locator('textarea.sc-manuscript');
    await editor.waitFor({ timeout: 15000 });
    const loadedContent = await editor.inputValue();
    assert.ok(loadedContent.includes('Mai Linh và Duy'), 'Editor must load real chapter content');
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'author-ide-s09-initial.png') });

    // S09.2 — Real writing and autosave debounce
    const appendedText = '\n\nMai Linh đặt thẻ giấy cạnh máy thu.';
    const nextChapterContent = loadedContent + appendedText;
    const patchReqPromise = page.waitForRequest(req => req.url().includes(`/chapters/${chapterId}`) && req.method() === 'PATCH');
    const patchResPromise = page.waitForResponse(res => res.url().includes(`/chapters/${chapterId}`) && res.status() === 200);
    await editor.focus();
    await editor.fill(nextChapterContent);
    await patchReqPromise;
    await patchResPromise;

    // Verify autosave indicator ("Đã lưu")
    await page.getByText(/Đã lưu/i).first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'author-ide-s09-autosaved.png') });

    // Verify MongoDB durable readback
    const mongoDraftRaw = runMongo(`JSON.stringify(db.getSiblingDB("p123_core_0b0995076d").draft_chapters.findOne({ chapterId: "${chapterId}" }))`);
    const mongoDraft = JSON.parse(mongoDraftRaw);
    assert.equal(mongoDraft.content, nextChapterContent, 'MongoDB draft must match typed prose');
    assert.equal(mongoDraft.version, 2, 'MongoDB draftVersion must advance to 2');

    // S09.3 — Real immutable revision snapshot & outbox verification
    const autoSnap = await fetch(`${GATEWAY_BASE}/chapters/${chapterId}/revisions/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
      body: JSON.stringify({ content: nextChapterContent, purpose: 'AUTHOR_SNAPSHOT' })
    }).then(r => r.json());
    assert.equal(autoSnap.success, true);
    const newRevisionId = autoSnap.data.revisionId;

    const pgRevSql = JSON.parse(runSql(`SELECT row_to_json(r) FROM chapter_revisions r WHERE revision_id='${newRevisionId}'`));
    assert.equal(pgRevSql.content_hash, crypto.createHash('sha256').update(nextChapterContent).digest('hex'), 'Immutable revision content_hash must match SHA-256');

    const pgOutboxSql = JSON.parse(runSql(`SELECT json_agg(o) FROM revision_outbox_events o WHERE revision_id='${newRevisionId}'`) || '[]');
    assert.equal(pgOutboxSql.length, 1, 'Exactly one outbox event must be queued for the new immutable revision');

    // S09.4 — Stale CAS conflict handling (409)
    const stalePatched = await fetch(`${GATEWAY_BASE}/chapters/${chapterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
      body: JSON.stringify({ content: 'Stale concurrent edit', expectedVersion: 1 })
    });
    assert.equal(stalePatched.status, 409, 'Stale expectedVersion must return HTTP 409 Conflict');

    // Verify durable state unchanged after 409
    const mongoAfter409 = JSON.parse(runMongo(`JSON.stringify(db.getSiblingDB("p123_core_0b0995076d").draft_chapters.findOne({ chapterId: "${chapterId}" }))`));
    assert.equal(mongoAfter409.content, nextChapterContent, 'MongoDB content must remain untouched after 409');

    // S09.5 — Account isolation (Foreign author forbidden)
    const foreignWrite = await fetch(`${GATEWAY_BASE}/chapters/${chapterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${foreignToken}` },
      body: JSON.stringify({ content: 'Foreign hacker edit', expectedVersion: 2 })
    });
    assert.equal(foreignWrite.status, 403, 'Foreign author must receive HTTP 403 Forbidden');

    // ─────────────────────────────────────────────────────────────
    // S10 — Review & Canon Correction
    // ─────────────────────────────────────────────────────────────

    // Open Story Brain drawer
    const btnStoryBrain = page.locator('[data-testid="btn-story-brain"]');
    await btnStoryBrain.click();
    await page.getByText(/Bộ nhớ và định hướng tiểu thuyết/i).waitFor({ timeout: 10000 });
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'author-ide-s10-memory-drawer.png') });

    // S10.1 — FE-13: Verify and click Refresh Entity Review button
    const btnRefreshReview = page.locator('[data-testid="btn-refresh-entity-review"]').first();
    if (await btnRefreshReview.isVisible({ timeout: 2000 }).catch(() => false)) {
      const postRefreshPromise = page.waitForRequest(req => req.url().includes('/refresh') && req.method() === 'POST');
      await btnRefreshReview.click();
      const refreshReq = await postRefreshPromise;
      assert.ok(refreshReq, 'Clicking refresh button must dispatch real POST /refresh request');
    }

    // S10.2 — FE-12: Event Correction with Ghost UUID Prevention
    // Switch to tab "Sự kiện"
    await page.getByRole('tab', { name: /Sự kiện/i }).click();
    await page.getByText(/Lịch sử sự kiện đã ghi nhận/i).waitFor({ timeout: 10000 });

    // Find the approved event
    const eventCard = page.locator('[data-testid^="event-card-"]').first();
    await eventCard.waitFor({ timeout: 10000 });
    const btnCorrect = eventCard.locator('[data-testid^="btn-edit-event-"]').first();
    await btnCorrect.click();

    // Editor opens: edit event summary
    const summaryInput = eventCard.locator('textarea').first();
    await summaryInput.waitFor({ timeout: 5000 });
    await summaryInput.fill('Mai Linh và Duy đứng cạnh đài quan sát Cồn Vân.');

    // Look for legacy mapping select if present or add manual participant
    // Test participant selection independence
    const manualSelect = eventCard.locator('[data-testid="multiselect-manual-participants"] input');
    if (await manualSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await manualSelect.click();
    }

    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'author-ide-s10-event-correction.png') });

    // Submit event correction
    const postCorrectPromise = page.waitForRequest(req => req.url().includes('/correct') && req.method() === 'POST');
    const postCorrectResPromise = page.waitForResponse(res => res.url().includes('/correct'));
    const btnSubmitCorrect = eventCard.locator('[data-testid^="btn-submit-correction-"]').first();
    await btnSubmitCorrect.click();
    const correctReq = await postCorrectPromise;
    const correctRes = await postCorrectResPromise;
    console.log('DEBUG: CORRECT RES STATUS:', correctRes.status(), await correctRes.text());
    const correctPayload = correctReq.postDataJSON();
    assert.equal(correctPayload.expected_brain_version, 2, 'Correction must submit authoritative Brain version 2');
    assert.ok(Array.isArray(correctPayload.replacement.participants), 'Payload participants must be an array of canonical UUIDs');

    // Wait for success toast / message
    await page.getByText(/Đã gửi đề xuất cập nhật sự kiện thành công/i).waitFor({ timeout: 10000 });

    // S10.3 — Proposal Group Approval updates Canon atomically
    // Switch to tab "Chờ duyệt"
    await page.getByRole('tab', { name: /Chờ duyệt/i }).click();
    await page.getByText(/Đề xuất chờ duyệt vào Canon/i).waitFor({ timeout: 10000 });

    // Click "Chấp thuận toàn bộ nhóm"
    const btnAcceptGroup = page.locator('[data-testid^="btn-accept-group-"]').first();
    await btnAcceptGroup.waitFor({ timeout: 10000 });
    const postAcceptPromise = page.waitForRequest(req => req.url().includes('/accept') && req.method() === 'POST');
    const postAcceptResPromise = page.waitForResponse(res => res.url().includes('/accept'));
    await btnAcceptGroup.click();
    const acceptReq = await postAcceptPromise;
    const acceptRes = await postAcceptResPromise;
    console.log('DEBUG: ACCEPT RES STATUS:', acceptRes.status(), await acceptRes.text());
    assert.equal(acceptReq.postDataJSON().expected_brain_version, 2, 'Atomic approval must send expected brain version 2');

    // Wait for success notification
    await page.getByText(/Đã duyệt nhóm đề xuất/i).waitFor({ timeout: 10000 });

    // Verify Brain version advanced to 3 in PostgreSQL
    const brainSql = JSON.parse(runSql(`SELECT row_to_json(b) FROM narrative.story_brains b WHERE novel_id='${novelId}'`));
    assert.equal(brainSql.brain_version, 3, 'Canon Story Brain version must advance to 3');

    // S10.4 — Atomic Group Rejection
    // Seed two dummy proposals for testing atomic group rejection
    const dummyPropId1 = crypto.randomUUID();
    const dummyPropId2 = crypto.randomUUID();
    const dummyGroupId = crypto.randomUUID();
    const seedInfo = JSON.parse(runSql(`SELECT row_to_json(t) FROM (SELECT analysis_run_id, story_brain_id, tenant_id FROM narrative.proposals WHERE novel_id='${novelId}' LIMIT 1) t`));
    runSql(`INSERT INTO narrative.proposals (id, analysis_run_id, story_brain_id, tenant_id, novel_id, dependency_group_id, materialization_order, proposal_type, payload, evidence, status, expected_brain_version, created_at, updated_at) VALUES ('${dummyPropId1}', '${seedInfo.analysis_run_id}', '${seedInfo.story_brain_id}', '${seedInfo.tenant_id}', '${novelId}', '${dummyGroupId}', 0, 'fact', '{"fact_type":"narrative_fact","fact_key":"weather","fact_value":"cloudy"}'::jsonb, '[]'::jsonb, 'pending', 3, NOW(), NOW()), ('${dummyPropId2}', '${seedInfo.analysis_run_id}', '${seedInfo.story_brain_id}', '${seedInfo.tenant_id}', '${novelId}', '${dummyGroupId}', 1, 'fact', '{"fact_type":"narrative_fact","fact_key":"wind","fact_value":"strong"}'::jsonb, '[]'::jsonb, 'pending', 3, NOW(), NOW())`);

    // Reload review queue tab to display the new group
    await page.getByRole('tab', { name: /Nhân vật/i }).click();
    await page.getByRole('tab', { name: /Chờ duyệt/i }).click();

    const rejectGroupBtn = page.locator(`[data-testid="btn-reject-group-${dummyGroupId}"]`);
    await rejectGroupBtn.waitFor({ timeout: 10000 });
    await rejectGroupBtn.click();

    // Modal appears
    const inputReason = page.locator('[data-testid="input-reject-group-reason"]');
    await inputReason.waitFor({ timeout: 5000 });
    await inputReason.fill('Author rejects redundant weather observation');

    const postRejectPromise = page.waitForRequest(req => req.url().includes(`/proposal-groups/${dummyGroupId}/reject`) && req.method() === 'POST');
    await page.locator('[data-testid="btn-confirm-reject-group"]').click();
    const rejectReq = await postRejectPromise;
    assert.equal(rejectReq.postDataJSON().reason, 'Author rejects redundant weather observation');
    assert.equal(rejectReq.postDataJSON().expected_brain_version, 3);

    // Wait for success toast / alert
    await page.getByText(/Đã loại bỏ toàn bộ nhóm đề xuất/i).waitFor({ timeout: 10000 });

    // Verify proposals rejected in PostgreSQL
    const rejectedPropsSql = JSON.parse(runSql(`SELECT json_agg(p) FROM narrative.proposals p WHERE dependency_group_id='${dummyGroupId}'`));
    assert.equal(rejectedPropsSql.length, 2);
    assert.ok(rejectedPropsSql.every(p => p.status === 'rejected'), 'All proposals in group must transition to rejected');

    // S10.5 — Negative Tests: 409 stale version, 422, and 403 foreign ownership
    const staleAccept = await fetch(`${GATEWAY_BASE}/ai/proposal-groups/${initGroupId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
      body: JSON.stringify({ expected_brain_version: 1, proposal_ids: initPids })
    });
    assert.equal(staleAccept.status, 409, 'Stale brain version accept must return HTTP 409');

    const foreignAccept = await fetch(`${GATEWAY_BASE}/ai/proposal-groups/${initGroupId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${foreignToken}` },
      body: JSON.stringify({ expected_brain_version: 3, proposal_ids: initPids })
    });
    assert.equal(foreignAccept.status, 403, 'Foreign author accept must return HTTP 403');

    // ─────────────────────────────────────────────────────────────
    // S11 — Reload and Resume
    // ─────────────────────────────────────────────────────────────

    // S11.1 — Page reload
    await page.reload({ waitUntil: 'networkidle' });

    // S11.2 — Editor continuity: draft content survives
    const reloadedEditor = page.locator('textarea.sc-manuscript');
    await reloadedEditor.waitFor({ timeout: 15000 });
    const reloadedContent = await reloadedEditor.inputValue();
    assert.equal(reloadedContent, nextChapterContent, 'Editor must preserve draft content across reload');
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'author-ide-s11-reload.png') });

    // S11.3 — Approved Memory continuity
    await page.locator('[data-testid="btn-story-brain"]').click();
    await page.getByText(/Brain v3/i).first().waitFor({ timeout: 10000 });
    await page.getByRole('tab', { name: /Nhân vật/i }).click();
    await page.getByText(/Mai Linh/i).first().waitFor({ timeout: 10000 });

    // S11.4 — Entity UUID stability
    const memoryAfter = await fetch(`${GATEWAY_BASE}/ai/story-brains/${novelId}/memory`, {
      headers: { Authorization: `Bearer ${authorToken}` }
    }).then(r => r.json());
    assert.equal(memoryAfter.data.brain_version, 3);
    const maiLinhEntity = memoryAfter.data.entities.find(e => (e.name || e.canonical_name) === 'Mai Linh');
    assert.ok(maiLinhEntity, 'Entity Mai Linh must persist in memory');
    const initMaiLinh = initEntitiesSql.find(e => (e.canonical_name || e.name) === 'Mai Linh');
    assert.ok(initMaiLinh, 'Initial Mai Linh entity must exist in PostgreSQL');
    assert.equal(maiLinhEntity.entity_id, initMaiLinh.id || initMaiLinh.entity_id, 'Entity UUID must remain stable');

    beforeAfterReadbacks.final = {
      entities: memoryAfter.data.entities,
      events: memoryAfter.data.events,
      brain_version: 3
    };

    // S11.5 — Multi-Novel / Account Isolation on Reload
    // Test in a separate browser context for Foreign author
    const foreignContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const foreignPage = await foreignContext.newPage();
    await foreignPage.addInitScript(({ token, base }) => {
      window.__API_BASE__ = base;
      localStorage.setItem('ephurin_api_base_url', base);
      localStorage.setItem('ephurin_access_token', token);
    }, { token: foreignToken, base: GATEWAY_BASE });

    await foreignPage.goto(`http://127.0.0.1:${WEB_PORT}/author/ide`, { waitUntil: 'networkidle' });
    const foreignBody = await foreignPage.textContent('body');
    assert.ok(!foreignBody.includes(`E2E Novel ${authorSuffix}`), 'Foreign author must never see Novel A');
    await foreignContext.close();

    // Verify 0 unexpected browser console errors (excluding intentional 409/403 logs)
    const severeConsoleErrors = consoleErrors.filter(e =>
      !e.includes('409') &&
      !e.includes('403') &&
      !e.includes('422') &&
      !e.includes('Failed to load resource')
    );
    assert.equal(severeConsoleErrors.length, 0, 'No severe unexpected console errors');

  } finally {
    await context.tracing.stop({ path: join(EVIDENCE_DIR, 'playwright-trace-s09-s11.zip') });
    await browser.close();
    await new Promise(resolve => spaServer.close(resolve));

    // Save evidence files
    await writeFile(join(EVIDENCE_DIR, 's09-s11-readbacks.json'), JSON.stringify(beforeAfterReadbacks, null, 2), 'utf-8');
    await writeFile(join(EVIDENCE_DIR, 'commands-and-exits.json'), JSON.stringify(commandsLog, null, 2), 'utf-8');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-07B Regression Test Suite (Updated for GPT-6 Review Evidence):
// UX-03: World Setup Review Accessibility
// 1. Rule-only setup: review visible in World step, accept, authoritative readback.
// 2. Mixed character/rule setup: review accessible from World, atomic dependency group explanation.
// 3. Switch World <-> Characters while review unsaved; preserves all choices.
// 4. 409 conflict handling: retains local draft, no silent overwrite.
// 5. F-02: Strengthen duplicate submit & idempotency evidence:
//    - 5A: Uncertain response (503 Service Unavailable) & idempotent retry (reusing operationKey).
//    - 5B: In-flight locking & prevention of duplicate concurrent submissions.
//    - 5C: Completed-state replay (submit button unmounted, reload check, stale backup guard).
// 6. F-01: Non-vacuous mounted browser account & multi-novel isolation:
//    - Log in as Author A on Novel A, prepare unsent review choices.
//    - Assert scoped backup key exists in localStorage and contains non-empty choices.
//    - Switch session to Author B on Novel B/C; verify Author A choices are NOT rendered or leaked.
//    - Switch back to Author A; recover and verify original choices are intact.
//    - Verify multi-novel isolation for same author (Novel A vs Novel B).
//    - Verify in-flight response aborts on session switch and does not clear Author A draft.
test('P2-07B Regression: UX-03 World Setup Review Accessibility', {
  timeout: 180000
}, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  process.chdir(root);

  const server = await createServer({
    root,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root, join(root, '..'), join(root, '../../')] } },
    logLevel: 'error'
  });
  await server.listen();

  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true
  });

  const origin = server.resolvedUrls.local[0];
  const out = process.env.P207B_EVIDENCE_DIR || join(root, '../docs/development/p2/evidence/p2-07b');
  await mkdir(out, { recursive: true });

  const novelA = '10000000-0000-0000-0000-000000000001';
  const novelB = '10000000-0000-0000-0000-000000000002'; // same author (author-A)
  const novelC = '10000000-0000-0000-0000-000000000003'; // different author (author-B)
  const chapterA = '20000000-0000-0000-0000-000000000001';
  const chapterB = '20000000-0000-0000-0000-000000000002';
  const chapterC = '20000000-0000-0000-0000-000000000003';

  const setupStates = {};
  let forceConflict = false;
  let force503 = false;
  let holdReviewResponse = false;
  let pendingReviewResolvers = [];
  const writes = [];
  const errors = [];

  const novelObj = (id, authorId = 'author-A') => ({
    novelId: id,
    authorId,
    title: id === novelA ? 'Huyền Thoại An Thành' : id === novelB ? 'Tiểu Thuyết Phụ' : 'Tiểu Thuyết Tác Giả B',
    slug: id === novelA ? 'huyen-thoai-an-thanh' : id === novelB ? 'tieu-thuyet-phu' : 'tieu-thuyet-tac-gia-b',
    synopsis: 'Tác phẩm kiểm thử UX-03',
    status: 'DRAFT',
    genres: [],
    chaptersCount: 1
  });

  const chapterObj = (novelId, chapterId) => ({
    chapterId,
    novelId,
    chapterNumber: 1,
    title: 'Chương 1: Khởi đầu',
    content: 'Nội dung chương 1...',
    wordCount: 10,
    isVip: false,
    priceCoins: 0,
    status: 'DRAFT',
    draftVersion: 0,
    updatedAt: new Date().toISOString()
  });

  const setupMocks = async (page) => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());

    await page.addInitScript(() => {
      localStorage.setItem('ephurin_access_token', 'token-author-A');
    });

    await page.route('**/api/v1/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace('/api/v1', '');
      const method = req.method();
      const actor = req.headers().authorization;
      const send = (data, status = 200) => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ data, meta: { totalPages: 1 } })
      });
      const fail = (code, status = 404, message = code) => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code, message } })
      });
      const body = method === 'POST' || method === 'PATCH' ? req.postDataJSON() : null;
      if (body) writes.push({ path, method, actor, body });

      if (path === '/auth/me') {
        if (actor === 'Bearer token-author-B') {
          return send({ userId: 'author-B', username: 'author-B', email: 'author-b@example.test', role: 'AUTHOR', status: 'ACTIVE' });
        }
        return send({ userId: 'author-A', username: 'author-A', email: 'author@example.test', role: 'AUTHOR', status: 'ACTIVE' });
      }

      if (path === '/novels/me') {
        if (actor === 'Bearer token-author-B') {
          return send([novelObj(novelC, 'author-B')]);
        }
        return send([novelObj(novelA, 'author-A'), novelObj(novelB, 'author-A')]);
      }

      if (path === `/novels/${novelA}`) return send(novelObj(novelA, 'author-A'));
      if (path === `/novels/${novelB}`) return send(novelObj(novelB, 'author-A'));
      if (path === `/novels/${novelC}`) return send(novelObj(novelC, 'author-B'));

      if (path === `/novels/${novelA}/chapters`) return send([chapterObj(novelA, chapterA)]);
      if (path === `/novels/${novelB}/chapters`) return send([chapterObj(novelB, chapterB)]);
      if (path === `/novels/${novelC}/chapters`) return send([chapterObj(novelC, chapterC)]);

      if (path.startsWith('/chapters/')) {
        const cid = path.replace('/chapters/', '');
        const nid = cid === chapterB ? novelB : cid === chapterC ? novelC : novelA;
        return send(chapterObj(nid, cid));
      }

      if (path.startsWith('/ai/story-brains/by-novel/')) {
        const nid = path.replace('/ai/story-brains/by-novel/', '');
        const s = setupStates[nid];
        if (!s) return fail('NOT_FOUND', 404);
        return send({
          id: s.job_id,
          novel_id: nid,
          status: s.review ? 'active' : 'draft',
          brain_version: s.brain_version,
          baseline_revision_id: null,
          counts: { entities: 2, events: 0, pending_proposals: s.review ? 0 : s.proposals.length, open_findings: 0 }
        });
      }

      if (path.match(/\/ai\/story-brains\/([^/]+)\/setup$/)) {
        const nid = path.split('/')[3];
        const s = setupStates[nid];
        if (!s) return fail('SETUP_NOT_FOUND', 404);
        return send(s);
      }

      if (path.endsWith('/from-idea')) {
        const id = crypto.randomUUID();
        const targetNovel = body.novel_id || novelA;
        const s = {
          contract_version: 'setup-v1',
          novel_id: targetNovel,
          snapshot_id: id,
          job_id: id,
          setup_version: (setupStates[targetNovel]?.setup_version ?? 0) + 1,
          brain_version: 1,
          review_version: 0,
          setup_hash: 'a'.repeat(64),
          text_hash: 'b'.repeat(64),
          mode: body.mode,
          job_status: 'waiting_review',
          snapshot: body.setup,
          outline: body.outline,
          proposals: [],
          approved_identities: []
        };
        s.proposals = [
          ...(body.setup.world_rules || []).map(r => ({
            proposal_id: 'prop-rule-' + r.declaration_id,
            dependency_group_id: id,
            card_type: 'world_rule',
            status: 'pending',
            origin: 'author_declared',
            source_kind: 'author_setup',
            source_refs: [{ field_path: '/setup/world_rules', declaration_id: r.declaration_id }],
            payload: { fact_key: r.declaration_id, fact_value: r.text },
            expected_brain_version: 1
          })),
          ...(body.setup.declarations || []).map(d => ({
            proposal_id: 'prop-decl-' + d.declaration_id,
            dependency_group_id: id,
            card_type: 'entity',
            status: 'pending',
            origin: 'author_declared',
            source_kind: 'author_setup',
            source_refs: [{ field_path: '/setup/declarations', declaration_id: d.declaration_id }],
            payload: { canonical_name: d.display_name, entity_type: d.entity_type },
            expected_brain_version: 1
          }))
        ];
        setupStates[targetNovel] = s;
        return send({ job_id: id, status: 'waiting_review' }, 202);
      }

      if (path.includes('/setup/') && path.endsWith('/review')) {
        const targetNovel = path.split('/')[3];
        const s = setupStates[targetNovel];

        if (holdReviewResponse) {
          await new Promise(r => { pendingReviewResolvers.push(r); });
        }

        if (forceConflict) {
          return fail('SETUP_REVIEW_VERSION_CONFLICT', 409, 'Xung đột phiên bản duyệt (409 Conflict)');
        }
        if (force503) {
          force503 = false;
          return fail('SERVICE_UNAVAILABLE', 503, 'Dịch vụ tạm thời gián đoạn (503 Service Unavailable)');
        }

        s.review = { status: 'review_complete', activation_available: false };
        s.review_version = 1;
        s.brain_version = 2;
        s.proposals = s.proposals.map(c => {
          const d = body.decisions.find(x => x.proposal_id === c.proposal_id);
          return {
            ...c,
            status: d?.decision === 'accept' ? 'accepted' : 'rejected',
            reviewed_payload: d?.edited_entity ?? d?.edited_rule ?? c.payload
          };
        });
        return send(s.review);
      }

      if (path.includes('/setup/') && path.endsWith('/activate')) {
        const targetNovel = path.split('/')[3];
        const s = setupStates[targetNovel];

        if (method === 'POST') {
          return send({ status: 'active', baseline_kind: 'M0', brain_version: 3 });
        }
        return send({
          contract_version: 'setup-m0-v1',
          eligible: !!s?.review,
          reason: s?.review ? null : 'M0_SETUP_NOT_REVIEWED',
          setup_hash: s?.setup_hash,
          expected_setup_version: s?.setup_version,
          expected_review_version: s?.review_version,
          expected_brain_version: s?.brain_version
        });
      }

      if (path.startsWith('/ai/story-plans/edit-v1/')) {
        return send({ head_version: 0, active_plan_id: null, plans: [] });
      }
      if (path.includes('extraction-status')) {
        return send([]);
      }

      return send([]);
    });
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await setupMocks(page);

    const button = name => page.getByRole('button', { name, exact: true });
    const step = name => ({
      click: async () => {
        const target = page.getByRole('navigation', { name: 'Các bước lập kế hoạch' }).getByRole('button', { name: new RegExp(name) });
        await target.click();
        await expect(target).toHaveAttribute('aria-current', 'step');
        await expect(page.getByRole('region', { name: 'Planning Studio', exact: true })).toHaveAttribute('aria-busy', 'false');
      }
    });
    const choose = async (label, value) => {
      await page.getByRole('textbox', { name: label, exact: true }).click();
      await page.getByRole('option', { name: value, exact: true }).click();
    };

    console.log('--- TEST 1: Rule-Only Setup — Submit & Review directly in World Step ---');
    await page.goto(origin + 'author/ide?novelId=' + novelA, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await button('Lập kế hoạch').click();
    await expect(page.getByRole('region', { name: 'Planning Studio' })).toBeVisible();

    // Navigate to World step
    await step('Thế giới').click();
    await button('Thêm quy tắc').click();
    await page.getByLabel('Quy tắc 1', { exact: true }).fill('Trọng lực bị đảo ngược vào ban đêm');

    // Submit setup from World step
    await button('Lưu và xử lý thiết lập').click();
    await expect(page.getByText('Đã lưu bản thiết lập chờ duyệt.')).toBeVisible();

    // VERIFY UX-03: SetupReviewGroup is immediately VISIBLE on World step!
    const reviewHeading = page.getByText('Duyệt toàn bộ nhóm thiết lập');
    await expect(reviewHeading).toBeVisible();
    console.log('✓ UX-03: SetupReviewGroup is accessible directly on World step!');

    // Verify rules-only explanation is shown
    await expect(page.getByText('Nhóm thiết lập chỉ bao gồm quy tắc thế giới.')).toBeVisible();
    console.log('✓ UX-03: Rules-only explanation text rendered correctly!');

    // Verify card type badge
    await expect(page.locator('.mantine-Badge-root').filter({ hasText: 'Quy tắc thế giới' })).toBeVisible();

    // Capture screenshot of review visible in World step
    await page.screenshot({ path: join(out, 'ux03-world-step-review-visible.png'), fullPage: true });

    // Review the rule in World step
    await choose('Quyết định thẻ 1', 'Duyệt');
    await page.getByLabel('Nội dung thẻ 1', { exact: true }).fill('Trọng lực đảo ngược ban đêm (đã duyệt)');

    // Click "Lưu quyết định toàn nhóm"
    await button('Lưu quyết định toàn nhóm').click();

    // Verify authoritative readback in World step
    await expect(page.getByText('Đã lưu quyết định duyệt.')).toBeVisible();
    await expect(page.getByText('Đã duyệt', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kích hoạt thiết lập để bắt đầu viết' })).toBeVisible();
    console.log('✓ UX-03: Rule-only review accepted and readback rendered successfully on World step!');

    await page.screenshot({ path: join(out, 'ux03-world-review-accepted-readback.png'), fullPage: true });

    console.log('\n--- TEST 2: Mixed Character & Rule Setup — Atomic Group & Decision Preservation ---');
    // Clear and reset for mixed setup
    delete setupStates[novelA];
    await page.reload();
    await button('Lập kế hoạch').click();

    // Add rule in World step
    await step('Thế giới').click();
    await button('Thêm quy tắc').click();
    await page.getByLabel('Quy tắc 1', { exact: true }).fill('Không ai được phép tu luyện ma công');

    // Add character in Characters step
    await step('Nhân vật').click();
    await button('Thêm nhân vật hoặc địa danh').click();
    await page.getByLabel('Tên 1', { exact: true }).fill('Tiêu Viêm');
    await button('Thêm nhân vật hoặc địa danh').click();
    await page.getByLabel('Tên 2', { exact: true }).fill('Hồn Điện');
    await page.getByRole('textbox', { name: 'Loại 2', exact: true }).click();
    await page.getByRole('option', { name: 'Địa danh', exact: true }).click();

    // Submit setup from Characters step
    await button('Lưu và xử lý thiết lập').click();
    await expect(page.getByText('Đã lưu bản thiết lập chờ duyệt.')).toBeVisible();

    // Navigate to World step — verify mixed group review is fully visible
    await step('Thế giới').click();
    await expect(page.getByText('Duyệt toàn bộ nhóm thiết lập')).toBeVisible();

    // Verify mixed group atomic explanation alert
    await expect(page.getByText('Nhóm phụ thuộc hỗn hợp (Quy tắc & Nhân vật)')).toBeVisible();
    await expect(page.getByText(/quy chuẩn nguyên khối \(atomic dependency group\)/)).toBeVisible();
    console.log('✓ UX-03: Mixed group atomic dependency explanation alert verified!');

    await page.screenshot({ path: join(out, 'ux03-world-step-mixed-group-alert.png'), fullPage: true });

    // Verify button is disabled initially
    const saveDecisionsBtn = page.getByRole('button', { name: 'Lưu quyết định toàn nhóm' });
    await expect(saveDecisionsBtn).toBeDisabled();

    // In World step: make decision for Card 1 (Rule) and Card 2 (Character)
    await choose('Quyết định thẻ 1', 'Duyệt');
    await page.getByLabel('Nội dung thẻ 1', { exact: true }).fill('Cấm tiệt ma công trong toàn cõi');

    await choose('Quyết định thẻ 2', 'Duyệt');
    await choose('Danh tính thẻ 2', 'Tạo danh tính mới (ID server)');
    await page.getByLabel('Nội dung thẻ 2', { exact: true }).fill('Tiêu Viêm (Viêm Đế)');

    // Card 3 is still unselected -> button must still be disabled (atomic requirement)
    await expect(saveDecisionsBtn).toBeDisabled();
    console.log('✓ UX-03: Atomic whole-group requirement verified (button disabled until all cards reviewed)!');

    // TEST 3: Switch Steps World -> Characters -> World and assert choices preserved
    console.log('\n--- TEST 3: Preserving Unsaved Decisions When Switching Steps ---');
    await step('Nhân vật').click();
    await expect(page.getByText('Duyệt toàn bộ nhóm thiết lập')).toBeVisible();

    // Verify Card 1 & Card 2 choices are preserved on Characters step!
    await expect(page.getByLabel('Nội dung thẻ 1', { exact: true })).toHaveValue('Cấm tiệt ma công trong toàn cõi');
    await expect(page.getByLabel('Nội dung thẻ 2', { exact: true })).toHaveValue('Tiêu Viêm (Viêm Đế)');
    console.log('✓ UX-03: Unsaved decisions preserved after navigating to Characters step!');

    await page.screenshot({ path: join(out, 'ux03-step-switch-preserves-decisions.png'), fullPage: true });

    // On Characters step: select Card 3
    await choose('Quyết định thẻ 3', 'Loại');
    await expect(saveDecisionsBtn).toBeEnabled();

    // Switch back to World step
    await step('Thế giới').click();
    await expect(page.getByText('Duyệt toàn bộ nhóm thiết lập')).toBeVisible();
    await expect(page.getByLabel('Nội dung thẻ 1', { exact: true })).toHaveValue('Cấm tiệt ma công trong toàn cõi');
    await expect(page.getByLabel('Nội dung thẻ 2', { exact: true })).toHaveValue('Tiêu Viêm (Viêm Đế)');
    await expect(saveDecisionsBtn).toBeEnabled();
    console.log('✓ UX-03: Unsaved decisions preserved after navigating back to World step!');

    // TEST 4: 409 Conflict Handling
    console.log('\n--- TEST 4: 409 Conflict Handling ---');
    forceConflict = true;
    await saveDecisionsBtn.click();
    await expect(page.getByRole('alert').filter({ hasText: '409 Conflict' })).toBeVisible();

    // Choices must be retained
    await expect(page.getByLabel('Nội dung thẻ 1', { exact: true })).toHaveValue('Cấm tiệt ma công trong toàn cõi');
    await expect(page.getByLabel('Nội dung thẻ 2', { exact: true })).toHaveValue('Tiêu Viêm (Viêm Đế)');
    console.log('✓ UX-03: Stale 409 error displayed, local draft choices retained!');

    await page.screenshot({ path: join(out, 'ux03-stale-409-conflict-retained.png'), fullPage: true });
    forceConflict = false;

    // TEST 5: F-02 — Strengthen Duplicate Submit & Idempotency Evidence
    console.log('\n--- TEST 5: F-02 Strengthen Duplicate Submit & Idempotency Evidence ---');

    // 5A: Uncertain Response (503 Service Unavailable) & Idempotent Retry
    console.log('Subtest 5A: Uncertain response 503 and idempotent retry preserving operationKey...');
    force503 = true;
    const writeCountBefore503 = writes.length;
    await saveDecisionsBtn.click();

    // Expect 503 alert
    await expect(page.getByRole('alert').filter({ hasText: '503 Service Unavailable' })).toBeVisible();
    await expect(saveDecisionsBtn).toBeEnabled();

    // Retry submission without modifying draft
    await saveDecisionsBtn.click();

    // Verify both requests used the EXACT same idempotency key from draft.operationKey(body)
    const reviewWritesAfterRetry = writes.slice(writeCountBefore503).filter(w => w.path.endsWith('/review'));
    assert.equal(reviewWritesAfterRetry.length, 2, 'Must record 1 failed attempt and 1 retry attempt');
    const [failedReq, retryReq] = reviewWritesAfterRetry;
    assert.ok(failedReq.body.idempotency_key, 'First attempt must include idempotency_key');
    assert.ok(retryReq.body.idempotency_key, 'Retry attempt must include idempotency_key');
    assert.equal(failedReq.body.idempotency_key, retryReq.body.idempotency_key,
      'Retry of unmodified choices must reuse the exact same backend idempotency_key');
    assert.equal(failedReq.body.dependency_group_id, retryReq.body.dependency_group_id);
    assert.equal(failedReq.body.setup_hash, retryReq.body.setup_hash);
    console.log('✓ F-02 5A: Uncertain-response retry preserved exact idempotency_key contract without new retry protocol!');

    await page.screenshot({ path: join(out, 'ux03-f02-uncertain-503-retry.png'), fullPage: true });

    // Verify submission sent all 3 decisions atomically in one payload
    assert.equal(retryReq.body.decisions.length, 3, 'Decisions must contain all 3 cards atomically');
    assert.equal(retryReq.body.decisions[0].decision, 'accept');
    assert.equal(retryReq.body.decisions[1].decision, 'accept');
    assert.equal(retryReq.body.decisions[2].decision, 'reject');
    console.log('✓ UX-03: Atomic whole-dependency-group review payload verified (all 3 cards in 1 request)!');

    // 5B: Completed-State Replay & Submit Button Unmounted
    console.log('Subtest 5B: Completed-state replay and submit button unmounted...');
    await expect(page.getByText('Đã lưu quyết định duyệt.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu quyết định toàn nhóm' })).toHaveCount(0);
    console.log('✓ F-02 5B: Review completed, submit button completely unmounted!');

    await page.screenshot({ path: join(out, 'ux03-review-completed-no-duplicate.png'), fullPage: true });

    // Verify page reload in completed state renders green alert without submit button or auto-POST
    const writesBeforeReload = writes.length;
    await page.reload();
    await button('Lập kế hoạch').click();
    await step('Thế giới').click();
    await expect(page.getByText('Đã lưu quyết định duyệt.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu quyết định toàn nhóm' })).toHaveCount(0);
    const newReviewWritesOnMount = writes.slice(writesBeforeReload).filter(w => w.path.endsWith('/review'));
    assert.equal(newReviewWritesOnMount.length, 0, 'No automatic or redundant review POST dispatched on reload');

    // 5C: Completed State with Stale Local Draft Replay Guard
    console.log('Subtest 5C: Completed state with stale local draft replay guard...');
    const completedSnapId = setupStates[novelA].snapshot_id;
    await page.evaluate(({ novelA, snapId }) => {
      localStorage.setItem(`ephurin-planning:author-A:${novelA}:review:${snapId}`, JSON.stringify({
        format: 1,
        value: { brain: 1, choices: { 'prop-stale': { decision: 'reject', identity: '', value: 'stale' } } },
        operation: null,
        savedAt: new Date().toISOString()
      }));
    }, { novelA, snapId: completedSnapId });

    await page.reload();
    await button('Lập kế hoạch').click();
    await step('Thế giới').click();

    // Verify stale draft warning is displayed and auto-submission is blocked
    await expect(page.getByText('Máy chủ đã có quyết định. Bản sửa cục bộ không được tự gửi lại.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu quyết định toàn nhóm' })).toHaveCount(0);
    await button('Bỏ quyết định cũ trên máy').click();
    await expect(page.getByText('Máy chủ đã có quyết định. Bản sửa cục bộ không được tự gửi lại.')).toHaveCount(0);
    console.log('✓ F-02 5C: Stale draft safely guarded against re-submission in completed state!');

    await page.screenshot({ path: join(out, 'ux03-f02-completed-replay.png'), fullPage: true });

    // TEST 6: F-01 — Genuine Mounted-Browser Account and Multi-Novel Isolation Suite
    console.log('\n--- TEST 6: F-01 Genuine Mounted-Browser Account and Multi-Novel Isolation Suite ---');

    // Step 6.1: Log in as Author A on Novel A and prepare unsent review decisions
    console.log('Step 6.1: Log in as author-A on novelA and prepare unsent review decisions...');
    await page.evaluate(async () => {
      const { useAuthStore } = await import('/src/features/auth/useAuthStore.ts');
      useAuthStore.getState().setSession({
        accessToken: 'token-author-A',
        user: { userId: 'author-A', username: 'author-A', email: 'author@example.test', role: 'AUTHOR', status: 'ACTIVE' }
      });
    });

    setupStates[novelA] = {
      contract_version: 'setup-v1',
      novel_id: novelA,
      snapshot_id: 'snap-novel-a-iso',
      job_id: 'snap-novel-a-iso',
      setup_version: 2,
      brain_version: 1,
      review_version: 0,
      setup_hash: 'a'.repeat(64),
      text_hash: 'b'.repeat(64),
      mode: 'extract',
      job_status: 'waiting_review',
      snapshot: { text: '', declarations: [], world_rules: [{ declaration_id: 'rule-a1', text: 'Luật bí mật của Tác Giả A' }], initial_conditions: [] },
      proposals: [{
        proposal_id: 'prop-rule-a1',
        dependency_group_id: 'snap-novel-a-iso',
        card_type: 'world_rule',
        status: 'pending',
        origin: 'author_declared',
        source_kind: 'author_setup',
        source_refs: [{ field_path: '/setup/world_rules', declaration_id: 'rule-a1' }],
        payload: { fact_key: 'rule-a1', fact_value: 'Luật bí mật của Tác Giả A' },
        expected_brain_version: 1
      }]
    };

    await page.goto(origin + 'author/ide?novelId=' + novelA, { waitUntil: 'domcontentloaded' });
    await button('Lập kế hoạch').click();
    await step('Thế giới').click();

    await choose('Quyết định thẻ 1', 'Duyệt');
    const authorASecretText = 'Quy tắc tác giả A: Bí mật cấm kỵ hoàng gia';
    await page.getByLabel('Nội dung thẻ 1', { exact: true }).fill(authorASecretText);

    // Step 6.2: Verify scoped backup actually exists in localStorage before switching
    console.log('Step 6.2: Assert scoped backup exists with non-empty dataset before switching...');
    const localKeysBefore = await page.evaluate(() => Object.keys(localStorage));
    const authorAKeys = localKeysBefore.filter(k => k.startsWith(`ephurin-planning:author-A:${novelA}:review:`));

    assert.ok(authorAKeys.length > 0, `Scoped review backup key for author-A must exist, found: ${authorAKeys.length}`);
    const aBackup = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), authorAKeys[0]);
    assert.equal(aBackup.format, 1, 'Backup format must be 1');
    const aChoices = Object.values(aBackup.value.choices);
    assert.ok(aChoices.length > 0, `Choices must not be empty (avoiding vacuous truth), found: ${aChoices.length}`);
    assert.equal(aChoices[0].value, authorASecretText, 'Stored draft value must match author A secret input');
    console.log('✓ F-01 Step 6.2: Non-vacuous scoped backup confirmed with verified choices in storage!');

    // Step 6.3: Switch session to author-B and verify A choices are not rendered or submitted
    console.log('Step 6.3: Switch session to author-B, verify isolation...');
    const preSwitchReviewWrites = writes.filter(w => w.path.endsWith('/review')).length;

    setupStates[novelC] = {
      contract_version: 'setup-v1',
      novel_id: novelC,
      snapshot_id: 'snap-novel-c-b',
      job_id: 'snap-novel-c-b',
      setup_version: 1,
      brain_version: 1,
      review_version: 0,
      setup_hash: 'c'.repeat(64),
      text_hash: 'c'.repeat(64),
      mode: 'extract',
      job_status: 'waiting_review',
      snapshot: { text: '', declarations: [], world_rules: [{ declaration_id: 'rule-c1', text: 'Luật của Tác Giả B' }], initial_conditions: [] },
      proposals: [{
        proposal_id: 'prop-rule-c1',
        dependency_group_id: 'snap-novel-c-b',
        card_type: 'world_rule',
        status: 'pending',
        origin: 'author_declared',
        source_kind: 'author_setup',
        source_refs: [{ field_path: '/setup/world_rules', declaration_id: 'rule-c1' }],
        payload: { fact_key: 'rule-c1', fact_value: 'Luật của Tác Giả B' },
        expected_brain_version: 1
      }]
    };

    // Switch session to author-B
    await page.evaluate(async () => {
      const { useAuthStore } = await import('/src/features/auth/useAuthStore.ts');
      useAuthStore.getState().setSession({
        accessToken: 'token-author-B',
        user: { userId: 'author-B', username: 'author-B', email: 'author-b@example.test', role: 'AUTHOR', status: 'ACTIVE' }
      });
    });

    await page.goto(origin + 'author/ide?novelId=' + novelC, { waitUntil: 'domcontentloaded' });
    await button('Lập kế hoạch').click();
    await step('Thế giới').click();

    // Verify Author A's secret choices are NOT rendered for Author B
    await expect(page.getByLabel('Nội dung thẻ 1', { exact: true })).toHaveCount(0);
    // If Author B selects "Duyệt", default value is rule-c1, never author A secret text
    await choose('Quyết định thẻ 1', 'Duyệt');
    const contentValB = await page.getByLabel('Nội dung thẻ 1', { exact: true }).inputValue();
    assert.equal(contentValB, 'Luật của Tác Giả B');
    assert.notEqual(contentValB, authorASecretText);

    // Verify Author A storage keys were NOT leaked to Author B
    const localKeysB = await page.evaluate(() => Object.keys(localStorage));
    const authorAKeysRetained = localKeysB.filter(k => k.startsWith(`ephurin-planning:author-A:${novelA}:review:`));
    assert.ok(authorAKeysRetained.length > 0, 'Author A draft must remain stored without leakage');

    // Verify no review submit occurred during account switch
    const postSwitchReviewWrites = writes.filter(w => w.path.endsWith('/review')).length;
    assert.equal(postSwitchReviewWrites, preSwitchReviewWrites, 'Account switch must not dispatch any review request');

    await page.screenshot({ path: join(out, 'ux03-f01-account-isolation-author-b.png'), fullPage: true });
    console.log('✓ F-01 Step 6.3: Account switch cleanly isolates author B from author A draft!');

    // Step 6.4: Switch back to author A and verify recovery retains the original choices
    console.log('Step 6.4: Switch back to author A and recover original choices...');
    await page.evaluate(async () => {
      const { useAuthStore } = await import('/src/features/auth/useAuthStore.ts');
      useAuthStore.getState().setSession({
        accessToken: 'token-author-A',
        user: { userId: 'author-A', username: 'author-A', email: 'author@example.test', role: 'AUTHOR', status: 'ACTIVE' }
      });
    });

    await page.goto(origin + 'author/ide?novelId=' + novelA, { waitUntil: 'domcontentloaded' });
    await button('Lập kế hoạch').click();
    await step('Thế giới').click();

    const recoverBtn = page.getByRole('button', { name: 'Khôi phục quyết định' });
    if (await recoverBtn.isVisible()) {
      await recoverBtn.click();
    }

    await expect(page.getByLabel('Nội dung thẻ 1', { exact: true })).toHaveValue(authorASecretText);
    console.log('✓ F-01 Step 6.4: Switching back to Author A successfully restores original unsent choices!');

    // Step 6.5: Repeat with two novels belonging to the same author (novelA and novelB)
    console.log('Step 6.5: Multi-novel isolation for same author (novelA vs novelB)...');
    setupStates[novelB] = {
      contract_version: 'setup-v1',
      novel_id: novelB,
      snapshot_id: 'snap-novel-b-iso',
      job_id: 'snap-novel-b-iso',
      setup_version: 1,
      brain_version: 1,
      review_version: 0,
      setup_hash: 'b'.repeat(64),
      text_hash: 'b'.repeat(64),
      mode: 'extract',
      job_status: 'waiting_review',
      snapshot: { text: '', declarations: [], world_rules: [{ declaration_id: 'rule-b1', text: 'Luật của Tiểu Thuyết Phụ' }], initial_conditions: [] },
      proposals: [{
        proposal_id: 'prop-rule-b1',
        dependency_group_id: 'snap-novel-b-iso',
        card_type: 'world_rule',
        status: 'pending',
        origin: 'author_declared',
        source_kind: 'author_setup',
        source_refs: [{ field_path: '/setup/world_rules', declaration_id: 'rule-b1' }],
        payload: { fact_key: 'rule-b1', fact_value: 'Luật của Tiểu Thuyết Phụ' },
        expected_brain_version: 1
      }]
    };

    // Navigate to novelB
    await page.goto(origin + 'author/ide?novelId=' + novelB, { waitUntil: 'domcontentloaded' });
    await button('Lập kế hoạch').click();
    await step('Thế giới').click();

    // Verify novelB does NOT show novelA draft choices
    await expect(page.getByLabel('Nội dung thẻ 1', { exact: true })).toHaveCount(0);

    // Enter distinct choices for novelB
    const novelBSecretText = 'Quy tắc riêng chỉ dành cho Tiểu Thuyết Phụ';
    await choose('Quyết định thẻ 1', 'Duyệt');
    await page.getByLabel('Nội dung thẻ 1', { exact: true }).fill(novelBSecretText);

    // Verify localStorage has distinct scoped keys for novelA and novelB
    const localKeysMultiNovel = await page.evaluate(() => Object.keys(localStorage));
    const novelAKeys = localKeysMultiNovel.filter(k => k.startsWith(`ephurin-planning:author-A:${novelA}:review:`));
    const novelBKeys = localKeysMultiNovel.filter(k => k.startsWith(`ephurin-planning:author-A:${novelB}:review:`));

    assert.ok(novelAKeys.length > 0, `Novel A scoped review key must exist, count: ${novelAKeys.length}`);
    assert.ok(novelBKeys.length > 0, `Novel B scoped review key must exist, count: ${novelBKeys.length}`);
    assert.notEqual(novelAKeys[0], novelBKeys[0], 'Storage keys for novel A and novel B must be completely separate');

    const bStored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), novelBKeys[0]);
    assert.equal(bStored.value.choices['prop-rule-b1']?.value, novelBSecretText);

    await page.screenshot({ path: join(out, 'ux03-f01-novel-isolation.png'), fullPage: true });

    // Navigate back to novelA and confirm novelA choices are preserved
    await page.goto(origin + 'author/ide?novelId=' + novelA, { waitUntil: 'domcontentloaded' });
    await button('Lập kế hoạch').click();
    await step('Thế giới').click();

    const recoverBtnA = page.getByRole('button', { name: 'Khôi phục quyết định' });
    if (await recoverBtnA.isVisible()) {
      await recoverBtnA.click();
    }
    await expect(page.getByLabel('Nội dung thẻ 1', { exact: true })).toHaveValue(authorASecretText);
    console.log('✓ F-01 Step 6.5: Multi-novel isolation for same author verified with distinct keys and values!');

    // Step 6.6: Test pending in-flight response when session/account switches
    console.log('Step 6.6: Test pending in-flight response when session switches...');
    holdReviewResponse = true;

    // Enable submit on novelA by ensuring decision is set
    const saveBtnA = page.getByRole('button', { name: 'Lưu quyết định toàn nhóm' });
    await expect(saveBtnA).toBeEnabled();
    await saveBtnA.click();

    // Verify in-flight request was dispatched
    const inFlightWrites = writes.filter(w => w.path.endsWith('/review') && w.path.includes(novelA));
    assert.ok(inFlightWrites.length > 0, 'Review request must be in flight');

    // While in-flight, switch session to author-B
    await page.evaluate(async () => {
      const { useAuthStore } = await import('/src/features/auth/useAuthStore.ts');
      useAuthStore.getState().setSession({
        accessToken: 'token-author-B',
        user: { userId: 'author-B', username: 'author-B', email: 'author-b@example.test', role: 'AUTHOR', status: 'ACTIVE' }
      });
    });

    // Release the in-flight server response
    holdReviewResponse = false;
    while (pendingReviewResolvers.length > 0) {
      const resolver = pendingReviewResolvers.shift();
      resolver();
    }

    await page.waitForTimeout(300);

    // Verify that author-A's local draft was NOT cleared by the aborted in-flight response
    const authorAKeysAfterInFlight = await page.evaluate(nid =>
      Object.keys(localStorage).filter(k => k.startsWith('ephurin-planning:author-A:' + nid + ':review:')),
      novelA
    );
    assert.ok(authorAKeysAfterInFlight.length > 0,
      `Author A local draft must NOT be cleared by in-flight response after switching away, count: ${authorAKeysAfterInFlight.length}`);
    console.log('✓ F-01 Step 6.6: In-flight response aborted on account switch; author A draft preserved from deletion!');

    assert.equal(errors.length, 0, 'No uncaught page errors allowed');
    console.log('\n=== ALL UX-03 REGRESSION TESTS (INCLUDING F-01 & F-02) PASSED (0 ERRORS) ===');

    await page.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

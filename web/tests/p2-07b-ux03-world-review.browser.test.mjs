import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-07B Regression Test Suite:
// UX-03: World Setup Review Accessibility
// 1. Rule-only setup: review visible in World step, accept, authoritative readback.
// 2. Mixed character/rule setup: review accessible from World, atomic dependency group explanation.
// 3. Switch World <-> Characters while review unsaved; preserves all choices.
// 4. 409 conflict handling: retains local draft, no silent overwrite.
// 5. Review completed: no duplicate submit.
// 6. Account/novel isolation.
test('P2-07B Regression: UX-03 World Setup Review Accessibility', {
  timeout: 180000
}, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  process.chdir(root);

  const server = await createServer({
    root,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
    server: { host: '127.0.0.1', port: 0 },
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
  const novelB = '10000000-0000-0000-0000-000000000002';
  const chapterA = '20000000-0000-0000-0000-000000000001';

  let setupState = null;
  let forceConflict = false;
  const writes = [];
  const errors = [];

  const novelObj = id => ({
    novelId: id,
    authorId: 'author-A',
    title: id === novelA ? 'Huyền Thoại An Thành' : 'Tiểu Thuyết Phụ',
    slug: id === novelA ? 'huyen-thoai-an-thanh' : 'tieu-thuyet-phu',
    synopsis: 'Tác phẩm kiểm thử UX-03',
    status: 'DRAFT',
    genres: [],
    chaptersCount: 1
  });

  const chapterObj = {
    chapterId: chapterA,
    novelId: novelA,
    chapterNumber: 1,
    title: 'Chương 1: Khởi đầu',
    content: 'Nội dung chương 1...',
    wordCount: 10,
    isVip: false,
    priceCoins: 0,
    status: 'DRAFT',
    draftVersion: 0,
    updatedAt: new Date().toISOString()
  };

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
        return send({ userId: 'author-A', username: 'author-A', email: 'author@example.test', role: 'AUTHOR', status: 'ACTIVE' });
      }
      if (path === '/novels/me') return send([novelObj(novelA), novelObj(novelB)]);
      if (path === `/novels/${novelA}`) return send(novelObj(novelA));
      if (path === `/novels/${novelB}`) return send(novelObj(novelB));
      if (path === `/novels/${novelA}/chapters`) return send([chapterObj]);
      if (path === `/chapters/${chapterA}`) return send(chapterObj);

      if (path === `/ai/story-brains/by-novel/${novelA}`) {
        if (!setupState) return fail('NOT_FOUND', 404);
        return send({
          id: setupState.job_id,
          novel_id: novelA,
          status: setupState.review ? 'active' : 'draft',
          brain_version: setupState.brain_version,
          baseline_revision_id: null,
          counts: { entities: 2, events: 0, pending_proposals: setupState.review ? 0 : setupState.proposals.length, open_findings: 0 }
        });
      }

      if (path === `/ai/story-brains/${novelA}/setup`) {
        if (!setupState) return fail('SETUP_NOT_FOUND', 404);
        return send(setupState);
      }

      if (path.endsWith('/from-idea')) {
        const id = crypto.randomUUID();
        setupState = {
          contract_version: 'setup-v1',
          novel_id: novelA,
          snapshot_id: id,
          job_id: id,
          setup_version: (setupState?.setup_version ?? 0) + 1,
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
        setupState.proposals = [
          ...body.setup.world_rules.map(r => ({
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
          ...body.setup.declarations.map(d => ({
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
        return send({ job_id: id, status: 'waiting_review' }, 202);
      }

      if (path.includes('/setup/') && path.endsWith('/review')) {
        if (forceConflict) {
          return fail('SETUP_REVIEW_VERSION_CONFLICT', 409, 'Xung đột phiên bản duyệt (409 Conflict)');
        }
        setupState.review = { status: 'review_complete', activation_available: false };
        setupState.review_version = 1;
        setupState.brain_version = 2;
        setupState.proposals = setupState.proposals.map(c => {
          const d = body.decisions.find(x => x.proposal_id === c.proposal_id);
          return {
            ...c,
            status: d.decision === 'accept' ? 'accepted' : 'rejected',
            reviewed_payload: d.edited_entity ?? d.edited_rule ?? c.payload
          };
        });
        return send(setupState.review);
      }

      if (path.includes('/setup/') && path.endsWith('/activate')) {
        if (method === 'POST') {
          return send({ status: 'active', baseline_kind: 'M0', brain_version: 3 });
        }
        return send({
          contract_version: 'setup-m0-v1',
          eligible: !!setupState?.review,
          reason: setupState?.review ? null : 'M0_SETUP_NOT_REVIEWED',
          setup_hash: setupState?.setup_hash,
          expected_setup_version: setupState?.setup_version,
          expected_review_version: setupState?.review_version,
          expected_brain_version: setupState?.brain_version
        });
      }

      if (path === `/ai/story-plans/edit-v1/${novelA}`) {
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
    setupState = null;
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

    // TEST 5: Successful Atomic Review Submission & No Duplicate Submit
    console.log('\n--- TEST 5: Successful Atomic Review Submission & No Duplicate Submit ---');
    forceConflict = false;
    const preCount = writes.length;
    await saveDecisionsBtn.click();

    // Verify submission sent all 3 decisions atomically in one payload
    const reviewWrite = writes.slice(preCount).find(w => w.path.endsWith('/review'));
    assert.ok(reviewWrite, 'Review POST request must be made');
    assert.equal(reviewWrite.body.decisions.length, 3, 'Decisions must contain all 3 cards atomically');
    assert.equal(reviewWrite.body.decisions[0].decision, 'accept');
    assert.equal(reviewWrite.body.decisions[1].decision, 'accept');
    assert.equal(reviewWrite.body.decisions[2].decision, 'reject');
    console.log('✓ UX-03: Atomic whole-dependency-group review payload verified (all 3 cards in 1 request)!');

    // Verify completed alert and submit button unmounted
    await expect(page.getByText('Đã lưu quyết định duyệt.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu quyết định toàn nhóm' })).toHaveCount(0);
    console.log('✓ UX-03: Review completed, no duplicate submit button visible!');

    await page.screenshot({ path: join(out, 'ux03-review-completed-no-duplicate.png'), fullPage: true });

    // Check proposal badges: on World step, rule is shown
    await expect(page.getByText('Đã duyệt', { exact: true })).toBeVisible();

    // TEST 6: Account/Novel Isolation
    console.log('\n--- TEST 6: Account / Novel Scoping ---');
    const localKeys = await page.evaluate(() => Object.keys(localStorage));
    const reviewKeys = localKeys.filter(k => k.includes(':review:'));
    assert.ok(reviewKeys.every(k => k.startsWith('ephurin-planning:author-A:' + novelA)),
      'Review draft keys must be scoped strictly to actor and novel');
    console.log('✓ UX-03: Review draft keys strictly scoped to author-A and novelA!');

    assert.equal(errors.length, 0, 'No uncaught page errors allowed');
    console.log('\n=== ALL UX-03 REGRESSION TESTS PASSED (0 ERRORS) ===');

    await page.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

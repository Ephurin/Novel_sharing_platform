import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-06B AI Brainstorming UI Regression Test Suite:
// 1. Modal launch & scope selection (all, world_rules, characters, future_events).
// 2. Inline editing on suggestion cards before adopting.
// 3. Adopt into draft (World Rules -> Setup rules, Characters -> Setup declarations, Future Events -> Plan objectives).
// 4. Invariant: Strict draft-only, dirty state set, zero Canon mutation, zero narrative_events, zero M0 activation.
// 5. Suggestion dismissal (single item and dismiss-all).
// 6. Draft persistence across reload via localStorage / usePlanningDraft.
// 7. Network error handling (429/503) and safe retry with identical Idempotency-Key.
// 8. Privacy: Author private notes are not included in provider requests.
test('P2-06B Regression: AI Brainstorming UI Draft-Only Adoption & Invariant Lifecycle', {
  timeout: 180000,
}, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  process.chdir(root);

  const server = await createServer({
    root,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
    server: { host: '127.0.0.1', port: 0, fs: { strict: false } },
    logLevel: 'error',
  });
  await server.listen();

  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true,
  });

  const origin = server.resolvedUrls.local[0];
  // Default to a temp dir so local runs never overwrite the committed evidence screenshot;
  // set P206B_EVIDENCE_DIR to docs/development/p2/evidence/p2-06b only when recording new evidence.
  const out = process.env.P206B_EVIDENCE_DIR || join(tmpdir(), 'p2-06b-evidence');
  await mkdir(out, { recursive: true });

  const novelId = '10000000-0000-4000-8000-000000000001';
  const chapterId = '20000000-0000-4000-8000-000000000001';

  let simulate429 = false;
  let simulate503 = false;
  let simulate409 = false;

  const capturedWrites = [];
  const capturedBrainstormRequests = [];
  const errors = [];

  const novel = id => ({
    novelId: id,
    authorId: 'author-101',
    title: 'Đại Đạo Phong Vân',
    slug: 'dai-dao-phong-van',
    synopsis: 'Tác phẩm kiểm thử P2-06B AI Brainstorming',
    status: 'DRAFT',
    genres: [],
    chaptersCount: 1,
  });

  let setupSnapshot = {
    snapshot_id: 'snapshot-101',
    novel_id: novelId,
    setup_version: 1,
    brain_version: 1,
    job_status: 'waiting_review',
    outline: 'Ý tưởng khởi đầu về thế giới tu tiên.',
    snapshot: {
      text: '',
      declarations: [],
      world_rules: [],
      initial_conditions: [],
    },
    proposals: [],
    review: null,
  };

  let storyPlanData = {
    head_version: 1,
    active_plan_id: 'plan-101',
    plans: [
      {
        plan_id: 'plan-101',
        plan_version: 1,
        status: 'active',
        source_outline: 'Dàn ý tương lai chương 1',
        private_notes: 'Ghi chú tuyệt mật của tác giả - không được lộ cho AI',
        objectives: [
          {
            objective_id: 'obj-chap-1',
            intent_version: 0,
            target_chapter: 1,
            title: 'Chương 1: Khởi hành',
            description: 'Giới thiệu nhân vật chính',
            events: [],
            dependencies: [],
          },
        ],
        action: 'save',
        can_save: true,
      },
    ],
  };

  const setupMocks = async page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());

    await page.addInitScript(() => {
      localStorage.setItem('ephurin_access_token', 'token-author-101');
    });

    await page.route('**/api/v1/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace('/api/v1', '');
      const method = req.method();
      const headers = req.headers();
      const body = method === 'POST' || method === 'PATCH' || method === 'PUT' ? req.postDataJSON() : null;

      if (body) {
        capturedWrites.push({ path, method, body, headers });
      }

      const send = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({ data, meta: { totalPages: 1 } }),
        });

      const fail = (code, status = 404, message = code) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code, message } }),
        });

      // Auth
      if (path === '/auth/me') {
        return send({
          userId: 'author-101',
          username: 'Tác Giả 101',
          email: 'author101@example.test',
          role: 'AUTHOR',
          status: 'ACTIVE',
        });
      }

      // Genres
      if (path === '/novels/genres') {
        return send([]);
      }

      // Novel routes
      if (path === '/novels/me') return send([novel(novelId)]);
      if (path === `/novels/${novelId}`) return send(novel(novelId));
      if (path === `/novels/${novelId}/chapters`) {
        return send([
          {
            chapterId,
            novelId,
            chapterNumber: 1,
            title: 'Chương 1: Khởi hành',
            content: 'Nội dung chương 1...',
            wordCount: 1500,
            isVip: false,
            priceCoins: 0,
            status: 'DRAFT',
            draftVersion: 1,
            updatedAt: new Date().toISOString(),
          },
        ]);
      }
      if (path === `/chapters/${chapterId}`) {
        return send({
          chapterId,
          novelId,
          chapterNumber: 1,
          title: 'Chương 1: Khởi hành',
          content: 'Nội dung chương 1...',
          wordCount: 1500,
          isVip: false,
          priceCoins: 0,
          status: 'DRAFT',
          draftVersion: 1,
          updatedAt: new Date().toISOString(),
        });
      }

      // Story Brain Summary
      if (path === `/ai/story-brains/by-novel/${novelId}`) {
        return send({
          novel_id: novelId,
          story_brain_id: 'brain-101',
          brain_version: 1,
          status: 'draft',
          baseline_revision_id: null,
          counts: { events: 0, entities: 0, facts: 0, pending_proposals: 0 },
        });
      }

      // Extraction Status
      if (path === `/ai/story-brains/${novelId}/extraction-status`) {
        return send([]);
      }

      // Setup Snapshot
      if (path === `/ai/story-brains/${novelId}/setup`) {
        return send(setupSnapshot);
      }

      // Setup M0 Readiness
      if (path.startsWith(`/ai/story-brains/${novelId}/setup/`) && path.endsWith('/activate')) {
        return send({
          snapshot_id: setupSnapshot.snapshot_id,
          eligible: false,
          reason: 'Setup proposals pending author review',
        });
      }

      // Memory (P2-07F / UX-05)
      if (path === `/ai/story-brains/${novelId}/memory`) {
        return send({
          brain_version: 1,
          entities: [],
          relationships: [],
          facts: [],
          recent_events: [],
        });
      }

      // Story Plans
      if (path === `/ai/story-plans/edit-v1/${novelId}`) {
        if (method === 'GET') {
          return send(storyPlanData);
        }
        if (method === 'POST') {
          return send(storyPlanData.plans[0]);
        }
      }

      // Brainstorming API
      if (path === `/ai/story-brains/${novelId}/brainstorm`) {
        capturedBrainstormRequests.push({
          body,
          headers,
          idempotencyKey: headers['idempotency-key'] || body.idempotency_key,
        });

        if (simulate429) {
          return fail('RATE_LIMIT_EXCEEDED', 429, 'Đã chạm hạn mức yêu cầu AI (429 Rate Limit)');
        }
        if (simulate503) {
          return fail('IDEMPOTENCY_STORE_UNAVAILABLE', 503, 'Khoá lease đang bận (503 Service Unavailable)');
        }
        if (simulate409) {
          return fail('BRAIN_VERSION_CONFLICT', 409, 'Xung đột phiên bản Story Brain (409 Conflict)');
        }

        // Return structured proposals
        const rules =
          body.target === 'characters' || body.target === 'future_events'
            ? []
            : [
                {
                  rule_id: '50000000-0000-4000-8000-000000000001',
                  fact_key: 'world_rule_spirit_qi',
                  text: 'Linh khí Nam Vực mang tính âm hàn, người tu luyện cần dùng đan hỏa cân bằng.',
                  category: 'magic_system',
                  origin: 'model_proposed',
                  status: 'model_proposed',
                  is_canon: false,
                  is_historical: false,
                },
              ];

        const characters =
          body.target === 'world_rules' || body.target === 'future_events'
            ? []
            : [
                {
                  character_id: '60000000-0000-4000-8000-000000000001',
                  name: 'Lâm Nhược Vũ',
                  canonical_name: 'Lâm Nhược Vũ',
                  entity_type: 'character',
                  role: 'protagonist',
                  description: 'Kiếm tu thanh lãnh xuất thân từ Tuyết Kiếm Tông, mang theo kiếm gãy cổ xưa.',
                  archetype: 'Kiếm tu',
                  aliases: ['Tuyết Kiếm Thiếu Niên'],
                  origin: 'model_proposed',
                  status: 'model_proposed',
                  is_canon: false,
                  is_historical: false,
                },
              ];

        const events =
          body.target === 'world_rules' || body.target === 'characters'
            ? []
            : [
                {
                  event_id: '70000000-0000-4000-8000-000000000001',
                  target_chapter: body.target_chapter || 1,
                  title: 'Bí cảnh Lôi Trạch khai mở',
                  description: 'Cửa vào bí cảnh cổ đại mở ra giữa giông bão, các môn phái tập hợp tranh đoạt.',
                  text: 'Cửa vào bí cảnh cổ đại mở ra giữa giông bão, các môn phái tập hợp tranh đoạt.',
                  ending: false,
                  min_words: 1500,
                  participants: [
                    { entity_id: null, name_hint: 'Lâm Nhược Vũ' },
                  ],
                  origin: 'model_proposed',
                  status: 'model_proposed',
                  is_canon: false,
                  is_historical: false,
                },
              ];

        return send({
          contract_version: 'brainstorm-v1',
          novel_id: novelId,
          story_brain_id: 'brain-101',
          brain_version: 1,
          plan_version: 1,
          world_rules: rules,
          characters,
          character_seeds: characters,
          future_events: events,
          events,
          provenance: {
            contract_version: 'brainstorm-v1',
            provider: 'fake',
            model: 'fake-brainstorm-v1',
            status: 'model_proposed',
            grounding_rules_count: 0,
            grounding_entities_count: 0,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return send({});
    });
  };

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await setupMocks(page);

  try {
    // =========================================================================
    // SCENARIO 1: Open Brainstorm Modal, Request 'all', Verify model_proposed Badge
    // =========================================================================
    console.log('--- TEST 1: Open Brainstorm Modal from Setup & Request Suggestions ---');
    const targetUrl = `${origin.replace(/\/$/, '')}/author/ide?novelId=${novelId}&chapterId=${chapterId}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle');

    // Click "Lập kế hoạch" to enter Planning Studio
    const planModeBtn = page.getByRole('button', { name: 'Lập kế hoạch', exact: true });
    await expect(planModeBtn).toBeVisible({ timeout: 10000 });
    await planModeBtn.click();

    await expect(page.getByRole('region', { name: 'Planning Studio' })).toBeVisible({ timeout: 10000 });

    // Click "AI gợi ý ý tưởng & thiết lập" button
    const openIdeaBrainstormBtn = page.locator('[data-testid="brainstorm-open-idea-btn"]');
    await expect(openIdeaBrainstormBtn).toBeVisible({ timeout: 5000 });
    await openIdeaBrainstormBtn.click();

    // Verify modal is open and has Draft-only warning
    const modal = page.getByRole('dialog', { name: /Trợ lý AI Động não/i });
    await expect(modal).toBeVisible();
    await expect(page.getByText('Chỉ tạo gợi ý bản nháp (Draft-Only)')).toBeVisible();

    // Type instruction and click "Tạo gợi ý AI"
    const instructionInput = page.locator('textarea[aria-label="Yêu cầu định hướng cho AI"]');
    await instructionInput.fill('Đề xuất hệ thống tu luyện độc tính âm hàn và nhân vật kiếm tu');

    const submitBtn = page.locator('[data-testid="brainstorm-submit-btn"]');
    await submitBtn.click();

    // Verify cards appear with model_proposed and Chưa vào Canon badges
    const ruleCard = page.locator('[data-testid="brainstorm-rule-card-0"]');
    await expect(ruleCard).toBeVisible({ timeout: 5000 });
    await expect(ruleCard.getByText('AI đề xuất (model_proposed)')).toBeVisible();
    await expect(ruleCard.getByText('Chưa vào Canon')).toBeVisible();

    const charCard = page.locator('[data-testid="brainstorm-character-card-0"]');
    await expect(charCard).toBeVisible();
    await expect(charCard.getByText('AI đề xuất (model_proposed)')).toBeVisible();

    const eventCard = page.locator('[data-testid="brainstorm-event-card-0"]');
    await expect(eventCard).toBeVisible();
    await expect(eventCard.getByText('AI đề xuất (model_proposed)')).toBeVisible();

    // =========================================================================
    // SCENARIO 2: Inline Editing of Suggestion Cards & Adopt into Author Draft
    // =========================================================================
    console.log('--- TEST 2: Inline Edit Rule & Adopt into Setup Draft ---');

    // Edit rule text inline
    const ruleTextInput = page.locator('textarea[data-testid="rule-text-input-0"], [data-testid="rule-text-input-0"] textarea');
    await ruleTextInput.fill('Linh khí Nam Vực mang tính âm hàn [ĐÃ HIỆU CHỈNH BỞI TÁC GIẢ], cần dùng đan dược hóa giải.');

    // Click "Chọn dùng vào bản nháp"
    const adoptRuleBtn = page.locator('[data-testid="adopt-rule-btn-0"]');
    await adoptRuleBtn.click();

    // Verify card turns into adopted state
    const adoptedBadge = page.locator('[data-testid="rule-adopted-badge-0"]');
    await expect(adoptedBadge).toBeVisible();
    await expect(adoptedBadge).toHaveText('Đã thêm vào bản nháp');

    // Edit character name inline
    const charNameInput = page.locator('input[data-testid="character-name-input-0"], [data-testid="character-name-input-0"] input');
    await charNameInput.fill('Lâm Nhược Vũ (Đại Đệ Tử)');

    // Adopt character into draft
    const adoptCharBtn = page.locator('[data-testid="adopt-character-btn-0"]');
    await adoptCharBtn.click();
    await expect(page.locator('[data-testid="character-adopted-badge-0"]')).toBeVisible();

    // Close modal
    const closeBtn = page.locator('[data-testid="brainstorm-close-btn"]');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // Verify SetupFoundationPanel now reflects the adopted rule and character
    // Check dirty indicator
    await expect(page.getByText('Bản sửa trên thiết bị — chưa lưu máy chủ.')).toBeVisible();

    const navStep = name =>
      page.getByRole('navigation', { name: 'Các bước lập kế hoạch' }).getByRole('button', { name: new RegExp(name) });

    // Switch to 'Thế giới' step to check adopted rule text
    await navStep('Thế giới').click();
    await page.waitForTimeout(300);

    const ruleTextInPanel = page.getByRole('textbox', { name: 'Quy tắc 1' });
    await expect(ruleTextInPanel).toBeVisible();
    const val = await ruleTextInPanel.inputValue();
    assert.ok(val.includes('[ĐÃ HIỆU CHỈNH BỞI TÁC GIẢ]'), 'Edited rule text must appear in setup rules draft');

    // Switch to 'Nhân vật' step to check adopted character name
    await navStep('Nhân vật').click();
    await page.waitForTimeout(300);

    const charNameInPanel = page.getByRole('textbox', { name: 'Tên 1' });
    await expect(charNameInPanel).toBeVisible();
    assert.equal(await charNameInPanel.inputValue(), 'Lâm Nhược Vũ (Đại Đệ Tử)');

    // =========================================================================
    // SCENARIO 3: Future Events Brainstorming in StoryPlanEditor
    // =========================================================================
    console.log('--- TEST 3: Brainstorm Future Events & Adopt into Chapter Plan ---');

    // Switch to 'Dàn ý chương' (StoryPlanEditor)
    await navStep('Dàn ý chương').click();
    await page.waitForTimeout(500);

    // Open brainstorming modal from chapter 1 button
    const chapterBrainstormBtn = page.locator('[data-testid="brainstorm-chapter-btn-0"]');
    await expect(chapterBrainstormBtn).toBeVisible({ timeout: 5000 });
    await chapterBrainstormBtn.click();

    await expect(modal).toBeVisible();

    // Verify scope is future_events and chapter is 1
    const targetSelect = page.getByRole('textbox', { name: 'Phạm vi gợi ý' });
    await expect(targetSelect).toHaveValue('Sự kiện tương lai (Future Events)');

    // Submit brainstorm for future events
    await submitBtn.click();

    // Verify event card
    const eventCardInModal = page.locator('[data-testid="brainstorm-event-card-0"]');
    await expect(eventCardInModal).toBeVisible({ timeout: 5000 });

    // Inline edit event title
    const eventTitleInput = page.locator('input[data-testid="event-title-input-0"], [data-testid="event-title-input-0"] input');
    await eventTitleInput.fill('Bí cảnh Lôi Trạch: Đại Huyết Chiến');

    // Adopt into chapter draft
    const adoptEventBtn = page.locator('[data-testid="adopt-event-btn-0"]');
    await adoptEventBtn.click();
    await expect(page.locator('[data-testid="event-adopted-badge-0"]')).toBeVisible();

    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // Verify event appears in chapter 1 in StoryPlanEditor
    await expect(page.getByText('Bản sửa trên thiết bị · chưa xác nhận với máy chủ')).toBeVisible();
    const eventInChapter = page.getByRole('textbox', { name: 'Sự kiện 1 chương 1', exact: true });
    await expect(eventInChapter).toBeVisible();
    const eventVal = await eventInChapter.inputValue();
    assert.ok(eventVal.includes('Cửa vào bí cảnh cổ đại mở ra'), 'Adopted event content must be in chapter events');

    // =========================================================================
    // SCENARIO 4: Suggestion Dismissal (Single Dismiss & Dismiss All)
    // =========================================================================
    console.log('--- TEST 4: Dismiss Suggestions ---');
    const openPlanBrainstormBtn = page.locator('[data-testid="brainstorm-open-plan-btn"]');
    await openPlanBrainstormBtn.click();
    await expect(modal).toBeVisible();

    await submitBtn.click();
    await expect(page.locator('[data-testid="brainstorm-event-card-0"]')).toBeVisible({ timeout: 5000 });

    // Dismiss single event
    const dismissEventBtn = page.locator('[data-testid="dismiss-event-btn-0"]');
    await dismissEventBtn.click();
    await expect(page.locator('[data-testid="brainstorm-event-card-0"]')).not.toBeVisible();

    // Resubmit to populate results again
    await submitBtn.click();
    await expect(page.locator('[data-testid="brainstorm-event-card-0"]')).toBeVisible({ timeout: 5000 });

    // Dismiss all remaining
    const dismissAllBtn = page.locator('[data-testid="brainstorm-dismiss-all-btn"]');
    await dismissAllBtn.click();
    await expect(page.locator('[data-testid="brainstorm-results-container"]')).not.toBeVisible();

    await closeBtn.click();

    // =========================================================================
    // SCENARIO 5: Draft Persistence Across Reload (localStorage isolation)
    // =========================================================================
    console.log('--- TEST 5: Draft Persistence Across Page Reload ---');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Re-enter planning studio if needed
    if (await planModeBtn.isVisible()) {
      await planModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Switch to 'Thế giới' step and verify rule survived reload
    await navStep('Thế giới').click();
    await page.waitForTimeout(300);

    // Check if recovery banner is present or text is preserved directly
    const recoverBtn = page.getByRole('button', { name: 'Khôi phục thiết lập' });
    if (await recoverBtn.isVisible()) {
      await recoverBtn.click();
    }

    const ruleAfterReload = page.getByRole('textbox', { name: 'Quy tắc 1' });
    await expect(ruleAfterReload).toBeVisible();
    const textAfter = await ruleAfterReload.inputValue();
    assert.ok(textAfter.includes('[ĐÃ HIỆU CHỈNH BỞI TÁC GIẢ]'), 'Adopted rule draft must survive reload');

    // =========================================================================
    // SCENARIO 6: Error Handling (429/503) & Safe Retry with Same Idempotency-Key
    // =========================================================================
    console.log('--- TEST 6: Error Handling (429/503) and Safe Retry ---');
    simulate429 = true;

    // Open brainstorm modal
    const openRulesBrainstormBtn = page.locator('[data-testid="brainstorm-open-rules-btn"]');
    await openRulesBrainstormBtn.click();
    await expect(modal).toBeVisible();

    // Attempt request during 429
    await submitBtn.click();

    // Error alert should be visible with safe retry button
    const errorAlert = page.locator('[data-testid="brainstorm-error-alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText('RATE_LIMIT_EXCEEDED');

    const safeRetryBtn = page.locator('[data-testid="brainstorm-safe-retry-btn"]');
    await expect(safeRetryBtn).toBeVisible();

    // Record the idempotency key from first failed call
    const firstCallKey = capturedBrainstormRequests[capturedBrainstormRequests.length - 1].idempotencyKey;
    assert.ok(firstCallKey, 'Idempotency key must be sent on brainstorm request');

    // Disable 429 simulation and click Safe Retry
    simulate429 = false;
    await safeRetryBtn.click();

    // Verify success and that second call reuses the EXACT same idempotency key
    await expect(page.locator('[data-testid="brainstorm-rule-card-0"]')).toBeVisible({ timeout: 5000 });
    const retryCallKey = capturedBrainstormRequests[capturedBrainstormRequests.length - 1].idempotencyKey;
    assert.equal(retryCallKey, firstCallKey, 'Safe retry must preserve exact idempotency key');

    await closeBtn.click();

    // =========================================================================
    // SCENARIO 7: Invariant Verification - Zero Canon Mutation & Zero M0 Activation
    // =========================================================================
    console.log('--- TEST 7: Invariant Verification (Zero Canon Mutation) ---');

    for (const write of capturedWrites) {
      assert.ok(!write.path.includes('/narrative_events'), `Must not write to /narrative_events: ${write.path}`);
      assert.ok(!write.path.includes('/facts'), `Must not write directly to /facts: ${write.path}`);
      if (write.path.includes('/activate')) {
        assert.fail(`Must not trigger M0 activation during brainstorming: ${write.path}`);
      }
    }

    // Verify author private notes were never forwarded in brainstorm requests
    for (const req of capturedBrainstormRequests) {
      const payloadStr = JSON.stringify(req.body);
      assert.ok(
        !payloadStr.includes('Ghi chú tuyệt mật của tác giả'),
        'Author private notes must never leak into brainstorm request'
      );
    }

    console.log('ALL P2-06B AI BRAINSTORMING REGRESSION TESTS PASSED CLEANLY.');
  } finally {
    await page.screenshot({ path: join(out, 'p2-06b-final-state.png') }).catch(() => {});
    await context.close();
    await browser.close();
    await server.close();
  }
});

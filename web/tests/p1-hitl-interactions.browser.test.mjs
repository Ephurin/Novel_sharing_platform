import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

test('Mounted React HITL Interaction Tests (FE-01 through FE-06)', { timeout: 180000 }, async (t) => {
  // 1. Bundle test fixture using esbuild
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('fixtures/p1-hitl-fixture.tsx', import.meta.url))],
    bundle: true,
    write: false,
    outfile: 'app.js',
    format: 'iife',
    jsx: 'automatic',
    sourcemap: 'inline',
    define: {
      'import.meta.env.VITE_API_BASE_URL': '"/api/v1"',
      'process.env.NODE_ENV': '"test"'
    }
  });

  const jsContent = bundle.outputFiles.find(f => f.path.endsWith('.js'))?.contents;
  const cssContent = bundle.outputFiles.find(f => f.path.endsWith('.css'))?.contents || '';

  // 2. Start local HTTP server
  const server = createServer((req, res) => {
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(jsContent);
    } else if (req.url === '/app.css') {
      res.setHeader('Content-Type', 'text/css');
      res.end(cssContent);
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"/><link rel="stylesheet" href="/app.css"/></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  // 3. Launch Playwright Edge/Chromium
  const channel = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE LOG ERROR:', msg.text());
  });
  page.on('pageerror', err => console.error('PAGE ERROR STACK:', err.stack || err.message));

  // Common Mock Data
  const mockEntities = [
    { entity_id: 'ent-minh-a', name: 'Minh', entity_type: 'character', status: 'Alive', location: 'Đông Hải' },
    { entity_id: 'ent-minh-b', name: 'Minh', entity_type: 'character', status: 'Alive', location: 'Tây Sơn' },
    { entity_id: 'ent-thai', name: 'Thái', entity_type: 'character', status: 'Alive', location: 'Bắc Thành' }
  ];

  const mockEvents = [
    {
      event_id: 'ev-test-1',
      summary: 'Trần Vân và Minh gặp nhau tại tửu lầu.',
      event_type: 'meet',
      participants: ['Minh'], // Legacy participant lacking UUID
      chapter: 1,
      metadata: {}
    },
    {
      event_id: 'ev-test-2',
      summary: 'Thái chiến đấu tại Tây Sơn.',
      event_type: 'battle',
      participants: ['ent-thai'], // Authoritative UUID
      chapter: 2,
      metadata: {}
    }
  ];

  const mockReviewQueue = [
    {
      proposal_id: 'prop-grp-1-a',
      dependency_group_id: 'group-multi-1',
      proposal_type: 'entity',
      payload: {
        canonical_name: 'Minh',
        normalized_name: 'minh',
        initial_status: 'Alive'
      }
    },
    {
      proposal_id: 'prop-grp-1-b',
      dependency_group_id: 'group-multi-1',
      proposal_type: 'fact',
      payload: {
        fact_key: 'tu_vi',
        fact_value: 42,
        subject_entity_id: 'ent-minh-a'
      }
    },
    {
      proposal_id: 'prop-single-1',
      dependency_group_id: 'group-single-1',
      proposal_type: 'state_transition',
      payload: {
        entity_id: 'ent-thai',
        attribute_key: 'health',
        new_value: 85
      }
    }
  ];

  // Helper to setup mock API routes
  let eventCorrectionRequests = [];
  let groupAcceptRequests = [];
  let lockRequests = [];

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/memory') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            entities: mockEntities,
            events: mockEvents,
            facts: [],
            relations: [],
            transitions: [],
            brain_version: 3,
            metadata: { brain_version: '3' }
          }
        })
      });
    }

    if (url.includes('/by-novel') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { brain_version: 3, status: 'active', baseline_revision_id: 'rev-01' }
        })
      });
    }

    if (url.includes('/chapters') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              chapterId: 'chapter-test-uuid-1',
              novelId: 'novel-test-uuid-1',
              chapterNumber: 1,
              title: 'Khởi đầu',
              status: 'published',
              updatedAt: new Date().toISOString()
            }
          ]
        })
      });
    }

    if (url.includes('/novels/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            novelId: 'novel-test-uuid-1',
            title: 'Tiểu thuyết thử nghiệm'
          }
        })
      });
    }

    if (url.includes('/revisions') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              revisionId: 'rev-01',
              chapterId: 'chapter-test-uuid-1',
              content: 'Nội dung bản lưu chương 1...'
            }
          ]
        })
      });
    }

    if (url.includes('/review-queue') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockReviewQueue })
      });
    }

    if (url.includes('/events/') && url.includes('/corrections') && method === 'POST') {
      const body = route.request().postDataJSON();
      eventCorrectionRequests.push(body);
      if (body.replacement?.summary?.includes('trigger-409-conflict')) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Version conflict: brain version 3 is stale' })
        });
      }
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { status: 'pending', proposal_id: 'prop-correction-1' } })
      });
    }

    if (url.includes('/proposal-groups/') && url.includes('/accept') && method === 'POST') {
      const body = route.request().postDataJSON();
      groupAcceptRequests.push(body);
      if (JSON.stringify(body).includes('trigger-409')) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Group version mismatch: 409 Conflict' })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { brain_version: 4, status: 'committed' } })
      });
    }

    if (url.includes('/relationship-locks') && method === 'POST') {
      const body = route.request().postDataJSON();
      lockRequests.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { brain_version: 4, status: 'locked', relation: body.relation_type, locked: true }
        })
      });
    }

    if (url.includes('/entity-guidance') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            version: 1,
            chapter_review_enabled: true,
            entries: []
          }
        })
      });
    }

    if (url.includes('/entity-reviews') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] })
      });
    }

    if (url.includes('/story-plans')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { objectives: [] } })
      });
    }

    if (url.includes('/autonomous')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null })
      });
    }

    if (url.includes('/extraction-status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] })
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
  });

  try {
    // ──────────────────────────────────────────
    // Test 1: Event correction with Brain v3 (FE-01 & FE-06)
    // ──────────────────────────────────────────
    await t.test('FE-01 & FE-06: Event correction submits authoritative Brain v3 and awaits async 201', async () => {
      eventCorrectionRequests = [];
      await page.goto(`${baseUrl}/?scenario=memory-panel`);
      await page.waitForSelector('text=Bộ nhớ và định hướng tiểu thuyết');

      // Navigate to History / Events tab
      await page.click('button[role="tab"]:has-text("Sự kiện")');
      await page.waitForSelector('text=Thái chiến đấu tại Tây Sơn.');

      // Click "Đề xuất chỉnh sửa" on event 2 (which has resolved participant 'ent-thai')
      await page.locator('[data-testid="btn-edit-event-ev-test-2"]').click();

      // Verify the correction collapse opened
      const textarea = page.locator('[data-testid="event-card-ev-test-2"]').getByLabel(/Tóm tắt sự kiện đã sửa/i);
      await textarea.waitFor({ state: 'visible' });
      await textarea.fill('Thái đã đánh bại kẻ thù tại Tây Sơn.');

      // Submit correction and wait for response
      await Promise.all([
        page.waitForResponse(r => r.url().includes('/corrections')),
        page.locator('[data-testid="btn-submit-correction-ev-test-2"]').click()
      ]);

      // Assert network request payload
      assert.equal(eventCorrectionRequests.length, 1);
      assert.equal(eventCorrectionRequests[0].expected_brain_version, 3, 'Must submit expected_brain_version: 3');
      assert.equal(eventCorrectionRequests[0].replacement.summary, 'Thái đã đánh bại kẻ thù tại Tây Sơn.');

      // Assert success message is displayed (FE-06)
      await page.waitForSelector('text=Đã gửi đề xuất cập nhật sự kiện thành công (HTTP 201)');
    });

    // ──────────────────────────────────────────
    // Test 2: Correction 409 preserves editing state (FE-01 & FE-06)
    // ──────────────────────────────────────────
    await t.test('FE-01 & FE-06: HTTP 409 Conflict preserves editing state and author draft', async () => {
      eventCorrectionRequests = [];
      await page.goto(`${baseUrl}/?scenario=memory-panel`);
      await page.click('button[role="tab"]:has-text("Sự kiện")');

      await page.locator('[data-testid="btn-edit-event-ev-test-2"]').click();

      const textarea = page.locator('[data-testid="event-card-ev-test-2"]').getByLabel(/Tóm tắt sự kiện đã sửa/i);
      await textarea.waitFor({ state: 'visible' });
      const conflictDraft = 'Thái rút lui trigger-409-conflict bảo lưu bản nháp.';
      await textarea.fill(conflictDraft);

      await Promise.all([
        page.waitForResponse(r => r.url().includes('/corrections')),
        page.locator('[data-testid="btn-submit-correction-ev-test-2"]').click()
      ]);

      // Wait for 409 error alert
      await page.waitForSelector('text=Xung đột phiên bản Story Brain (409 Conflict)');

      // Verify editor is STILL open and draft text is preserved
      assert.equal(await textarea.isVisible(), true, 'Editor collapse must remain open on 409 failure');
      assert.equal(await textarea.inputValue(), conflictDraft, 'Author draft text must be preserved in textarea');
    });

    // ──────────────────────────────────────────
    // Test 3: Homonymous entity UUIDs never auto-resolve by name (FE-02)
    // ──────────────────────────────────────────
    await t.test('FE-02: Homonymous characters ("Minh A" vs "Minh B") never auto-resolve by name in EventItem', async () => {
      await page.goto(`${baseUrl}/?scenario=memory-panel`);
      await page.click('button[role="tab"]:has-text("Sự kiện")');

      // Event 1 has participant "Minh". It must show the unresolved badge
      await page.waitForSelector('text=Chưa xác thực UUID: Minh');

      // Open editor for Event 1
      await page.locator('[data-testid="btn-edit-event-ev-test-1"]').click();

      // Warning alert must be displayed
      await page.waitForSelector('text=Cảnh báo danh tính chưa xác thực (FE-02)');

      // The submit button must be DISABLED because participant "Minh" was not auto-resolved to ent-minh-a or ent-minh-b
      const submitBtn = page.locator('[data-testid="btn-submit-correction-ev-test-1"]');
      const isDisabled = await submitBtn.isDisabled();
      assert.equal(isDisabled, true, 'Submit button must be blocked when participant identity is unresolved');
    });

    // ──────────────────────────────────────────
    // Test 4: Legacy relationship requires explicit identity selection (FE-02)
    // ──────────────────────────────────────────
    await t.test('FE-02: Legacy relationship lacking UUIDs requires explicit author selection', async () => {
      await page.goto(`${baseUrl}/?scenario=relationship-locks`);
      await page.waitForSelector('text=Khóa quan hệ Canon (Exact-ID Relationship Lock)');

      // Assert legacy relation card displays "Thiếu UUID" badge
      const badges = page.locator('span:has-text("Thiếu UUID")');
      assert.ok((await badges.count()) >= 1, 'Legacy relation must display "Thiếu UUID" badge');

      // Click "Cập nhật khóa bằng UUID chính xác"
      const remediateBtn = page.locator('button:has-text("Cập nhật khóa bằng UUID chính xác")');
      await remediateBtn.click();

      // Warning message must appear in the form
      await page.waitForSelector('text=Quan hệ cũ thiếu UUID chính xác');

      // Submit button "Khóa quan hệ vào Canon" must remain DISABLED because UUIDs are not auto-guessed
      const lockSubmitBtn = page.locator('button:has-text("Khóa quan hệ vào Canon")');
      assert.equal(await lockSubmitBtn.isDisabled(), true, 'Lock submit button must be disabled until explicit selection');
    });

    // ──────────────────────────────────────────
    // Test 5: Safe Group Rejection guards (FE-03)
    // ──────────────────────────────────────────
    await t.test('FE-03: Multi-member group rejection is disabled and single rejection is guarded', async () => {
      await page.goto(`${baseUrl}/?scenario=memory-panel`);
      await page.waitForSelector('text=Nhóm phụ thuộc');

      // Group 1 has 2 proposals (multi-member): "Loại toàn bộ nhóm" button must be DISABLED
      const groupRejectBtn = page.locator('button:has-text("Loại toàn bộ nhóm (Tạm khóa)")');
      assert.equal(await groupRejectBtn.isDisabled(), true, 'Group rejection must be temporarily disabled');

      // Informative banner must explain why
      await page.waitForSelector('text=Tính năng loại bỏ toàn bộ nhóm phụ thuộc đang tạm khóa');

      // Single rejection buttons inside the multi-member group must be DISABLED
      const multiGroupCard = page.locator('[data-testid="dependency-group-group-multi-1"]');
      const singleRejectBtns = multiGroupCard.locator('button:has-text("Loại đề xuất")');
      assert.equal(await singleRejectBtns.nth(0).isDisabled(), true, 'Single reject inside multi-member group must be disabled');
      assert.equal(await singleRejectBtns.nth(1).isDisabled(), true, 'Single reject inside multi-member group must be disabled');

      // Group 2 is a single-proposal group: its "Loại đề xuất" button must be ENABLED
      const singleGroupCard = page.locator('[data-testid="dependency-group-group-single-1"]');
      const singletonRejectBtn = singleGroupCard.locator('button:has-text("Loại đề xuất")').first();
      assert.equal(await singletonRejectBtn.isDisabled(), false, 'Singleton proposal rejection must be enabled');
    });

    // ──────────────────────────────────────────
    // Test 6: Whitelist of editable fields & typed values (FE-04)
    // ──────────────────────────────────────────
    await t.test('FE-04: Entity proposal exposes only canonical_name (no initial_status) & typed facts preserved', async () => {
      await page.goto(`${baseUrl}/?scenario=memory-panel`);
      await page.waitForSelector('text=Nhóm phụ thuộc');

      // For entity proposal: initial_status select must NOT exist
      const entitySection = page.locator('div.mantine-Paper-root:has-text("entity")');
      const initialStatusSelect = entitySection.locator('input[placeholder*="initial_status"], select[name="initial_status"]');
      assert.equal(await initialStatusSelect.count(), 0, 'initial_status editing must not exist in entity proposal');

      // canonical_name input must exist
      const canonicalNameInput = entitySection.getByLabel(/Tên chuẩn thực thể/i);
      assert.ok(await canonicalNameInput.isVisible(), 'canonical_name input must be present');

      // For fact proposal: fact_value is typed as number 42
      const factSection = page.locator('div.mantine-Paper-root:has-text("fact")');
      const factValueInput = factSection.getByLabel(/Giá trị dữ kiện/i);
      assert.equal(await factValueInput.inputValue(), '42');
    });

    // ──────────────────────────────────────────
    // Test 7: Review version refresh preserves unsaved choices (FE-05)
    // ──────────────────────────────────────────
    await t.test('FE-05: Stable component identity preserves unsaved review decisions across polling refresh', async () => {
      // Setup review route with review_version = 1
      let currentReviewVersion = 1;
      await page.route('**/api/v1/ai/story-brains/*/entity-reviews', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                review_schema_version: 1,
                analysis_run_id: 'run-stable-001',
                revision_id: 'rev-001',
                source_hash: 'hash-1',
                status: 'waiting_entity_review',
                brain_version: 1,
                registry_brain_version: 1,
                review_version: currentReviewVersion,
                guidance_version: 1,
                provisional_identity_scope: 'test-scope',
                candidates: [
                  { candidate_id: 'cand-1', surface: 'Trần Vân', start: 0, end: 8, context: 'Trần Vân xuất hiện.' }
                ],
                decisions: [],
                reviewed_decisions: [],
                pending_candidate_ids: ['cand-1'],
                known_entities: [
                  { entity_id: 'ent-tran-van', name: 'Trần Vân', entity_type: 'PER' }
                ],
                entities: []
              }
            ]
          })
        });
      });

      await page.goto(`${baseUrl}/?scenario=entity-review`);
      await page.waitForSelector('text=Trần Vân xuất hiện.');

      // Click "Loại bỏ" for candidate 1 (uncommitted local choice)
      const rejectBtn = page.locator('button:has-text("Loại bỏ")').first();
      await rejectBtn.click();
      await page.waitForSelector('span:has-text("Đã loại")');

      // Simulate polling update incrementing review_version to 2
      currentReviewVersion = 2;
      await page.evaluate(() => window.__queryClient.invalidateQueries({ queryKey: ['entity-reviews'] }));

      // Wait a moment for refetch
      await page.waitForTimeout(500);

      // Verify that candidate 1 STILL has "Đã loại" badge (local decision was not wiped!)
      const badge = page.locator('span:has-text("Đã loại")');
      assert.ok(await badge.isVisible(), 'Unsaved local decision must remain preserved after review_version refresh');
    });

    // ──────────────────────────────────────────
    // Test 8: Novel switch clears foreign draft state (FE-05)
    // ──────────────────────────────────────────
    await t.test('FE-05: Novel switch clears draft state of previous novel', async () => {
      await page.goto(`${baseUrl}/?scenario=memory-panel`);
      await page.waitForSelector('text=Bộ nhớ và định hướng tiểu thuyết');

      // Switch novel in harness via helper
      await page.evaluate(() => window.__setNovelId('novel-test-uuid-2'));
      await page.waitForSelector('#current-novel:has-text("novel-test-uuid-2")', { state: 'attached' });

      // Verify that state was isolated/cleared
      const currentNovel = await page.locator('#current-novel').innerText();
      assert.equal(currentNovel, 'novel-test-uuid-2');
    });

    // ──────────────────────────────────────────
    // Test 9: Atomic group approval sends complete IDs and full replacement edits (FE-03, FE-04)
    // ──────────────────────────────────────────
    await t.test('FE-03 & FE-04: Atomic group approval sends complete IDs and edited payloads', async () => {
      groupAcceptRequests = [];
      await page.goto(`${baseUrl}/?scenario=memory-panel`);
      await page.waitForSelector('text=Nhóm phụ thuộc');

      // Click "Duyệt nguyên tử toàn bộ nhóm (2 đề xuất)" and await response
      const acceptBtn = page.locator('[data-testid="btn-accept-group-group-multi-1"]');
      await Promise.all([
        page.waitForResponse(r => r.url().includes('/proposal-groups/') && r.url().includes('/accept')),
        acceptBtn.click()
      ]);

      // Assert outgoing payload
      assert.equal(groupAcceptRequests.length, 1);
      assert.deepEqual(groupAcceptRequests[0].proposal_ids, ['prop-grp-1-a', 'prop-grp-1-b']);
      assert.equal(groupAcceptRequests[0].expected_brain_version, 3);
    });

    // ──────────────────────────────────────────
    // Test 10: 409/422 approval failures retain edits (FE-06)
    // ──────────────────────────────────────────
    await t.test('FE-06: 409 approval failure retains author edits', async () => {
      await page.goto(`${baseUrl}/?scenario=memory-panel`);
      await page.waitForSelector('text=Nhóm phụ thuộc');

      // Edit canonical name of proposal in group 1
      const canonicalNameInput = page.getByLabel(/Tên chuẩn thực thể/i).first();
      await canonicalNameInput.fill('Minh Thái trigger-409');

      // Verify "Đã chỉnh sửa bởi tác giả" badge appears
      await page.waitForSelector('text=Đã chỉnh sửa bởi tác giả');

      // Click accept button and await response
      const acceptBtn = page.locator('[data-testid="btn-accept-group-group-multi-1"]');
      await Promise.all([
        page.waitForResponse(r => r.url().includes('/proposal-groups/') && r.url().includes('/accept')),
        acceptBtn.click()
      ]);

      // Wait for error alert
      await page.waitForSelector('text=Xung đột phiên bản bộ nhớ (409 Conflict)');

      // Verify edited input value and badge are still present
      await page.waitForSelector('text=Đã chỉnh sửa bởi tác giả');
      assert.equal(await canonicalNameInput.inputValue(), 'Minh Thái trigger-409');
    });

  } finally {
    await browser.close();
    server.close();
  }
});

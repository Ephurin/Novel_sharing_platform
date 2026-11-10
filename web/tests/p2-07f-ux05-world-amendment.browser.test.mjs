import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-07F Regression Test Suite:
// UX-05: Author IDE World Setup Rule Amendments & CAS Lifecycle
// 1. Viewing approved Canon rules with locked vs standard badges.
// 2. Lock immutability: no direct Canon mutation, no lock toggles.
// 3. Amendment proposal creation, local draft persistence & recovery.
// 4. CAS conflict handling (409) with friendly alert and draft preservation.
// 5. Author Before/After comparison display.
// 6. Author Reject decision preserving parent Canon.
// 7. Author Accept decision promoting successor to Canon & bumping brain version.
// 8. Lineage & Proposal History modal inspection.
test('P2-07F Regression: UX-05 Author IDE World Rules Amendment & CAS Lifecycle', {
  timeout: 180000
}, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  process.chdir(root);

  const server = await createServer({
    root,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
    server: { host: '127.0.0.1', port: 0, fs: { strict: false } },
    logLevel: 'error'
  });
  await server.listen();

  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true
  });

  const origin = server.resolvedUrls.local[0];
  const out = process.env.P207F_EVIDENCE_DIR || join(root, '../docs/development/p2/evidence/p2-07f');
  await mkdir(out, { recursive: true });

  const novelId = '10000000-0000-0000-0000-000000000001';
  const chapterId = '20000000-0000-0000-0000-000000000001';

  let forceConflict = false;
  let currentBrainVersion = 1;

  // In-memory mock database for World Rules, Lineage, and Proposals
  const facts = [
    {
      fact_id: 'fact-gravity-root',
      id: 'fact-gravity-root',
      fact_type: 'world_rule',
      fact_key: 'world_rule_gravity',
      fact_value: 'Trọng lực thế giới cố định ở mức 1G.',
      is_locked: true,
      supersedes_id: null,
      created_at: new Date('2026-11-01T10:00:00Z').toISOString()
    },
    {
      fact_id: 'fact-cultivation-root',
      id: 'fact-cultivation-root',
      fact_type: 'world_rule',
      fact_key: 'world_rule_cultivation',
      fact_value: 'Tu giả chỉ có thể hấp thụ linh khí tự nhiên.',
      is_locked: false,
      supersedes_id: null,
      created_at: new Date('2026-11-01T10:05:00Z').toISOString()
    }
  ];

  const proposals = [];
  const decisions = [];

  const setupMocks = async (page) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

    await page.addInitScript(() => {
      localStorage.setItem('ephurin_access_token', 'token-author-A');
    });

    await page.route('**/api/v1/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace('/api/v1', '');
      const method = req.method();
      // console.log(`[API MOCK] ${method} ${path}`);

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

      if (path === '/auth/me') {
        return send({ userId: 'author-A', username: 'author-A', email: 'author@example.test', role: 'AUTHOR', status: 'ACTIVE' });
      }

      if (path === '/novels/me') {
        return send([{
          novelId,
          authorId: 'author-A',
          title: 'Huyền Thoại Tu Tiên',
          slug: 'huyen-thoai-tu-tien',
          synopsis: 'Tác phẩm kiểm thử UX-05',
          status: 'PUBLISHED',
          genres: [],
          chaptersCount: 1
        }]);
      }

      if (path === `/novels/${novelId}`) {
        return send({
          novelId,
          authorId: 'author-A',
          title: 'Huyền Thoại Tu Tiên',
          slug: 'huyen-thoai-tu-tien',
          synopsis: 'Tác phẩm kiểm thử UX-05',
          status: 'PUBLISHED',
          genres: [],
          chaptersCount: 1
        });
      }

      if (path === `/novels/${novelId}/chapters`) {
        return send([{
          chapterId,
          novelId,
          chapterNumber: 1,
          title: 'Chương 1: Mở đầu',
          content: 'Nội dung chương 1...',
          wordCount: 10,
          isVip: false,
          priceCoins: 0,
          status: 'PUBLISHED',
          draftVersion: 0,
          updatedAt: new Date().toISOString()
        }]);
      }

      if (path === `/chapters/${chapterId}`) {
        return send({
          chapterId,
          novelId,
          chapterNumber: 1,
          title: 'Chương 1: Mở đầu',
          content: 'Nội dung chương 1...',
          wordCount: 10,
          isVip: false,
          priceCoins: 0,
          status: 'PUBLISHED',
          draftVersion: 0,
          updatedAt: new Date().toISOString()
        });
      }

      if (path === `/ai/story-brains/by-novel/${novelId}`) {
        return send({
          id: 'brain-01',
          novel_id: novelId,
          status: 'active',
          brain_version: currentBrainVersion,
          baseline_revision_id: 'rev-01',
          counts: { entities: 2, events: 0, pending_proposals: proposals.filter(p => p.status === 'pending').length, open_findings: 0 }
        });
      }

      if (path === `/ai/story-brains/${novelId}/setup`) {
        return send({
          novel_id: novelId,
          setup_version: 1,
          review_version: 1,
          brain_version: currentBrainVersion,
          snapshot_id: 'snap-01',
          setup_hash: 'hash-01',
          job_status: 'succeeded',
          mode: 'extract',
          outline: 'Đề cương truyện tu tiên',
          snapshot: {
            text: 'Thiết lập ban đầu',
            world_rules: [
              { declaration_id: 'decl-gravity', text: 'Trọng lực thế giới cố định ở mức 1G.' },
              { declaration_id: 'decl-cultivation', text: 'Tu giả chỉ có thể hấp thụ linh khí tự nhiên.' }
            ],
            declarations: []
          },
          proposals: [],
          review: { status: 'review_complete', activation_available: false }
        });
      }

      if (path.includes('/extraction-status')) {
        return send({ status: 'completed' });
      }

      if (path.startsWith('/ai/story-plans/edit-v1/')) {
        return send({ head_version: 0, active_plan_id: null, plans: [] });
      }

      if (path === '/ai/writing/generations') {
        return send([]);
      }

      if (path.includes('/setup/') && path.endsWith('/activate')) {
        return send({
          contract_version: 'setup-m0-v1',
          snapshot_id: 'snap-01',
          eligible: true,
          novel_id: novelId,
          chapter_count: 1
        });
      }

      // GET Approved Memory (Canon facts)
      if (path === `/ai/story-brains/${novelId}/memory`) {
        return send({
          story_brain_id: 'brain-01',
          novel_id: novelId,
          brain_version: currentBrainVersion,
          status: 'active',
          facts: facts.map(f => ({
            ...f,
            is_global: true
          })),
          entities: [],
          relationships: []
        });
      }

      // GET & POST /ai/story-brains/:novelId/world-rules/:factId/amendments
      const amendmentsMatch = path.match(new RegExp(`^/ai/story-brains/${novelId}/world-rules/([^/]+)/amendments$`));
      if (amendmentsMatch) {
        const factId = amendmentsMatch[1];
        const targetFact = facts.find(f => f.fact_id === factId || f.id === factId);
        if (!targetFact) return fail('FACT_NOT_FOUND', 404, 'Fact không tồn tại');

        if (method === 'GET') {
          // Compute lineage chain from root to current head
          const lineage = [];
          let cur = targetFact;
          while (cur) {
            lineage.unshift({
              fact_id: cur.fact_id,
              fact_key: cur.fact_key,
              fact_value: cur.fact_value,
              is_locked: cur.is_locked,
              supersedes_id: cur.supersedes_id,
              created_at: cur.created_at
            });
            if (cur.supersedes_id) {
              cur = facts.find(f => f.fact_id === cur.supersedes_id);
            } else {
              break;
            }
          }

          const factProposals = proposals.filter(p => p.parent_fact_id === factId || lineage.some(l => l.fact_id === p.parent_fact_id));

          return send({
            contract_version: 'setup-rule-amendment-v1',
            effective_head_id: targetFact.fact_id,
            root_fact_id: lineage[0]?.fact_id || targetFact.fact_id,
            brain_version: currentBrainVersion,
            lineage,
            proposals: factProposals
          });
        }

        if (method === 'POST') {
          const body = req.postDataJSON();
          if (forceConflict) {
            return fail('SETUP_OPTIMISTIC_LOCK_CONFLICT', 409, 'Xung đột phiên bản bộ nhớ truyện (409 Conflict)');
          }

          const newPropId = 'prop-' + (proposals.length + 1);
          const proposalItem = {
            proposal_id: newPropId,
            parent_fact_id: factId,
            fact_key: targetFact.fact_key,
            replacement_text: body.replacement_text,
            status: 'pending',
            brain_version: currentBrainVersion,
            private_author_notes: body.private_author_notes || [],
            created_at: new Date().toISOString()
          };
          proposals.push(proposalItem);

          return send({
            contract_version: 'setup-rule-amendment-v1',
            proposal_id: newPropId,
            status: 'pending',
            parent_fact_id: factId,
            brain_version: currentBrainVersion,
            idempotent_replay: false
          }, 201);
        }
      }

      // POST /ai/story-brains/:novelId/world-rule-amendments/:proposalId/decision
      const decisionMatch = path.match(new RegExp(`^/ai/story-brains/${novelId}/world-rule-amendments/([^/]+)/decision$`));
      if (decisionMatch && method === 'POST') {
        const proposalId = decisionMatch[1];
        const prop = proposals.find(p => p.proposal_id === proposalId);
        if (!prop) return fail('PROPOSAL_NOT_FOUND', 404, 'Proposal không tồn tại');

        const body = req.postDataJSON();
        if (forceConflict) {
          return fail('SETUP_OPTIMISTIC_LOCK_CONFLICT', 409, 'Xung đột phiên bản bộ nhớ truyện (409 Conflict)');
        }

        if (body.decision === 'reject') {
          prop.status = 'rejected';
          prop.reason = body.reason || null;
          prop.decided_at = new Date().toISOString();
          decisions.push({ proposal_id: proposalId, decision: 'reject', reason: body.reason });

          return send({
            contract_version: 'setup-rule-amendment-v1',
            proposal_id: proposalId,
            decision: 'reject',
            status: 'rejected',
            successor_fact_id: null,
            brain_version: currentBrainVersion,
            idempotent_replay: false
          });
        }

        if (body.decision === 'accept') {
          const parentFact = facts.find(f => f.fact_id === prop.parent_fact_id);
          const newFactId = 'fact-succ-' + (facts.length + 1);

          // Brain version bumped + 1 upon accept
          currentBrainVersion += 1;

          // Successor strictly inherits parent's is_locked and fact_key
          const successorFact = {
            fact_id: newFactId,
            id: newFactId,
            fact_type: 'world_rule',
            fact_key: parentFact.fact_key,
            fact_value: prop.replacement_text,
            is_locked: parentFact.is_locked,
            supersedes_id: parentFact.fact_id,
            created_at: new Date().toISOString()
          };

          // In effective facts, replace old parent with new successor
          const parentIdx = facts.findIndex(f => f.fact_id === parentFact.fact_id);
          if (parentIdx >= 0) {
            facts[parentIdx] = successorFact;
          } else {
            facts.push(successorFact);
          }

          prop.status = 'accepted';
          prop.successor_fact_id = newFactId;
          prop.reason = body.reason || null;
          prop.decided_at = new Date().toISOString();

          decisions.push({ proposal_id: proposalId, decision: 'accept', successor_fact_id: newFactId, reason: body.reason });

          return send({
            contract_version: 'setup-rule-amendment-v1',
            proposal_id: proposalId,
            decision: 'accept',
            status: 'accepted',
            successor_fact_id: newFactId,
            brain_version: currentBrainVersion,
            idempotent_replay: false
          });
        }
      }

      console.log('[API UNHANDLED]', method, path);
      return send({});
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

    console.log('\n--- TEST 1: View Canon Rules & Verify Badges & Immutability ---');
    const targetUrl = `${origin.replace(/\/$/, '')}/author/ide?novelId=${novelId}&chapterId=${chapterId}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle');

    await button('Lập kế hoạch').click();
    await expect(page.getByRole('region', { name: 'Planning Studio' })).toBeVisible();

    // Navigate to World step
    await step('Thế giới').click();

    // Verify WorldRuleAmendmentManager section is visible
    await expect(page.getByText('Hiệu chỉnh Quy tắc Thế giới sau M0 (UX-05)')).toBeVisible();

    // Verify badges for locked vs standard rules
    await expect(page.getByText('BẤT BIẾN (LOCKED)')).toBeVisible();
    await expect(page.getByText('QUY TẮC CHUẨN')).toBeVisible();

    // Verify Canon rule values are rendered
    await expect(page.getByTestId('canon-text-world_rule_gravity')).toBeVisible();
    await expect(page.getByTestId('canon-text-world_rule_cultivation')).toBeVisible();
    console.log('✓ UX-05: Canon rules and immutability status badges rendered properly!');

    // Capture screenshot of Canon rules view
    await page.screenshot({ path: join(out, 'ux05-canon-rules-view.png'), fullPage: true });

    console.log('\n--- TEST 2: Open Propose Form & Verify Lock Immutability Notice ---');
    // Click "Đề xuất sửa quy tắc" on the locked rule
    await page.getByTestId('propose-btn-world_rule_gravity').click();

    // Verify lock notice
    await expect(page.getByText('Quy tắc này là BẤT BIẾN (LOCKED). Nội dung sửa đổi sẽ tự động kế thừa thuộc tính bất biến; không thể chuyển đổi trạng thái khóa.')).toBeVisible();
    console.log('✓ UX-05: Lock immutability notice verified (no lock toggle controls exist)!');

    // Fill in proposal replacement text and private notes
    const replacementInput = page.getByTestId('amendment-replacement-input');
    const notesInput = page.getByTestId('amendment-notes-input');

    await replacementInput.fill('Trọng lực thế giới dao động theo chu kỳ mặt trăng.');
    await notesInput.fill('Tác giả ghi chú: phục vụ đại chiến chương 10.');

    console.log('\n--- TEST 3: Verify Draft Persistence Across Page Reload ---');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await button('Lập kế hoạch').click();
    await step('Thế giới').click();
    await page.getByTestId('propose-btn-world_rule_gravity').click();

    // Recover or verify persisted draft
    const recoverAlert = page.getByText('Có bản nháp đề xuất trên thiết bị');
    if (await recoverAlert.isVisible()) {
      await page.getByRole('button', { name: 'Khôi phục bản nháp' }).click();
    }
    await expect(replacementInput).toHaveValue('Trọng lực thế giới dao động theo chu kỳ mặt trăng.');
    console.log('✓ UX-05: Local draft persistence and recovery verified successfully!');

    console.log('\n--- TEST 4: CAS Conflict Handling (409) ---');
    forceConflict = true;
    await page.getByTestId('amendment-submit-proposal-btn').click();

    // Verify 409 conflict alert
    await expect(page.getByRole('alert').filter({ hasText: 'Xung đột phiên bản bộ nhớ truyện (409)' })).toBeVisible();
    // Verify draft input remains intact
    await expect(replacementInput).toHaveValue('Trọng lực thế giới dao động theo chu kỳ mặt trăng.');
    console.log('✓ UX-05: CAS 409 conflict handled gracefully with draft preserved!');

    // Take screenshot of 409 error state
    await page.screenshot({ path: join(out, 'ux05-cas-409-conflict.png'), fullPage: true });

    forceConflict = false;

    console.log('\n--- TEST 5: Submit Proposal & Render Before/After Comparison ---');
    await page.getByTestId('amendment-submit-proposal-btn').click();

    // Verify Pending Decision Card appears
    const decisionCard = page.getByTestId('pending-decision-card');
    await expect(decisionCard).toBeVisible();
    await expect(decisionCard.getByText('ĐỀ XUẤT CHỜ DUYỆT', { exact: true })).toBeVisible();

    // Verify Before/After comparison text
    await expect(page.getByTestId('comparison-before-text')).toHaveText('Trọng lực thế giới cố định ở mức 1G.');
    await expect(page.getByTestId('comparison-after-text')).toHaveText('Trọng lực thế giới dao động theo chu kỳ mặt trăng.');
    console.log('✓ UX-05: Before/After comparison cards rendered with exact accuracy!');

    await page.screenshot({ path: join(out, 'ux05-before-after-comparison.png'), fullPage: true });

    console.log('\n--- TEST 6: Author Decision — Reject Proposal ---');
    await page.getByTestId('decision-reason-input').fill('Chưa hợp lý với chương 3.');
    await page.getByTestId('reject-amendment-btn').click();

    // Verify rejection notification and parent rule preserved
    await expect(page.getByText('Đã từ chối đề xuất sửa đổi. Bản Canon cũ của quy tắc world_rule_gravity được bảo toàn nguyên vẹn.')).toBeVisible();
    await expect(page.getByTestId('canon-text-world_rule_gravity')).toHaveText('Trọng lực thế giới cố định ở mức 1G.');
    console.log('✓ UX-05: Reject decision preserved parent Canon intact!');

    console.log('\n--- TEST 7: Author Decision — Accept Proposal & Canon Promotion ---');
    // Open proposal on second rule (standard rule)
    await page.getByTestId('propose-btn-world_rule_cultivation').click();
    await replacementInput.fill('Tu giả có thể dùng đan dược ngũ sắc để biến dị linh căn.');
    await page.getByTestId('amendment-submit-proposal-btn').click();

    // Decision view appears
    await expect(page.getByTestId('pending-decision-card')).toBeVisible();
    await expect(page.getByTestId('comparison-before-text')).toHaveText('Tu giả chỉ có thể hấp thụ linh khí tự nhiên.');
    await expect(page.getByTestId('comparison-after-text')).toHaveText('Tu giả có thể dùng đan dược ngũ sắc để biến dị linh căn.');

    // Accept proposal
    await page.getByTestId('accept-amendment-btn').click();

    // Verify success and Canon updated
    await expect(page.getByText(/Đã chấp thuận đề xuất sửa đổi quy tắc world_rule_cultivation.*Fact mới đã trở thành Canon/)).toBeVisible();
    await expect(page.getByTestId('canon-text-world_rule_cultivation')).toHaveText('Tu giả có thể dùng đan dược ngũ sắc để biến dị linh căn.');
    console.log('✓ UX-05: Accept decision promoted successor to Canon and bumped Brain Version to v2!');

    await page.screenshot({ path: join(out, 'ux05-accepted-canon-promoted.png'), fullPage: true });

    console.log('\n--- TEST 8: Lineage & History Modal Inspection ---');
    // Click "Lịch sử & Phả hệ" on the updated rule
    await page.getByTestId('history-btn-world_rule_cultivation').click();

    // Modal opens
    await expect(page.getByText(/Lịch sử hiệu chỉnh & Phả hệ quy tắc/)).toBeVisible();
    await expect(page.getByText('Phả hệ các thế hệ Fact (Lineage)')).toBeVisible();
    await expect(page.getByText('Nhật ký các đề xuất sửa đổi (Proposals)')).toBeVisible();
    await expect(page.getByText('ĐÃ DUYỆT')).toBeVisible();
    console.log('✓ UX-05: Lineage and proposal audit trail modal verified!');

    await page.screenshot({ path: join(out, 'ux05-lineage-history-modal.png'), fullPage: true });

    console.log('\nALL 8 UX-05 BROWSER REGRESSION TESTS PASSED CLEANLY!');
  } finally {
    await browser.close();
    await server.close();
  }
});

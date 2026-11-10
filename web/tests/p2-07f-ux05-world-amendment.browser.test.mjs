import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-07F Regression Test Suite (Updated for GPT-6 UXF-01, UXF-02, UXF-03 Review):
// 1. UXF-03: Pre-M0 guard prevents amendments; automatic sync to active M0 & new Brain version without manual reload.
// 2. UXF-01: Pending proposals bound strictly by Fact UUID (not fact_key).
//    - Two distinct setup roots sharing same fact_key ('world_rule_gravity') remain completely isolated.
//    - Proposal on Root A does NOT appear on Root B; Root B retains independent propose/decision lifecycle.
//    - Non-setup P1 rule (no M0 provenance) renders as read-only with no propose/edit action.
// 3. UXF-02: Fingerprint-bound CAS & Idempotency:
//    - Changing payload generates new key, avoiding AMENDMENT_IDEMPOTENCY_CONFLICT.
//    - 409 CAS conflict provides actionable rebase preserving 100% author draft text.
//    - 503 / uncertain network response provides server reconciliation and safe retry.
// 4. Author Accept / Reject decision lifecycle with append-only lineage tracking.
// 5. Lineage & Proposal History modal inspection.
test('P2-07F Regression: UXF-01/02/03 Author IDE World Rules Amendment Lifecycle', {
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

  // Standard UUIDs for entities (strict compliance with review)
  const novelId = '10000000-0000-4000-8000-000000000001';
  const chapterId = '20000000-0000-4000-8000-000000000001';

  // Two distinct World Setup facts SHARING THE SAME fact_key (UXF-01 test condition)
  const factGravityA = '30000000-0000-4000-8000-000000000001';
  const factGravityB = '30000000-0000-4000-8000-000000000002';
  // Non-setup P1 fact (lacks M0 setup provenance) (UXF-01 test condition)
  const factP1Unrelated = '30000000-0000-4000-8000-000000000003';

  let m0Activated = false;
  let currentBrainVersion = 1;
  let force409OnPropose = false;
  let force503OnPropose = false;
  let force503OnMemoryGet = false;
  let force503OnHistoryGet = false;
  let force503OnDecision = false;

  // Stateful server simulation enforcing real P2-07E invariants
  const factsDb = [
    {
      fact_id: factGravityA,
      id: factGravityA,
      fact_type: 'world_rule',
      fact_key: 'world_rule_gravity',
      fact_value: 'Trọng lực đại lục Nam Cực: 1.0G.',
      is_locked: true,
      supersedes_id: null,
      created_at: '2026-11-01T10:00:00Z',
      is_setup_m0: true
    },
    {
      fact_id: factGravityB,
      id: factGravityB,
      fact_type: 'world_rule',
      fact_key: 'world_rule_gravity', // Same key, different root!
      fact_value: 'Trọng lực hư không Bắc Minh: 0.5G.',
      is_locked: false,
      supersedes_id: null,
      created_at: '2026-11-01T10:05:00Z',
      is_setup_m0: true
    },
    {
      fact_id: factP1Unrelated,
      id: factP1Unrelated,
      fact_type: 'world_rule',
      fact_key: 'world_rule_p1_unrelated',
      fact_value: 'Quy tắc chương riêng của P1 (không thuộc setup M0).',
      is_locked: false,
      supersedes_id: null,
      created_at: '2026-11-01T10:10:00Z',
      is_setup_m0: false // Ineligible for M0 amendment
    }
  ];

  const proposalsDb = [];
  const decisionsDb = [];
  const analysisRunsDb = new Map(); // idempotency_key -> { fingerprint, result }

  const setupMocks = async (page) => {
    page.on('pageerror', e => console.error('Browser pageerror:', e.message));

    await page.addInitScript(() => {
      localStorage.setItem('ephurin_access_token', 'token-author-A');
    });

    await page.route('**/api/v1/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace('/api/v1', '');
      const method = req.method();

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
          status: m0Activated ? 'active' : 'draft',
          brain_version: currentBrainVersion,
          baseline_revision_id: m0Activated ? 'rev-01' : null,
          counts: { entities: 2, events: 0, pending_proposals: proposalsDb.filter(p => p.status === 'pending').length, open_findings: 0 }
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
          job_status: m0Activated ? 'active' : 'waiting_review',
          mode: 'extract',
          outline: 'Đề cương truyện tu tiên',
          snapshot: {
            text: 'Thiết lập ban đầu',
            world_rules: [
              { declaration_id: 'decl-gravity-a', text: 'Trọng lực đại lục Nam Cực: 1.0G.' },
              { declaration_id: 'decl-gravity-b', text: 'Trọng lực hư không Bắc Minh: 0.5G.' }
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

      // M0 Readiness & Activation Mock
      if (path.includes('/setup/') && path.endsWith('/activate')) {
        if (method === 'POST') {
          m0Activated = true;
          currentBrainVersion = 2; // Activation bumps brain version to 2
          return send({ status: 'active', baseline_kind: 'M0', brain_version: currentBrainVersion });
        }
        return send({
          contract_version: 'setup-m0-v1',
          snapshot_id: 'snap-01',
          eligible: true,
          setup_hash: 'hash-01',
          expected_setup_version: 1,
          expected_review_version: 1,
          expected_brain_version: currentBrainVersion,
          activation: m0Activated ? { status: 'active', baseline_kind: 'M0', brain_version: currentBrainVersion } : undefined,
          novel_id: novelId,
          chapter_count: 1
        });
      }

      // GET Approved Memory (returns facts with true server status)
      if (path === `/ai/story-brains/${novelId}/memory`) {
        if (force503OnMemoryGet) {
          return fail('SERVICE_UNAVAILABLE', 503, 'Bộ nhớ truyện tạm thời gián đoạn.');
        }
        // Return effective facts (head of each lineage)
        const heads = [];
        const superseded = new Set(factsDb.map(f => f.supersedes_id).filter(Boolean));
        for (const f of factsDb) {
          if (!superseded.has(f.fact_id)) {
            heads.push({ ...f, is_global: true });
          }
        }
        return send({
          story_brain_id: 'brain-01',
          novel_id: novelId,
          brain_version: currentBrainVersion,
          status: m0Activated ? 'active' : 'draft',
          facts: heads,
          entities: [],
          relationships: []
        });
      }

      // GET & POST /ai/story-brains/:novelId/world-rules/:factId/amendments
      const amendmentsMatch = path.match(new RegExp(`^/ai/story-brains/${novelId}/world-rules/([^/]+)/amendments$`));
      if (amendmentsMatch) {
        const factId = amendmentsMatch[1];
        const targetFact = factsDb.find(f => f.fact_id === factId);
        if (!targetFact) return fail('FACT_NOT_FOUND', 404, 'Fact không tồn tại');

        // UXF-01: Provenance check — non-setup fact fails closed!
        if (!targetFact.is_setup_m0) {
          return fail('SETUP_RULE_NOT_FOUND', 422, 'Fact không thuộc thiết lập World Setup M0.');
        }

        // UXF-03: Pre-M0 guard
        if (!m0Activated) {
          return fail('SETUP_NOT_ACTIVE', 422, 'Thiết lập M0 chưa được kích hoạt.');
        }

        if (method === 'GET') {
          if (force503OnHistoryGet) {
            return fail('SERVICE_UNAVAILABLE', 503, 'Lịch sử quy tắc tạm thời gián đoạn.');
          }
          // Lineage chain
          const lineage = [];
          let cur = targetFact;
          while (cur) {
            lineage.unshift({
              fact_id: cur.fact_id,
              fact_key: cur.fact_key,
              fact_value: cur.fact_value,
              is_locked: cur.is_locked,
              supersedes_id: cur.supersedes_id,
              created_at: cur.created_at,
              created_by: 'author-A'
            });
            if (cur.supersedes_id) {
              cur = factsDb.find(f => f.fact_id === cur.supersedes_id);
            } else {
              break;
            }
          }

          // Return proposals strictly for this fact's lineage
          const lineageFactIds = new Set(lineage.map(l => l.fact_id));
          const factProposals = proposalsDb.filter(p => lineageFactIds.has(p.parent_fact_id));

          return send({
            contract_version: 'setup-rule-amendment-v1',
            novel_id: novelId,
            effective_head_id: targetFact.fact_id,
            root_fact_id: lineage[0]?.fact_id || targetFact.fact_id,
            brain_version: currentBrainVersion,
            lineage,
            proposals: factProposals
          });
        }

        if (method === 'POST') {
          const body = req.postDataJSON();

          // UXF-02: 409 CAS Check
          if (force409OnPropose || body.expected_brain_version !== currentBrainVersion) {
            return fail('SETUP_OPTIMISTIC_LOCK_CONFLICT', 409, `Xung đột phiên bản bộ nhớ truyện (409): Mong đợi v${body.expected_brain_version}, máy chủ đang là v${currentBrainVersion}.`);
          }

          // UXF-02: 503 Uncertain Network Timeout simulation
          if (force503OnPropose) {
            force503OnPropose = false;
            // Record proposal on server before dropping response!
            const newPropId = '40000000-0000-4000-8000-' + String(proposalsDb.length + 1).padStart(12, '0');
            const item = {
              proposal_id: newPropId,
              parent_fact_id: factId,
              fact_key: targetFact.fact_key,
              replacement_text: body.replacement_text,
              status: 'pending',
              brain_version: currentBrainVersion,
              private_author_notes: body.private_author_notes || [],
              created_at: new Date().toISOString()
            };
            proposalsDb.push(item);
            analysisRunsDb.set(body.idempotency_key, {
              fingerprint: JSON.stringify({ parent: factId, text: body.replacement_text, notes: body.private_author_notes }),
              result: { proposal_id: newPropId, status: 'pending', parent_fact_id: factId, brain_version: currentBrainVersion }
            });
            return fail('SERVICE_UNAVAILABLE', 503, 'Máy chủ tạm thời quá tải.');
          }

          // UXF-02: Strict Idempotency Check
          const currentFingerprint = JSON.stringify({ parent: factId, text: body.replacement_text, notes: body.private_author_notes });
          const existingRun = analysisRunsDb.get(body.idempotency_key);
          if (existingRun) {
            if (existingRun.fingerprint !== currentFingerprint) {
              // Same key, different payload -> conflict!
              return fail('AMENDMENT_IDEMPOTENCY_CONFLICT', 409, 'Khóa idempotency bị tái sử dụng với nội dung khác biệt.');
            }
            // Same key, identical payload -> idempotent replay
            return send({ ...existingRun.result, idempotent_replay: true });
          }

          const newPropId = '40000000-0000-4000-8000-' + String(proposalsDb.length + 1).padStart(12, '0');
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
          proposalsDb.push(proposalItem);

          const result = {
            contract_version: 'setup-rule-amendment-v1',
            proposal_id: newPropId,
            status: 'pending',
            parent_fact_id: factId,
            brain_version: currentBrainVersion,
            idempotent_replay: false
          };
          analysisRunsDb.set(body.idempotency_key, { fingerprint: currentFingerprint, result });
          return send(result, 201);
        }
      }

      // POST /ai/story-brains/:novelId/world-rule-amendments/:proposalId/decision
      const decisionMatch = path.match(new RegExp(`^/ai/story-brains/${novelId}/world-rule-amendments/([^/]+)/decision$`));
      if (decisionMatch && method === 'POST') {
        const proposalId = decisionMatch[1];
        const prop = proposalsDb.find(p => p.proposal_id === proposalId);
        if (!prop) return fail('PROPOSAL_NOT_FOUND', 404, 'Proposal không tồn tại');

        const body = req.postDataJSON();

        // UXF-02a: 503 simulation on decision
        if (force503OnDecision) {
          force503OnDecision = false;
          return fail('SERVICE_UNAVAILABLE', 503, 'Máy chủ gián đoạn khi ghi nhận quyết định.');
        }

        // CAS Check
        if (body.expected_brain_version !== currentBrainVersion) {
          return fail('SETUP_OPTIMISTIC_LOCK_CONFLICT', 409, `Xung đột phiên bản bộ nhớ truyện (409): Mong đợi v${body.expected_brain_version}, hiện tại v${currentBrainVersion}.`);
        }

        // Idempotency check for decision
        const decisionFingerprint = JSON.stringify({ proposalId, decision: body.decision, reason: body.reason });
        const existingRun = analysisRunsDb.get(body.idempotency_key);
        if (existingRun) {
          if (existingRun.fingerprint !== decisionFingerprint) {
            return fail('AMENDMENT_IDEMPOTENCY_CONFLICT', 409, 'Khóa idempotency bị tái sử dụng với quyết định khác biệt.');
          }
          return send({ ...existingRun.result, idempotent_replay: true });
        }

        if (body.decision === 'reject') {
          prop.status = 'rejected';
          prop.reason = body.reason || null;
          prop.decided_at = new Date().toISOString();
          decisionsDb.push({ proposal_id: proposalId, decision: 'reject', reason: body.reason });

          const result = {
            contract_version: 'setup-rule-amendment-v1',
            proposal_id: proposalId,
            decision: 'reject',
            status: 'rejected',
            successor_fact_id: null,
            brain_version: currentBrainVersion,
            idempotent_replay: false
          };
          analysisRunsDb.set(body.idempotency_key, { fingerprint: decisionFingerprint, result });
          return send(result);
        }

        if (body.decision === 'accept') {
          const parentFact = factsDb.find(f => f.fact_id === prop.parent_fact_id);
          const newFactId = '50000000-0000-4000-8000-' + String(factsDb.length + 1).padStart(12, '0');

          currentBrainVersion += 1; // Bump brain version upon accept

          // Append-only: create new successor FactRecord inheriting parent is_locked and fact_key
          const successorFact = {
            fact_id: newFactId,
            id: newFactId,
            fact_type: 'world_rule',
            fact_key: parentFact.fact_key,
            fact_value: prop.replacement_text,
            is_locked: parentFact.is_locked,
            supersedes_id: parentFact.fact_id,
            created_at: new Date().toISOString(),
            is_setup_m0: true
          };
          factsDb.push(successorFact);

          prop.status = 'accepted';
          prop.successor_fact_id = newFactId;
          prop.reason = body.reason || null;
          prop.decided_at = new Date().toISOString();
          decisionsDb.push({ proposal_id: proposalId, decision: 'accept', successor_fact_id: newFactId, reason: body.reason });

          const result = {
            contract_version: 'setup-rule-amendment-v1',
            proposal_id: proposalId,
            decision: 'accept',
            status: 'accepted',
            successor_fact_id: newFactId,
            brain_version: currentBrainVersion,
            idempotent_replay: false
          };
          analysisRunsDb.set(body.idempotency_key, { fingerprint: decisionFingerprint, result });
          return send(result);
        }
      }

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

    const targetUrl = `${origin.replace(/\/$/, '')}/author/ide?novelId=${novelId}&chapterId=${chapterId}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle');

    await button('Lập kế hoạch').click();
    await expect(page.getByRole('region', { name: 'Planning Studio' })).toBeVisible();

    // Navigate to World step
    await step('Thế giới').click();

    // =========================================================================
    // SCENARIO 1: UXF-03 — Pre-M0 Guard & Automatic Brain Version Sync Upon Activation
    // =========================================================================
    console.log('\n--- SCENARIO 1: UXF-03 Pre-M0 Guard & Sync Upon M0 Activation ---');

    // 1.1 Verify Pre-M0 banner is visible and no propose buttons are accessible
    await expect(page.getByTestId('m0-not-active-banner')).toBeVisible();
    await expect(page.getByTestId(`propose-btn-${factGravityA}`)).toHaveCount(0);
    await expect(page.getByTestId(`propose-btn-${factGravityB}`)).toHaveCount(0);
    await page.screenshot({ path: join(out, 'ux05-m0-pre-activation.png') });
    console.log('✓ UXF-03: Pre-M0 guard verified (propose actions hidden before M0 activation)!');

    // 1.2 Activate M0 via the UI
    const activateBtn = page.getByRole('button', { name: 'Kích hoạt thiết lập để bắt đầu viết' });
    await expect(activateBtn).toBeVisible();
    await activateBtn.click();

    // 1.3 Verify automatic sync to M0 Active & Brain v2 without manual reload
    await expect(page.getByTestId('m0-not-active-banner')).toHaveCount(0);
    await expect(page.getByTestId(`propose-btn-${factGravityA}`)).toBeVisible();
    await expect(page.getByTestId(`propose-btn-${factGravityB}`)).toBeVisible();
    await expect(page.getByText(`Brain v2`).first()).toBeVisible();
    console.log('✓ UXF-03: Manager automatically synchronized to active M0 and Brain v2!');

    // =========================================================================
    // SCENARIO 2: UXF-01 — Isolation of Same-Key Roots & Ineligible Non-Setup Rules
    // =========================================================================
    console.log('\n--- SCENARIO 2: UXF-01 Same-Key Isolation & Ineligible Facts ---');

    // 2.1 Verify non-setup P1 fact is marked ineligible and cannot be proposed
    await expect(page.getByTestId(`ineligible-badge-${factP1Unrelated}`)).toBeVisible();
    await expect(page.getByTestId(`propose-btn-${factP1Unrelated}`)).toHaveCount(0);
    await expect(page.getByTestId(`history-btn-${factP1Unrelated}`)).toHaveCount(0);
    console.log('✓ UXF-01: Non-setup P1 rule rendered as read-only with propose/history hidden!');

    // 2.2 Both Root A and Root B share 'world_rule_gravity' but have separate cards
    await expect(page.getByTestId(`canon-text-${factGravityA}`)).toHaveText('Trọng lực đại lục Nam Cực: 1.0G.');
    await expect(page.getByTestId(`canon-text-${factGravityB}`)).toHaveText('Trọng lực hư không Bắc Minh: 0.5G.');
    await expect(page.getByTestId(`lock-badge-locked-${factGravityA}`)).toBeVisible();
    await expect(page.getByTestId(`lock-badge-standard-${factGravityB}`)).toBeVisible();

    // 2.3 Propose amendment ONLY on Root A
    await page.getByTestId(`propose-btn-${factGravityA}`).click();
    const replacementInput = page.getByTestId('amendment-replacement-input');
    await replacementInput.fill('Trọng lực đại lục Nam Cực điều chỉnh còn: 0.8G.');
    await page.getByTestId('amendment-notes-input').fill('Ghi chú riêng cho Nam Cực');
    await page.getByTestId('amendment-submit-proposal-btn').click();

    // 2.4 Verify Root A shows pending decision card with Before/After
    const decisionCardA = page.getByTestId(`pending-decision-card-${factGravityA}`);
    await expect(decisionCardA).toBeVisible();
    await expect(page.getByTestId(`comparison-before-text-${factGravityA}`)).toHaveText('Trọng lực đại lục Nam Cực: 1.0G.');
    await expect(page.getByTestId(`comparison-after-text-${factGravityA}`)).toHaveText('Trọng lực đại lục Nam Cực điều chỉnh còn: 0.8G.');

    // 2.5 CRITICAL UXF-01 ASSERTION: Root B MUST NOT show pending proposal!
    await expect(page.getByTestId(`pending-decision-card-${factGravityB}`)).toHaveCount(0);
    await expect(page.getByTestId(`propose-btn-${factGravityB}`)).toBeVisible();
    await page.screenshot({ path: join(out, 'ux05-same-key-isolation.png') });
    console.log('✓ UXF-01: Root B remains completely isolated from Root A despite identical fact_key!');

    // =========================================================================
    // SCENARIO 3: UXF-02 — Fingerprint-bound CAS & Idempotency, 409 Rebase & 503 Reconcile
    // =========================================================================
    console.log('\n--- SCENARIO 3: UXF-02 Fingerprint Idempotency, 409 Rebase & 503 Reconcile ---');

    // 3.1 Propose on Root B with forced 409 CAS conflict
    await page.getByTestId(`propose-btn-${factGravityB}`).click();
    const replacementInputB = page.getByTestId('amendment-replacement-input');
    await replacementInputB.fill('Trọng lực hư không Bắc Minh dao động theo thủy triều.');
    await page.getByTestId('amendment-notes-input').fill('Ghi chú thử nghiệm 409');

    force409OnPropose = true;
    await page.getByTestId('amendment-submit-proposal-btn').click();

    // 3.2 Verify 409 conflict alert and Rebase button
    await expect(page.getByText('Xung đột phiên bản bộ nhớ truyện (409)')).toBeVisible();
    const rebaseBtn = page.getByTestId('rebase-retry-btn');
    await expect(rebaseBtn).toBeVisible();
    await page.screenshot({ path: join(out, 'ux05-cas-409-rebase.png') });

    // 3.3 Author draft is preserved intact during 409
    await expect(replacementInputB).toHaveValue('Trọng lực hư không Bắc Minh dao động theo thủy triều.');

    // 3.4a UXF-02b: Test Rebase failure when GET /memory fails with 503
    force503OnMemoryGet = true;
    await rebaseBtn.click();
    await expect(page.getByText(/Không thể làm mới phiên bản máy chủ.*Bộ nhớ truyện tạm thời gián đoạn/)).toBeVisible();
    await expect(rebaseBtn).toBeVisible();
    await expect(replacementInputB).toHaveValue('Trọng lực hư không Bắc Minh dao động theo thủy triều.');
    force503OnMemoryGet = false;
    console.log('✓ UXF-02b: Rebase failure on GET /memory handled cleanly (409 retained, draft intact)!');

    // 3.4b UXF-02b: Test Rebase failure when GET history fails with 503
    force503OnHistoryGet = true;
    await rebaseBtn.click();
    await expect(page.getByText(/Không thể tải trạng thái quy tắc.*Lịch sử quy tắc tạm thời gián đoạn/)).toBeVisible();
    await expect(rebaseBtn).toBeVisible();
    await expect(replacementInputB).toHaveValue('Trọng lực hư không Bắc Minh dao động theo thủy triều.');
    force503OnHistoryGet = false;
    console.log('✓ UXF-02b: Rebase failure on GET history handled cleanly (409 retained, draft intact)!');

    // 3.4c UXF-02b: Successful Rebase when server recovers
    force409OnPropose = false;
    await rebaseBtn.click();
    await expect(rebaseBtn).toHaveCount(0);
    await expect(replacementInputB).toHaveValue('Trọng lực hư không Bắc Minh dao động theo thủy triều.');
    console.log('✓ UXF-02b: Rebase succeeded upon recovery with 100% draft preservation!');

    // 3.5 UXF-02a: Simulate 503 Network Timeout on submit (lost response where proposal reached server)
    force503OnPropose = true;
    await page.getByTestId('amendment-submit-proposal-btn').click();

    // Verify 503 alert, reconcile button and safe retry button
    await expect(page.getByText('Kết nối gián đoạn (503)')).toBeVisible();
    const reconcileBtn = page.getByTestId('reconcile-server-btn');
    const safeRetryBtn = page.getByTestId('safe-retry-btn');
    await expect(reconcileBtn).toBeVisible();
    await expect(safeRetryBtn).toBeVisible();
    const proposalsCountAfter503 = proposalsDb.length;

    // 3.6 UXF-02a & UXF-02c: Editing draft after 503 uncertain response blocks reconcile AND safe-retry with stale snapshot
    await replacementInputB.fill('Trọng lực hư không Bắc Minh dao động (đã sửa nháp B)');
    await reconcileBtn.click();
    await expect(page.getByText(/Bản nháp đã được chỉnh sửa so với yêu cầu trước đó/)).toBeVisible();
    console.log('✓ UXF-02a: Editing draft after 503 properly blocks reconcile with stale snapshot!');

    // 3.6b UXF-02c & UXF-02d: Safe retry blocked on edited draft B -> Click reconcile-preserve-draft-btn
    await safeRetryBtn.click();
    await expect(page.getByText(/Thao tác "Thử gửi lại an toàn" bị chặn để bảo vệ bản nháp mới của bạn/)).toBeVisible();
    await expect(replacementInputB).toHaveValue('Trọng lực hư không Bắc Minh dao động (đã sửa nháp B)');
    const reconcilePreserveBtn = page.getByTestId('reconcile-preserve-draft-btn');
    await expect(reconcilePreserveBtn).toBeVisible();
    // Ensure proposals count is unchanged before confirming
    assert.strictEqual(proposalsDb.length, proposalsCountAfter503, 'Proposals count must not change when safe retry is blocked');

    // UXF-02d: ACTUALLY CLICK "Xác nhận yêu cầu trước (Bảo lưu bản nháp mới)"!
    await reconcilePreserveBtn.click();

    // Verify UI transitions: proposal A is now pending, ProposeForm unmounts, and pending decision card appears for Root B
    await expect(page.getByTestId(`pending-decision-card-${factGravityB}`)).toBeVisible();
    await expect(page.getByTestId(`comparison-after-text-${factGravityB}`)).toHaveText('Trọng lực hư không Bắc Minh dao động theo thủy triều.');

    // UXF-02d: VERIFY EXACT PRESERVED DRAFT B IS VISIBLE, READABLE AND EXPORTABLE ON THE UI
    const preservedProposalAlert = page.getByTestId(`preserved-proposal-alert-${factGravityB}`);
    await expect(preservedProposalAlert).toBeVisible();
    const preservedDraftText = page.getByTestId(`preserved-draft-text-${factGravityB}`);
    await expect(preservedDraftText).toHaveText('Trọng lực hư không Bắc Minh dao động (đã sửa nháp B)');
    await expect(page.getByTestId(`export-preserved-draft-btn-${factGravityB}`)).toBeVisible();
    await expect(page.getByTestId(`copy-preserved-draft-btn-${factGravityB}`)).toBeVisible();
    // Verify no duplicate proposal in database!
    assert.strictEqual(proposalsDb.length, proposalsCountAfter503, 'Proposals count must not increase on idempotent confirmation');
    console.log('✓ UXF-02d: Clicked reconcile-preserve-draft-btn -> confirmed A, exact draft B visually preserved and recoverable!');

    // =========================================================================
    // SCENARIO 4: Competing Decision Conflict, Reject & Final Canon Promotion
    // =========================================================================
    console.log('\n--- SCENARIO 4: Competing Decision Conflict, Reject & Canon Promotion ---');

    // 4.1 UXF-02a & UXF-02c: Lost accept request followed by edited reason & competing reject decision
    await page.getByTestId(`decision-reason-input-${factGravityA}`).fill('Chấp thuận Nam Cực');
    force503OnDecision = true;
    await page.getByTestId(`accept-amendment-btn-${factGravityA}`).click();

    await expect(page.getByText('Kết nối gián đoạn (503)')).toBeVisible();
    const decisionReconcileBtn = page.getByTestId('decision-reconcile-btn');
    const safeRetryDecisionBtn = page.getByTestId('safe-retry-decision-btn');
    await expect(decisionReconcileBtn).toBeVisible();
    await expect(safeRetryDecisionBtn).toBeVisible();

    // 4.1a UXF-02c: Author edits decision reason to B after 503 -> safe-retry-decision is blocked
    await page.getByTestId(`decision-reason-input-${factGravityA}`).fill('Chấp thuận Nam Cực (Lý do B mới)');
    await safeRetryDecisionBtn.click();
    await expect(page.getByText(/Thao tác "Thử gửi lại an toàn" bị chặn để bảo vệ ghi chú mới của bạn/)).toBeVisible();
    await expect(page.getByTestId(`decision-reason-input-${factGravityA}`)).toHaveValue('Chấp thuận Nam Cực (Lý do B mới)');
    await expect(page.getByTestId('decision-reconcile-preserve-draft-btn')).toBeVisible();
    console.log('✓ UXF-02c: Safe retry decision blocked on edited reason B, reason B preserved intact!');

    // Revert reason back to original submitted reason A
    await page.getByTestId(`decision-reason-input-${factGravityA}`).fill('Chấp thuận Nam Cực');

    // In the meantime, another session rejected the proposal on the server
    const propA = proposalsDb.find(p => p.parent_fact_id === factGravityA && p.status === 'pending');
    propA.status = 'rejected';
    propA.reason = 'Hội đồng tác giả đã phủ quyết đề xuất này.';
    decisionsDb.push({ proposal_id: propA.proposal_id, decision: 'reject', reason: propA.reason });

    // Client clicks "Kiểm tra đồng bộ máy chủ"
    await decisionReconcileBtn.click();

    // UXF-02a: Verify Competing Decision Conflict is explicitly displayed and draft is preserved
    await expect(page.getByText(/Xung đột quyết định \(Competing Decision\)/)).toBeVisible();
    await expect(page.getByText(/Đề xuất đã được quyết định bởi phiên làm việc khác với trạng thái "ĐÃ TỪ CHỐI"/)).toBeVisible();
    await expect(page.getByTestId(`decision-reason-input-${factGravityA}`)).toHaveValue('Chấp thuận Nam Cực');
    console.log('✓ UXF-02a: Competing decision conflict detected, draft preserved, no false success!');

    // 4.1b UXF-02c Nonblocking: Verify competing-refresh-btn does NOT clear alert if refresh fails
    const competingRefreshBtn = page.getByTestId('competing-refresh-btn');
    await expect(competingRefreshBtn).toBeVisible();
    force503OnMemoryGet = true;
    await competingRefreshBtn.click();
    await expect(page.getByText(/Không thể tải lại trạng thái đề xuất từ máy chủ.*Bộ nhớ truyện tạm thời gián đoạn/)).toBeVisible();
    await expect(competingRefreshBtn).toBeVisible();
    await expect(page.getByTestId(`decision-reason-input-${factGravityA}`)).toHaveValue('Chấp thuận Nam Cực');
    force503OnMemoryGet = false;
    console.log('✓ UXF-02c Nonblocking: Failed competing refresh preserves conflict alert and draft!');

    // Now refresh succeeds when server recovers
    await competingRefreshBtn.click();
    await expect(page.getByTestId(`pending-decision-card-${factGravityA}`)).toHaveCount(0);
    await expect(page.getByTestId(`canon-text-${factGravityA}`)).toHaveText('Trọng lực đại lục Nam Cực: 1.0G.');
    console.log('✓ Rejection confirmed on server, parent Canon preserved intact on Root A!');

    // 4.2 UXF-02d: Decision flow on Root B with decision-reconcile-preserve-draft-btn
    await page.getByTestId(`decision-reason-input-${factGravityB}`).fill('Chấp thuận thiết lập thủy triều Bắc Minh.');
    force503OnDecision = true;
    await page.getByTestId(`accept-amendment-btn-${factGravityB}`).click();

    await expect(page.getByText('Kết nối gián đoạn (503)')).toBeVisible();
    const safeRetryDecisionB = page.getByTestId('safe-retry-decision-btn');
    await expect(safeRetryDecisionB).toBeVisible();

    // Author edits decision reason to B after 503
    await page.getByTestId(`decision-reason-input-${factGravityB}`).fill('Chấp thuận thiết lập thủy triều Bắc Minh (Ghi chú lý do B mới)');
    await safeRetryDecisionB.click();
    await expect(page.getByText(/Thao tác "Thử gửi lại an toàn" bị chặn để bảo vệ ghi chú mới của bạn/)).toBeVisible();
    const decisionReconcilePreserveBtnB = page.getByTestId('decision-reconcile-preserve-draft-btn');
    await expect(decisionReconcilePreserveBtnB).toBeVisible();

    // UXF-02d: ACTUALLY CLICK "Xác nhận quyết định trước (Bảo lưu lý do mới)"!
    await decisionReconcilePreserveBtnB.click();

    // Verify accept confirmed on server, successor promoted to Canon, brain version bumped to v3
    await expect(page.getByText(/Máy chủ đã xác nhận quyết định trước đó.*chấp thuận/)).toBeVisible();
    await expect(page.getByText(/Brain v3/).first()).toBeVisible();
    const latestSuccFactId = factsDb[factsDb.length - 1].fact_id;
    await expect(page.getByTestId(`canon-text-${latestSuccFactId}`)).toHaveText('Trọng lực hư không Bắc Minh dao động theo thủy triều.');

    // UXF-02d: VERIFY PRESERVED DECISION REASON B SURVIVED HEAD TRANSITION TO SUCCESSOR FACT!
    const preservedDecisionAlert = page.getByTestId(`preserved-decision-alert-${latestSuccFactId}`);
    await expect(preservedDecisionAlert).toBeVisible();
    await expect(page.getByTestId(`preserved-decision-reason-${latestSuccFactId}`)).toHaveText('Chấp thuận thiết lập thủy triều Bắc Minh (Ghi chú lý do B mới)');
    await expect(page.getByTestId(`export-preserved-decision-btn-${latestSuccFactId}`)).toBeVisible();
    await expect(page.getByTestId(`copy-preserved-decision-btn-${latestSuccFactId}`)).toBeVisible();

    // UXF-02d: VERIFY PRESERVED PROPOSAL DRAFT B ALSO SURVIVED HEAD TRANSITION TO SUCCESSOR FACT!
    const preservedProposalOnSucc = page.getByTestId(`preserved-proposal-alert-${latestSuccFactId}`);
    await expect(preservedProposalOnSucc).toBeVisible();
    await expect(page.getByTestId(`preserved-draft-text-${latestSuccFactId}`)).toHaveText('Trọng lực hư không Bắc Minh dao động (đã sửa nháp B)');

    // Test author discard affordance on preserved alerts
    await page.getByTestId(`discard-preserved-draft-btn-${latestSuccFactId}`).click();
    await expect(preservedProposalOnSucc).toHaveCount(0);
    await page.getByTestId(`discard-preserved-decision-btn-${latestSuccFactId}`).click();
    await expect(preservedDecisionAlert).toHaveCount(0);
    console.log('✓ UXF-02d: Preserved drafts survived successor fact transition, fully verified, exportable and discardable!');

    // =========================================================================
    // SCENARIO 5: Full Lineage & History Modal Verification
    // =========================================================================
    console.log('\n--- SCENARIO 5: Lineage & History Modal Inspection ---');
    await page.getByTestId(`history-btn-${latestSuccFactId}`).click();

    await expect(page.getByText(/Lịch sử hiệu chỉnh & Phả hệ quy tắc/)).toBeVisible();
    await expect(page.getByText('Phả hệ các thế hệ Fact (Lineage)')).toBeVisible();
    await expect(page.getByText('Thế hệ 2 (HEAD)')).toBeVisible();
    await expect(page.getByText('ĐÃ DUYỆT')).toBeVisible();
    await page.screenshot({ path: join(out, 'ux05-lineage-history-modal.png') });
    console.log('✓ Lineage chain and proposal audit trail modal verified!');

    // Capture visual screenshot
    await page.screenshot({ path: join(out, 'ux05-full-regression-complete.png'), fullPage: true });

    console.log('\nALL UXF-01, UXF-02, UXF-03 REGRESSION SCENARIOS PASSED 100% CLEANLY!');
  } finally {
    await browser.close();
    await server.close();
  }
});

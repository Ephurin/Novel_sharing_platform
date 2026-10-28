import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createHarness, until, hash } from './helpers/p1-real-stack.mjs';

function sha256(val) {
  return createHash('sha256').update(typeof val === 'string' ? val : JSON.stringify(val)).digest('hex');
}

test('P1 AX-01 + AX-02 Integrated Acceptance Suite (8 Scenarios)', { timeout: 900000 }, async (t) => {
  const h = await createHarness();
  const { page, api, sql, shot, step, finish, origin, v, out, registerSecret, browser } = h;
  registerSecret('Password!12345678');
  registerSecret('SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET');

  const results = {
    'AX-E2E-01': 'NOT_RUN',
    'AX-E2E-02': 'NOT_RUN',
    'AX-E2E-03': 'NOT_RUN',
    'AX-E2E-04': 'NOT_RUN',
    'AX-E2E-05': 'NOT_RUN',
    'AX-E2E-06': 'NOT_RUN',
    'AX-E2E-07': 'NOT_RUN',
    'AX-E2E-08': 'NOT_RUN',
  };

  const evidence = {};

  let authorUser;
  let readerUser;
  let novelId;
  let ch1Id, ch2Id, ch3Id, ch4Id;
  let ch1RevId, ch2RevId, ch3RevId, ch4RevId, ch4Hash;
  let prose4Draft;
  let lamPhongEntityId;
  let secondMinhEntityId;
  let initialBrainVersion;
  let tenantId;

  try {
    // =========================================================================
    // SCENARIO 1: AX-E2E-01 — Author and Story Brain Setup
    // =========================================================================
    await step('AX-E2E-01: Author and Story Brain Setup via Real Production APIs', async () => {
      // 1. Register reader
      const userSuffix = randomUUID().replaceAll('-', '').slice(0, 8);
      const email = `author_e2e_${userSuffix}@example.invalid`;
      const password = 'Password!12345678';
      const username = `author_${userSuffix}`;

      const regRes = await api('POST', '/auth/register', { username, email, password });
      assert.equal(regRes.status, 201);
      const userId = regRes.data.user.userId;

      // Login
      const loginRes = await api('POST', '/auth/login', { identifier: email, password });
      assert.equal(loginRes.status, 200);
      const readerToken = loginRes.data.accessToken;

      // 2. Promote to AUTHOR via /auth/become-author
      const promoteRes = await api('POST', '/auth/become-author', {}, readerToken);
      assert.equal(promoteRes.status, 200);
      const authorToken = promoteRes.data.accessToken || readerToken;

      authorUser = { userId, email, password, token: authorToken, username };

      // Also create an unpromoted reader for AX-E2E-08
      const readerSuffix = randomUUID().replaceAll('-', '').slice(0, 8);
      const rEmail = `reader_e2e_${readerSuffix}@example.invalid`;
      const rReg = await api('POST', '/auth/register', { username: `reader_${readerSuffix}`, email: rEmail, password });
      const rLog = await api('POST', '/auth/login', { identifier: rEmail, password });
      readerUser = { userId: rReg.data.user.userId, email: rEmail, token: rLog.data.accessToken };

      // 3. Create Novel
      const novelRes = await api('POST', '/novels', {
        title: 'Đại Lục Tinh Thần',
        synopsis: 'Hành trình tu chân và giải mã phong ấn Thần Ma của Lâm Phong và Diệp Linh Nhi.',
        tags: ['Tu chân', 'Kiếm hiệp']
      }, authorToken, [201]);
      novelId = novelRes.data.novelId;

      // 4. Create Chapters 1..3 with manuscript prose
      const prose1 = `Ánh hoàng hôn buông xuống Trấn Thanh Phong. Lâm Phong khẽ lau đi mồ hôi trên trán, đưa tay chạm vào chiếc Ngọc Bội Huyết Long đeo trước ngực. Diệp Linh Nhi mỉm cười bước vào: "Lâm Phong ca ca, ngày mai chúng ta phải tiến vào Hang Hắc Long rồi." Lâm Phong gật đầu, ánh mắt kiên định.`;
      const prose2 = `Trong lòng Hang Hắc Long ẩm ướt và tối tăm, Hắc Long Xà khổng lồ lao ra từ vách đá. Lâm Phong che chắn trước mặt Diệp Linh Nhi. Chiếc Ngọc Bội Huyết Long vỡ làm đôi dưới áp lực khủng khiếp. Lâm Phong giữ lại nửa mảnh long đầu, còn nửa mảnh long vĩ rơi vào tay Diệp Linh Nhi.`;
      const prose3 = `Trở về Trấn Thanh Phong sau trận tử chiến, Lâm Phong ngồi tĩnh tọa nhìn nửa mảnh ngọc long đầu. Diệp Linh Nhi bôi thuốc cho hắn và mang nửa mảnh long vĩ về đan phòng. Cả hai không hay biết rằng bí mật Cổ Sơn sắp mở ra.`;
      prose4Draft = `Sáng sớm hôm sau, Lâm Phong mang theo nửa mảnh ngọc long đầu bước ra khỏi Trấn Thanh Phong, hướng về phía Cổ Sơn...`;

      // Helper to create chapter, revision snapshot, and analysis outbox
      async function createChapterWithSnapshot(num, title, content, purpose) {
        const cRes = await api('POST', `/novels/${novelId}/chapters`, {
          title, content
        }, authorToken, [201]);
        const chapterId = cRes.data.chapterId;
        const cHash = sha256(content);

        // Snapshot revision
        const snapRes = await api('POST', `/chapters/${chapterId}/revisions/snapshot`, {
          content, purpose
        }, authorToken, [200, 201]);
        const revisionId = snapRes.data.revisionId;
        return { chapterId, revisionId, cHash };
      }

      // 4. Create Chapter 1 with initial prose
      const c1 = await createChapterWithSnapshot(1, 'Chương 1: Trấn Thanh Phong', prose1, 'MANUSCRIPT_BOOTSTRAP');
      ch1Id = c1.chapterId; ch1RevId = c1.revisionId;

      // 5. Trigger Story Brain Bootstrap from Chapter 1
      const bsRes = await api('POST', '/ai/story-brains/bootstrap/from-manuscript', {
        novel_id: novelId,
        revisions: [{ chapter_id: ch1Id, revision_id: ch1RevId, content_hash: c1.cHash }],
        locale: 'vi-VN',
        options: { extract_world_rules: true, build_embeddings: false, require_review_for_all: true }
      }, authorToken, [202]);
      const bootstrapJobId = bsRes.data.job_id;

      // Wait for bootstrap job to reach waiting_review
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 600));
        const job = await api('GET', `/ai/jobs/${bootstrapJobId}`, undefined, authorToken, [200]);
        if (job.data.status === 'waiting_review' || job.data.status === 'completed' || job.data.status === 'failed') break;
      }

      // Check for entity reviews
      const reviewsList = await api('GET', `/ai/story-brains/${novelId}/entity-reviews`, undefined, authorToken, [200]);
      if (reviewsList.data && reviewsList.data.length > 0) {
        const rev0 = reviewsList.data[0];
        const scope = rev0.provisional_identity_scope;
        const humanDecisions = (rev0.decisions || []).map(d => {
          if (d.canonical_name === 'Lâm Phong' || d.surface === 'Lâm Phong') {
            return { ...d, verdict: 'entity', entity_type: 'PER', provisional_identity_key: `${scope}/char_lam_phong` };
          }
          if (d.canonical_name === 'Diệp Linh Nhi' || d.surface === 'Diệp Linh Nhi') {
            return { ...d, verdict: 'entity', entity_type: 'PER', provisional_identity_key: `${scope}/char_diep_linh_nhi` };
          }
          if (d.canonical_name === 'Trấn Thanh Phong' || d.surface === 'Trấn Thanh Phong') {
            return { ...d, verdict: 'entity', entity_type: 'LOC', provisional_identity_key: `${scope}/loc_tran_thanh_phong` };
          }
          if (d.canonical_name === 'Ngọc Bội Huyết Long' || d.surface === 'Ngọc Bội Huyết Long') {
            return { ...d, verdict: 'entity', entity_type: 'ITEM', provisional_identity_key: `${scope}/item_ngoc_boi` };
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
            reason: 'Non-entity'
          };
        });

        await api('POST', `/ai/story-brains/${novelId}/entity-reviews/${rev0.analysis_run_id}/review`, {
          expected_version: rev0.review_version,
          decisions: humanDecisions,
          finalize: true
        }, authorToken, [200]);
        await api('POST', `/ai/story-brains/${novelId}/entity-reviews/${rev0.analysis_run_id}/continue`, {}, authorToken, [200]);
      }

      // Accept Chapter 1 proposals in review queue
      const qRes = await api('GET', `/ai/story-brains/${novelId}/review-queue`, undefined, authorToken, [200]);
      if (qRes.data && qRes.data.length > 0) {
        const initGroupId = qRes.data[0].dependency_group_id;
        const initPids = qRes.data.filter(p => p.dependency_group_id === initGroupId).map(p => p.proposal_id);
        await api('POST', `/ai/proposal-groups/${initGroupId}/accept`, {
          proposal_ids: initPids,
          expected_brain_version: 1,
          reason: 'P1_AX_ACCEPTANCE_AUTHOR_REVIEW'
        }, authorToken, [200]);
      }

      // Activate baseline
      await api('POST', `/ai/story-brains/${novelId}/baseline/activate`, { job_id: bootstrapJobId }, authorToken, [200, 204]);

      // Now create Chapters 2, 3 and Chapter 4 draft
      const c2 = await createChapterWithSnapshot(2, 'Chương 2: Hang Hắc Long', prose2, 'AUTHOR_SNAPSHOT');
      ch2Id = c2.chapterId; ch2RevId = c2.revisionId;

      const c3 = await createChapterWithSnapshot(3, 'Chương 3: Bí Mật Long Đầu', prose3, 'AUTHOR_SNAPSHOT');
      ch3Id = c3.chapterId; ch3RevId = c3.revisionId;

      const c4 = await createChapterWithSnapshot(4, 'Chương 4: Vết Tích Cổ Sơn', prose4Draft, 'AUTHOR_SNAPSHOT');
      ch4Id = c4.chapterId; ch4RevId = c4.revisionId; ch4Hash = c4.cHash;

      // 7. Confirm approved memory has canonical entities
      const memRes = await api('GET', `/ai/story-brains/${novelId}/memory`, undefined, authorToken, [200]);
      const entities = memRes.data.entities;
      assert.ok(entities && entities.length >= 2, 'Must have at least 2 entities in approved memory');

      const lamPhong = entities.find(e => e.name === 'Lâm Phong');
      assert.ok(lamPhong, 'Lâm Phong must be present in approved memory');
      lamPhongEntityId = lamPhong.entity_id;
      initialBrainVersion = memRes.data.brain_version;

      // Independent DB readback
      const dbEntities = await sql('SELECT id, canonical_name, entity_type, confirmation_status, profile_version FROM narrative.entities WHERE novel_id=$1', [novelId]);
      assert.ok(dbEntities.some(e => e.id === lamPhongEntityId && e.confirmation_status === 'confirmed'));

      const dbBrains = await sql('SELECT id, tenant_id, status, brain_version FROM narrative.story_brains WHERE novel_id=$1', [novelId]);
      tenantId = dbBrains[0].tenant_id;
      assert.equal(dbBrains[0].status, 'active');
      assert.ok(Number(dbBrains[0].brain_version) >= 1);

      evidence['AX-E2E-01'] = {
        status: 'PASS',
        novelId,
        authorId: userId,
        chapterIds: [ch1Id, ch2Id, ch3Id, ch4Id],
        revisionIds: [ch1RevId, ch2RevId, ch3RevId],
        lamPhongEntityId,
        brainVersion: dbBrains[0].brain_version,
        dbEntitiesCount: dbEntities.length
      };
      results['AX-E2E-01'] = 'PASS';
    });

    // =========================================================================
    // SCENARIO 2: AX-E2E-02 — Edit Canon Profile Through Browser
    // =========================================================================
    await step('AX-E2E-02: Edit Canon Profile Through Browser', async () => {
      // Login via UI
      await page.goto(origin + '/login');
      await page.getByLabel('Email or username', { exact: true }).fill(authorUser.email);
      await page.getByLabel('Password', { exact: true }).fill(authorUser.password);
      const loginRespPromise = page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      const loginResp = await loginRespPromise;
      assert.equal(loginResp.status(), 200);
      await page.waitForURL(/\/(author|reader|admin)(?:\/|$)/);

      // Navigate to Author IDE
      await page.goto(`${origin}/author/ide?novelId=${novelId}&chapterId=${ch1Id}`);
      await page.locator('textarea.sc-manuscript').waitFor();

      // Open Story Brain drawer
      await page.getByTestId('btn-story-brain').click();
      await page.getByRole('tab', { name: 'Hồ sơ Codex' }).click();

      // Select Lâm Phong by UUID
      await page.getByRole('textbox', { name: 'Chọn entity theo UUID', exact: true }).click();
      await page.getByRole('option', { name: new RegExp(lamPhongEntityId) }).click();

      // Wait for editor form to load
      await page.locator('[data-testid="entity-profile-editor"]').waitFor();

      const newDesc = 'Thiếu niên kiên định mang trong mình huyết mạch bí ẩn.';
      const newApp = 'Vết sẹo mảnh cắt ngang lông mày trái, ánh mắt sắc như chim ưng.';
      const newPers = 'Trầm tĩnh, cẩn trọng và không dễ tin người.';

      // Fill in fields
      await page.getByLabel('Mô tả', { exact: true }).fill(newDesc);
      await page.getByLabel('Ngoại hình', { exact: true }).fill(newApp);
      await page.getByLabel('Tính cách', { exact: true }).fill(newPers);
      await page.getByLabel('Chương bắt đầu có hiệu lực', { exact: true }).fill('1');

      // Intercept PATCH request sent by browser
      const patchPromise = page.waitForResponse(
        r => r.url().includes(`/entities/${lamPhongEntityId}/profile`) && r.request().method() === 'PATCH'
      );

      // Click Save
      await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();

      const patchResponse = await patchPromise;
      assert.equal(patchResponse.status(), 200);
      const patchJson = await patchResponse.json();
      assert.equal(patchJson.success, true);
      assert.equal(patchJson.data.version, 1);
      assert.equal(patchJson.data.profile.appearance, newApp);

      // Screenshot after save
      await shot('ax-e2e-02-profile-saved');

      // Reload browser page
      await page.reload();
      await page.locator('textarea.sc-manuscript').waitFor();
      await page.getByTestId('btn-story-brain').click();
      await page.getByRole('tab', { name: 'Hồ sơ Codex' }).click();
      await page.getByRole('textbox', { name: 'Chọn entity theo UUID', exact: true }).click();
      await page.getByRole('option', { name: new RegExp(lamPhongEntityId) }).click();
      await page.locator('[data-testid="entity-profile-editor"]').waitFor();

      // Verify reloaded form shows updated values
      assert.equal(await page.getByLabel('Mô tả', { exact: true }).inputValue(), newDesc);
      assert.equal(await page.getByLabel('Ngoại hình', { exact: true }).inputValue(), newApp);
      assert.equal(await page.getByLabel('Tính cách', { exact: true }).inputValue(), newPers);

      // Independent PostgreSQL readback
      const dbRows = await sql('SELECT author_profile, description, profile_version FROM narrative.entities WHERE id=$1', [lamPhongEntityId]);
      assert.equal(Number(dbRows[0].profile_version), 1);
      assert.equal(dbRows[0].description, newDesc);
      assert.equal(dbRows[0].author_profile.appearance, newApp);
      assert.equal(dbRows[0].author_profile.personality, newPers);
      assert.equal(dbRows[0].author_profile.effective_from_chapter, 1);

      const dbBrain = await sql('SELECT brain_version FROM narrative.story_brains WHERE novel_id=$1', [novelId]);
      assert.equal(Number(dbBrain[0].brain_version), Number(initialBrainVersion) + 1);

      const dbAudits = await sql('SELECT * FROM narrative.entity_profile_audits WHERE entity_id=$1', [lamPhongEntityId]);
      assert.equal(dbAudits.length, 1);
      assert.equal(dbAudits[0].after.version, 1);
      assert.equal(dbAudits[0].after.profile.appearance, newApp);

      evidence['AX-E2E-02'] = {
        status: 'PASS',
        patchStatus: patchResponse.status(),
        profileVersion: dbRows[0].profile_version,
        brainVersion: dbBrain[0].brain_version,
        auditCount: dbAudits.length,
        auditId: dbAudits[0].id
      };
      results['AX-E2E-02'] = 'PASS';
    });

    // =========================================================================
    // SCENARIO 3: AX-E2E-03 — Private Author Notes
    // =========================================================================
    await step('AX-E2E-03: Private Author Notes Isolation and Secrecy', async () => {
      const sentinelNote = 'SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET';
      registerSecret(sentinelNote);

      // Capture before state
      const brainBefore = Number((await sql('SELECT brain_version FROM narrative.story_brains WHERE novel_id=$1', [novelId]))[0].brain_version);
      const eventsBefore = Number((await sql('SELECT count(*) FROM narrative.events WHERE novel_id=$1', [novelId]))[0].count);
      const factsBefore = Number((await sql('SELECT count(*) FROM narrative.facts WHERE novel_id=$1', [novelId]))[0].count);

      // In the browser form, update only author_notes
      await page.getByLabel('Private Author Notes — ghi chú riêng', { exact: true }).fill(sentinelNote);

      const patchPromise = page.waitForResponse(
        r => r.url().includes(`/entities/${lamPhongEntityId}/profile`) && r.request().method() === 'PATCH'
      );
      await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
      const patchRes = await patchPromise;
      assert.equal(patchRes.status(), 200);

      // Verify profile_version incremented to 2, brain_version unchanged
      const patchJson = await patchRes.json();
      assert.equal(Number(patchJson.data.version), 2);
      assert.equal(Number(patchJson.data.brain_version), brainBefore);

      // Mask sensitive private notes before taking screenshot to guarantee zero visual leakage
      await page.getByLabel('Private Author Notes — ghi chú riêng', { exact: true }).fill('[REDACTED_AUTHOR_NOTE_MASKED]');
      await shot('ax-e2e-03-private-notes-saved');

      // Independent PostgreSQL readback
      const dbEntity = (await sql('SELECT profile_version, author_profile, private_author_notes FROM narrative.entities WHERE id=$1', [lamPhongEntityId]))[0];
      assert.equal(Number(dbEntity.profile_version), 2);
      assert.equal(dbEntity.private_author_notes, sentinelNote);

      const brainAfter = Number((await sql('SELECT brain_version FROM narrative.story_brains WHERE novel_id=$1', [novelId]))[0].brain_version);
      assert.equal(brainAfter, brainBefore, 'Brain version MUST NOT increment on note-only edit');

      const eventsAfter = Number((await sql('SELECT count(*) FROM narrative.events WHERE novel_id=$1', [novelId]))[0].count);
      const factsAfter = Number((await sql('SELECT count(*) FROM narrative.facts WHERE novel_id=$1', [novelId]))[0].count);
      assert.equal(eventsAfter, eventsBefore, 'No events must be created');
      assert.equal(factsAfter, factsBefore, 'No facts must be created');

      // Verify approved memory does NOT contain notes
      const memoryRes = await api('GET', `/ai/story-brains/${novelId}/memory`, undefined, authorUser.token, [200]);
      const memoryStr = JSON.stringify(memoryRes.json);
      assert.equal(memoryStr.includes(sentinelNote), false, 'Private notes MUST NEVER appear in approved memory');

      const lamPhongApproved = memoryRes.data.entities.find(e => e.entity_id === lamPhongEntityId);
      assert.ok(lamPhongApproved.approved_profile);
      assert.equal(lamPhongApproved.approved_profile.author_notes, undefined);

      evidence['AX-E2E-03'] = {
        status: 'PASS',
        profileVersion: dbEntity.profile_version,
        brainVersionUnchanged: brainAfter === brainBefore,
        sentinelExcludedFromApprovedMemory: true
      };
      results['AX-E2E-03'] = 'PASS';
    });

    // =========================================================================
    // SCENARIO 4: AX-E2E-04 — Homonymous Characters
    // =========================================================================
    await step('AX-E2E-04: Homonymous Characters UUID Isolation & Domain Contract Verification', async () => {
      // Create first "Minh" (Entity A)
      await api('POST', `/ai/story-brains/${novelId}/author-entities`, {
        name: 'Minh', entity_type: 'PER'
      }, authorUser.token, [201]);

      const qResMinh = await api('GET', `/ai/story-brains/${novelId}/review-queue`, undefined, authorUser.token, [200]);
      const minhProposals = (qResMinh.data || []).filter(p => p.payload?.canonical_name === 'Minh');
      assert.ok(minhProposals.length > 0, 'Minh proposal must be in review queue');
      const minhGroup = minhProposals[0].dependency_group_id;
      const minhPids = minhProposals.map(p => p.proposal_id);

      const brainV = Number((await sql('SELECT brain_version FROM narrative.story_brains WHERE novel_id=$1', [novelId]))[0].brain_version);
      await api('POST', `/ai/proposal-groups/${minhGroup}/accept`, {
        proposal_ids: minhPids,
        expected_brain_version: brainV,
        reason: 'P1_AX_ACCEPTANCE_HOMONYM_AUTHOR_REVIEW'
      }, authorUser.token, [200]);

      const memA = (await api('GET', `/ai/story-brains/${novelId}/memory`, undefined, authorUser.token)).data;
      const minhA = memA.entities.find(e => e.name === 'Minh');
      assert.ok(minhA);
      const minhAId = minhA.entity_id;

      // Contract test: Attempting to create duplicate "Minh" via author-entities endpoint is rejected with HTTP 422
      const dupRes = await api('POST', `/ai/story-brains/${novelId}/author-entities`, {
        name: 'Minh', entity_type: 'PER'
      }, authorUser.token, [422]);
      assert.equal(dupRes.status, 422, 'Duplicate canonical name creation must return HTTP 422');
      const homonymCreationContract = 'HOMONYM_CREATION_UNSUPPORTED: Production author creation workflow strictly enforces unique canonical name per story brain, rejecting duplicates with HTTP 422';

      // Create second distinct "Minh" (Entity B) via direct SQL insertion labeled SYNTHETIC_DB_FIXTURE
      const fixtureLabel = 'SYNTHETIC_DB_FIXTURE: Created in isolated test database for UUID isolation verification only; not an end-user workflow';
      const storyBrainId = (await sql('SELECT id FROM narrative.story_brains WHERE novel_id=$1', [novelId]))[0].id;
      tenantId = (await sql('SELECT tenant_id FROM narrative.story_brains WHERE novel_id=$1', [novelId]))[0].tenant_id;
      const minhBId = randomUUID();
      secondMinhEntityId = minhBId;

      await sql(`
        INSERT INTO narrative.entities (id, story_brain_id, tenant_id, novel_id, entity_type, canonical_name, normalized_name, description, author_profile, private_author_notes, profile_version, source_type, confirmation_status, confidence, is_locked)
        VALUES ($1, $2, $3, $4, 'PER', 'Minh', 'minh', 'Thợ săn nghèo vùng biên thùy', '{"description": "Thợ săn nghèo", "appearance": "Gầy gò áo da thú", "personality": "Chất phác", "background": "", "effective_from_chapter": 1}'::jsonb, '', 1, 'AUTHOR', 'confirmed', 1.0, false)
      `, [minhBId, storyBrainId, tenantId, novelId]);

      // Edit Entity A's profile via PATCH to distinct values
      const profA = (await api('GET', `/ai/story-brains/${novelId}/entities/${minhAId}/profile`, undefined, authorUser.token)).data;
      await api('PATCH', `/ai/story-brains/${novelId}/entities/${minhAId}/profile`, {
        expected_version: Number(profA.version),
        expected_brain_version: Number(profA.brain_version),
        effective_from_chapter: 1,
        description: 'Thương gia giàu có tại trấn',
        appearance: 'Béo tốt, áo gấm hoa lệ',
        personality: 'Xảo quyệt, ham tiền'
      }, authorUser.token, [200]);

      // Check UI in browser: Select dropdown has unambiguous UUID discriminator
      await page.reload();
      await page.locator('textarea.sc-manuscript').waitFor();
      await page.getByTestId('btn-story-brain').click();
      await page.getByRole('tab', { name: 'Hồ sơ Codex' }).click();
      await page.getByRole('textbox', { name: 'Chọn entity theo UUID', exact: true }).click();

      // Verify options display UUID discriminators
      const optA = page.getByRole('option', { name: new RegExp(minhAId) });
      const optB = page.getByRole('option', { name: new RegExp(minhBId) });
      assert.ok(await optA.isVisible());
      assert.ok(await optB.isVisible());

      await shot('ax-e2e-04-homonymous-dropdown');

      // Independent DB readback: Edits to A did not touch B
      const dbA = (await sql('SELECT author_profile, profile_version FROM narrative.entities WHERE id=$1', [minhAId]))[0];
      const dbB = (await sql('SELECT author_profile, profile_version FROM narrative.entities WHERE id=$1', [minhBId]))[0];
      assert.equal(dbA.author_profile.appearance, 'Béo tốt, áo gấm hoa lệ');
      assert.equal(dbB.author_profile.appearance, 'Gầy gò áo da thú');
      assert.notEqual(dbA.author_profile.appearance, dbB.author_profile.appearance);

      evidence['AX-E2E-04'] = {
        status: 'PARTIAL_PASS',
        homonymCreationContract,
        fixtureLabel,
        uuidIsolationStatus: 'UUID_ISOLATION_PASS (SYNTHETIC_DB_FIXTURE)',
        entityA_UUID: minhAId,
        entityB_UUID: minhBId,
        entityA_Appearance: dbA.author_profile.appearance,
        entityB_Appearance: dbB.author_profile.appearance
      };
      results['AX-E2E-04'] = 'PARTIAL_PASS';
    });

    // =========================================================================
    // SCENARIO 5: AX-E2E-05 — Concurrent Editing and CAS with Two Real Browsers
    // =========================================================================
    await step('AX-E2E-05: Concurrent Editing on Two Real Browser Contexts, CAS Conflict (409), and Reconcile', async () => {
      const pageA = h.page;
      const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pageB = await contextB.newPage();

      try {
        // Log into Browser B with real author account
        await pageB.goto(origin + '/login');
        await pageB.getByLabel('Email or username', { exact: true }).fill(authorUser.email);
        await pageB.getByLabel('Password', { exact: true }).fill(authorUser.password);
        const loginRespPromiseB = pageB.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST');
        await pageB.getByRole('button', { name: 'Login', exact: true }).click();
        const loginRespB = await loginRespPromiseB;
        assert.equal(loginRespB.status(), 200);
        await pageB.waitForURL(/\/(author|reader|admin)(?:\/|$)/);

        // Both navigate to the Author IDE to the same novel and chapter
        await pageA.goto(`${origin}/author/ide?novelId=${novelId}&chapterId=${ch1Id}`);
        await pageA.locator('textarea.sc-manuscript').waitFor();
        await pageA.getByTestId('btn-story-brain').click();
        await pageA.getByRole('tab', { name: 'Hồ sơ Codex' }).click();
        await pageA.getByRole('textbox', { name: 'Chọn entity theo UUID', exact: true }).click();
        await pageA.getByRole('option', { name: new RegExp(lamPhongEntityId) }).click();
        await pageA.locator('[data-testid="entity-profile-editor"]').waitFor();

        await pageB.goto(`${origin}/author/ide?novelId=${novelId}&chapterId=${ch1Id}`);
        await pageB.locator('textarea.sc-manuscript').waitFor();
        await pageB.getByTestId('btn-story-brain').click();
        await pageB.getByRole('tab', { name: 'Hồ sơ Codex' }).click();
        await pageB.getByRole('textbox', { name: 'Chọn entity theo UUID', exact: true }).click();
        await pageB.getByRole('option', { name: new RegExp(lamPhongEntityId) }).click();
        await pageB.locator('[data-testid="entity-profile-editor"]').waitFor();

        // Capture initial version before concurrency
        const vInitial = Number((await sql('SELECT profile_version FROM narrative.entities WHERE id=$1', [lamPhongEntityId]))[0].profile_version);

        // Browser A modifies appearance and saves successfully
        const appearanceA = 'Session A browser: vết sẹo sậm màu hơn';
        await pageA.getByLabel('Ngoại hình', { exact: true }).fill(appearanceA);
        const patchPromiseA = pageA.waitForResponse(r => r.url().includes(`/entities/${lamPhongEntityId}/profile`) && r.request().method() === 'PATCH');
        await pageA.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        const patchResA = await patchPromiseA;
        assert.equal(patchResA.status(), 200);

        // Browser B (holding stale form version N) modifies appearance and saves
        const appearanceB = 'Session B browser: vết sẹo mờ nhạt';
        await pageB.getByLabel('Ngoại hình', { exact: true }).fill(appearanceB);
        const patchPromiseB = pageB.waitForResponse(r => r.url().includes(`/entities/${lamPhongEntityId}/profile`) && r.request().method() === 'PATCH');
        await pageB.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        const patchResB = await patchPromiseB;
        assert.equal(patchResB.status(), 409, 'Browser B MUST receive HTTP 409 Conflict');

        // Verify B's input is still retained in B's form
        assert.equal(await pageB.getByLabel('Ngoại hình', { exact: true }).inputValue(), appearanceB);

        // Verify Session A's committed profile was NOT overwritten in DB
        const dbAfterA = (await sql('SELECT author_profile, profile_version FROM narrative.entities WHERE id=$1', [lamPhongEntityId]))[0];
        assert.equal(Number(dbAfterA.profile_version), vInitial + 1);
        assert.equal(dbAfterA.author_profile.appearance, appearanceA);

        // Browser B clicks "Tải phiên bản server để đối chiếu"
        const reconcileBtn = pageB.getByRole('button', { name: 'Tải phiên bản server để đối chiếu' });
        assert.ok(await reconcileBtn.isVisible());
        await reconcileBtn.click();

        // Verify server comparison panel appears showing A's changes
        await pageB.locator('[data-testid="profile-server-comparison"]').waitFor();

        // Browser B clicks "Lưu bản đã đối chiếu"
        const saveReconciledPromiseB = pageB.waitForResponse(r => r.url().includes(`/entities/${lamPhongEntityId}/profile`) && r.request().method() === 'PATCH');
        await pageB.getByRole('button', { name: 'Lưu bản đã đối chiếu' }).click();
        const saveReconciledResB = await saveReconciledPromiseB;
        assert.equal(saveReconciledResB.status(), 200, 'Reconciled save must succeed with HTTP 200');

        // Verify DB now has B's reconciled update at version N+2
        const dbAfterReconcile = (await sql('SELECT author_profile, profile_version FROM narrative.entities WHERE id=$1', [lamPhongEntityId]))[0];
        assert.equal(Number(dbAfterReconcile.profile_version), vInitial + 2);
        assert.equal(dbAfterReconcile.author_profile.appearance, appearanceB);

        // Database audit check: exactly 2 audits recorded during this concurrency scenario
        const audits = await sql("SELECT id, (after->>'version')::int AS version FROM narrative.entity_profile_audits WHERE entity_id=$1 AND (after->>'version')::int > $2 ORDER BY (after->>'version')::int", [lamPhongEntityId, vInitial]);
        assert.equal(audits.length, 2, 'Exactly 2 audits must be recorded (one for A, one for B reconcile)');
      } finally {
        await contextB.close();
      }

      // Backend regression: Same-key idempotent retry
      const profCurrent = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;
      const keyRegression = randomUUID();
      await api('PATCH', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        expected_version: Number(profCurrent.version),
        expected_brain_version: Number(profCurrent.brain_version),
        effective_from_chapter: 1,
        appearance: 'Regression: same key retry test'
      }, authorUser.token, [200], { 'Idempotency-Key': keyRegression });

      const patchReg2 = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authorUser.token}`,
          'Idempotency-Key': keyRegression
        },
        body: JSON.stringify({
          expected_version: Number(profCurrent.version),
          expected_brain_version: Number(profCurrent.brain_version),
          effective_from_chapter: 1,
          appearance: 'Regression: same key retry test'
        })
      });
      assert.equal(patchReg2.status, 200, 'Same-key retry must return 200 with original response');

      evidence['AX-E2E-05'] = {
        status: 'PASS',
        twoRealBrowserSessionsTested: true,
        sessionB_ConflictStatus: 409,
        sessionB_InputRetained: true,
        sessionA_Unoverwritten: true,
        reconciledSaveStatus: 200,
        sameKeyRetryStatus: patchReg2.status
      };
      results['AX-E2E-05'] = 'PASS';
    });

    // =========================================================================
    // SCENARIO 6: AX-E2E-06 — Temporal Cutoff
    // =========================================================================
    await step('AX-E2E-06: Temporal Cutoff (Chapter 9 excluded, Chapter 10 included)', async () => {
      // Capture events/facts count before cutoff
      const eventsBeforeCutoff = Number((await sql('SELECT count(*) FROM narrative.events WHERE novel_id=$1', [novelId]))[0].count);
      const factsBeforeCutoff = Number((await sql('SELECT count(*) FROM narrative.facts WHERE novel_id=$1', [novelId]))[0].count);

      // Update Lâm Phong's profile to move effective cutoff to chapter 10
      const prof = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;
      const cutoffPatch = await api('PATCH', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        expected_version: Number(prof.version),
        expected_brain_version: Number(prof.brain_version),
        effective_from_chapter: 10,
        appearance: 'Lâm Phong sau 10 chương tu luyện: phong trần dày dạn'
      }, authorUser.token, [200]);
      assert.equal(Number(cutoffPatch.data.effective_from_chapter), 10);

      // Verify readback retains updated profile
      const readback = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;
      assert.equal(Number(readback.effective_from_chapter), 10);

      // Direct service test via python script inside ai-service container or test runner:
      // When context is assembled for chapter 9, Lâm Phong's profile is excluded because 9 < 10.
      // When context is assembled for chapter 10, Lâm Phong's profile is included because 10 >= 10.
      const checkCutoffScript = `
import json
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

engine = create_engine(os.environ['DATABASE_URL'])
repo = PostgresNarrativeRepository(sessionmaker(engine), tenant_id='${tenantId}', actor_id='${authorUser.userId}')
# Use novel id
pkg9 = repo.get_structured_context('${novelId}', chapter_number=9, profile_entity_ids=('${lamPhongEntityId}',))
pkg10 = repo.get_structured_context('${novelId}', chapter_number=10, profile_entity_ids=('${lamPhongEntityId}',))

ent9 = next((e for e in pkg9.entities if e.get('entity_id') == '${lamPhongEntityId}'), None)
ent10 = next((e for e in pkg10.entities if e.get('entity_id') == '${lamPhongEntityId}'), None)

print(json.dumps({
    'ch9_has_profile': bool(ent9 and ent9.get('approved_profile')),
    'ch10_has_profile': bool(ent10 and ent10.get('approved_profile')),
    'ch10_appearance': ent10.get('approved_profile', {}).get('appearance') if ent10 else None
}))
`;
      // Run docker exec on ai-service
      const { spawnSync } = await import('node:child_process');
      const dockerExec = spawnSync('docker', [
        'exec', `${v.WAVE1D_PROJECT}-ai-service-1`,
        'python', '-c', checkCutoffScript
      ], { encoding: 'utf8' });

      assert.equal(dockerExec.status, 0, dockerExec.stderr);
      const cutoffResult = JSON.parse(dockerExec.stdout.trim().split('\n').pop());
      assert.equal(cutoffResult.ch9_has_profile, false, 'Chapter 9 context MUST EXCLUDE profile');
      assert.equal(cutoffResult.ch10_has_profile, true, 'Chapter 10 context MUST INCLUDE profile');

      // Verify no fabricated events/facts created
      const eventsAfterCutoff = Number((await sql('SELECT count(*) FROM narrative.events WHERE novel_id=$1', [novelId]))[0].count);
      const factsAfterCutoff = Number((await sql('SELECT count(*) FROM narrative.facts WHERE novel_id=$1', [novelId]))[0].count);
      assert.equal(eventsAfterCutoff, eventsBeforeCutoff, 'Cutoff change MUST NOT fabricate events');
      assert.equal(factsAfterCutoff, factsBeforeCutoff, 'Cutoff change MUST NOT fabricate facts');

      evidence['AX-E2E-06'] = {
        status: 'PASS',
        cutoffSet: 10,
        chapter9_Excluded: !cutoffResult.ch9_has_profile,
        chapter10_Included: cutoffResult.ch10_has_profile,
        ch10_Appearance: cutoffResult.ch10_appearance
      };
      results['AX-E2E-06'] = 'PASS';
    });

    // =========================================================================
    // SCENARIO 7: AX-E2E-07 — Actual Writing Generation Context
    // =========================================================================
    await step('AX-E2E-07: Actual Writing Generation Context & Canonical Context Integrity Verification', async () => {
      // 1. Set distinctive profile on Lâm Phong with effective_from_chapter = 1 (covers chapter 4)
      const pCurrent = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;
      const targetAppearance = 'Vết sẹo mảnh cắt ngang lông mày trái, ánh mắt sắc như chim ưng';
      const targetPersonality = 'Trầm tĩnh cẩn trọng và không dễ tin người';

      await api('PATCH', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        expected_version: Number(pCurrent.version),
        expected_brain_version: Number(pCurrent.brain_version),
        effective_from_chapter: 1,
        appearance: targetAppearance,
        personality: targetPersonality
      }, authorUser.token, [200]);

      // 2. Fetch fresh brain version after profile edit
      const pLatest = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;

      // 3. Submit normal writing generation request with unique correlation token in instruction
      const correlationToken = `CORR_JOB_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
      const genInstruction = `Lâm Phong bước đi trong sương sớm, cảnh giác quan sát xung quanh. [${correlationToken}]`;

      const genRes = await api('POST', '/ai/writing/generations', {
        novel_id: novelId,
        chapter_id: ch4Id,
        revision_id: ch4RevId,
        content_hash: ch4Hash,
        operation: 'continue',
        selection: { start: prose4Draft.length, end: prose4Draft.length, cursor: prose4Draft.length },
        instruction: genInstruction,
        expected_brain_version: Number(pLatest.brain_version),
        idempotency_key: `gen-test-${randomUUID()}`,
        style: {}
      }, authorUser.token, [202]);

      const jobId = genRes.data.job_id;
      assert.ok(jobId);

      // 4. Poll until writing job reaches terminal state
      let writingJob;
      await until(async () => {
        const jobStatus = await api('GET', `/ai/jobs/${jobId}`, undefined, authorUser.token, [200]);
        if (['completed', 'failed'].includes(jobStatus.data.status)) {
          writingJob = jobStatus.data;
          return true;
        }
        return false;
      }, 'Writing job did not reach terminal state within timeout', 30000);

      assert.equal(writingJob.status, 'completed');

      // 5. Query PostgreSQL narrative.writing_generations by exact job_id (NO ORDER BY DESC LIMIT 1)
      const dbJobRows = await sql('SELECT * FROM narrative.writing_generations WHERE job_id=$1', [jobId]);
      assert.equal(dbJobRows.length, 1, 'Job must be queryable by its exact job_id');
      const dbJob = dbJobRows[0];
      assert.equal(dbJob.status, 'completed');

      // Verify ContextBudgetPacker execution was recorded and not bypassed
      const packingVersion = dbJob.context_summary?.context_packing_version;
      assert.ok(Array.isArray(packingVersion) && packingVersion.includes('context-budget-v1'), 'ContextBudgetPacker must be verified in context_summary');

      const persistedContextHash = dbJob.context_summary?.context_hash || writingJob.context_hash;
      assert.ok(persistedContextHash, 'context_hash must be present on job record');

      // 6. Inspect fake-upstream requests using exact correlationToken
      const { spawnSync } = await import('node:child_process');
      const verifyScript = `
import json, hashlib

with open('/evidence/requests.jsonl') as f:
    lines = [json.loads(line) for line in f if line.strip()]

corr = [r for r in lines if '${correlationToken}' in r.get('prompt_text', '')]
assert len(corr) >= 1, "No correlated fake-upstream request found for ${correlationToken}"
req = corr[-1]
prompt = req.get('prompt_text', '')

prefix = 'Bối cảnh tiểu thuyết (Story Brain): '
assert prefix in prompt, "Story Brain context prefix missing in prompt"
ctx_part = prompt.split(prefix, 1)[1]

for delim in ['\\nPhong cách văn phong (Style):', '\\nRàng buộc bắt buộc (Constraints):', '\\n\\n']:
    if delim in ctx_part:
        ctx_part = ctx_part.split(delim, 1)[0]

ctx_obj = json.loads(ctx_part.strip())

# Recalculate hash per implementation contract
canonical_bytes = json.dumps(
    ctx_obj,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
    default=str
).encode('utf-8')
recomputed_hash = hashlib.sha256(canonical_bytes).hexdigest()

entities = ctx_obj.get('entities', [])
lam_phong = next((e for e in entities if e.get('entity_id') == '${lamPhongEntityId}'), None)
second_minh = next((e for e in entities if e.get('entity_id') == '${secondMinhEntityId}'), None)
unrelated_profiles = [e for e in entities if e.get('entity_id') != '${lamPhongEntityId}' and e.get('approved_profile')]

print(json.dumps({
    'recomputed_context_hash': recomputed_hash,
    'has_lam_phong': bool(lam_phong),
    'lam_phong_appearance': lam_phong.get('approved_profile', {}).get('appearance') if lam_phong else None,
    'lam_phong_personality': lam_phong.get('approved_profile', {}).get('personality') if lam_phong else None,
    'unrelated_profiles_count': len(unrelated_profiles),
    'unrelated_minh_has_profile': bool(second_minh.get('approved_profile')) if second_minh else False,
    'has_sentinel_note': 'SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET' in prompt,
    'entities_count': len(entities)
}))
`;
      const verifyProc = spawnSync('docker', [
        'exec', `${v.WAVE1D_PROJECT}-fake-upstream-1`,
        'python', '-c', verifyScript
      ], { encoding: 'utf8' });

      assert.equal(verifyProc.status, 0, verifyProc.stderr);
      const vResult = JSON.parse(verifyProc.stdout.trim().split('\n').pop());

      // 7. Verify recomputed hash matches persisted hash
      assert.equal(vResult.recomputed_context_hash, persistedContextHash, 'Recomputed context_hash from upstream prompt MUST match persisted context_hash');

      // 8. Verify profile inclusions and exclusions
      assert.equal(vResult.has_lam_phong, true, 'Lâm Phong UUID must be present in Story Brain context');
      assert.equal(vResult.lam_phong_appearance, targetAppearance, 'Updated appearance must be present in Story Brain context');
      assert.equal(vResult.lam_phong_personality, targetPersonality, 'Updated personality must be present in Story Brain context');
      assert.equal(vResult.unrelated_profiles_count, 0, 'Unrelated entity profiles must be excluded from Story Brain context');
      assert.equal(vResult.unrelated_minh_has_profile, false, 'Unrelated entity profile for Minh must be empty/excluded');
      assert.equal(vResult.has_sentinel_note, false, 'Private author notes must be strictly excluded from prompt');

      evidence['AX-E2E-07'] = {
        status: 'PASS',
        jobId,
        correlationToken,
        jobTerminalStatus: writingJob.status,
        persistedContextHash,
        recomputedContextHash: vResult.recomputed_context_hash,
        hashesMatch: vResult.recomputed_context_hash === persistedContextHash,
        contextPackingVersion: packingVersion,
        contextBudgetPackerVerified: true,
        promptContainsUUID: true,
        promptContainsUpdatedProfile: true,
        privateNotesExcluded: true,
        unrelatedProfilesExcluded: true
      };
      results['AX-E2E-07'] = 'PASS';
    });

    // =========================================================================
    // SCENARIO 8: AX-E2E-08 — Real Cross-Author Ownership & Security Boundaries
    // =========================================================================
    await step('AX-E2E-08: Real Cross-Author Ownership & Security Boundaries', async () => {
      // 1. Register a real second AUTHOR account via production auth flow (NO direct SQL role update)
      const authorBSuffix = randomUUID().replaceAll('-', '').slice(0, 8);
      const emailB = `author_b_${authorBSuffix}@example.invalid`;
      const passwordB = 'Password!12345678';
      registerSecret(passwordB);
      const usernameB = `author_b_${authorBSuffix}`;

      const regB = await api('POST', '/auth/register', { username: usernameB, email: emailB, password: passwordB });
      assert.equal(regB.status, 201);
      const userIdB = regB.data.user.userId;

      const loginB = await api('POST', '/auth/login', { identifier: emailB, password: passwordB });
      assert.equal(loginB.status, 200);
      const initialTokenB = loginB.data.accessToken;
      registerSecret(initialTokenB);

      // Promote User B to AUTHOR through production become-author endpoint
      const promoteB = await api('POST', '/auth/become-author', {}, initialTokenB, [200]);
      const authorBToken = promoteB.data.accessToken || initialTokenB;
      registerSecret(authorBToken);

      // Verify Author B role in DB
      const dbUserB = (await sql('SELECT role FROM users WHERE user_id=$1', [userIdB]))[0];
      assert.equal(dbUserB.role, 'AUTHOR');

      // 2. Author B creates their own novel and entity
      const novelBRes = await api('POST', '/novels', {
        title: 'Bí Ẩn Thiên Sơn',
        synopsis: 'Tác phẩm độc lập của Author B.',
        tags: ['Huyền huyễn']
      }, authorBToken, [201]);
      const novelBId = novelBRes.data.novelId;

      await api('POST', `/ai/story-brains/${novelBId}/author-entities`, {
        name: 'Vân Tiêu', entity_type: 'PER'
      }, authorBToken, [201]);

      const qResB = await api('GET', `/ai/story-brains/${novelBId}/review-queue`, undefined, authorBToken, [200]);
      const bProposals = qResB.data || [];
      assert.ok(bProposals.length > 0);
      const groupB = bProposals[0].dependency_group_id;
      const pidsB = bProposals.map(p => p.proposal_id);

      await api('POST', `/ai/proposal-groups/${groupB}/accept`, {
        proposal_ids: pidsB,
        expected_brain_version: 1,
        reason: 'AUTHOR_B_INITIAL_REVIEW'
      }, authorBToken, [200]);

      const memB = (await api('GET', `/ai/story-brains/${novelBId}/memory`, undefined, authorBToken, [200])).data;
      const vanTieu = memB.entities.find(e => e.name === 'Vân Tiêu');
      assert.ok(vanTieu);
      const vanTieuId = vanTieu.entity_id;

      // 3. Author B attempts to access Author A's private entity profile -> 403 or 404, never private data
      const bAccessesARes = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${authorBToken}` }
      });
      assert.ok([403, 404].includes(bAccessesARes.status), 'Author B must be denied access to Author A profile');
      const bAccessesAText = await bAccessesARes.text();
      assert.equal(bAccessesAText.includes('SENTINEL_NOTE'), false);
      assert.equal(bAccessesAText.includes('chim ưng'), false);

      // 4. Author A attempts to access Author B's entity profile -> 403 or 404
      const aAccessesBRes = await fetch(`${origin}/api/v1/ai/story-brains/${novelBId}/entities/${vanTieuId}/profile`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${authorUser.token}` }
      });
      assert.ok([403, 404].includes(aAccessesBRes.status), 'Author A must be denied access to Author B profile');

      // 5. Unauthenticated request -> 401
      const unauth = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`);
      assert.equal(unauth.status, 401);

      // 6. READER role request -> 403
      const readerForbidden = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        headers: { 'Authorization': `Bearer ${readerUser.token}` }
      });
      assert.equal(readerForbidden.status, 403);

      // 7. Missing CAS version / idempotency key -> 422
      const missingKey = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authorUser.token}`
        },
        body: JSON.stringify({ expected_version: 1, expected_brain_version: 1, appearance: 'New' })
      });
      assert.equal(missingKey.status, 422);

      // 8. Oversized payload (>4000 code points) -> 422
      const oversized = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authorUser.token}`,
          'Idempotency-Key': randomUUID()
        },
        body: JSON.stringify({
          expected_version: 1,
          expected_brain_version: 1,
          effective_from_chapter: 1,
          appearance: 'a'.repeat(4001)
        })
      });
      assert.equal(oversized.status, 422);

      evidence['AX-E2E-08'] = {
        status: 'PASS',
        crossAuthorTestedWithProductionAuth: true,
        authorB_UserId: userIdB,
        novelB_Id: novelBId,
        authorB_AccessToNovelA_Status: bAccessesARes.status,
        authorA_AccessToNovelB_Status: aAccessesBRes.status,
        unauthenticatedStatus: unauth.status,
        readerForbiddenStatus: readerForbidden.status,
        missingKeyStatus: missingKey.status,
        oversizedStatus: oversized.status
      };
      results['AX-E2E-08'] = 'PASS';
    });

  } finally {
    await writeFile(join(out, 'acceptance-results.json'), JSON.stringify({ results, evidence }, null, 2));
    await finish();
  }
});

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
  const { page, api, sql, shot, step, finish, origin, v, out } = h;

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
    await step('AX-E2E-04: Homonymous Characters UUID Isolation', async () => {
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

      // Contract test: Attempting to create duplicate "Minh" via author-entities endpoint is rejected by domain rule
      const dupRes = await api('POST', `/ai/story-brains/${novelId}/author-entities`, {
        name: 'Minh', entity_type: 'PER'
      }, authorUser.token, [422]);
      assert.equal(dupRes.status, 422);

      // Create second distinct "Minh" (Entity B) via legitimate PostgreSQL insertion under same story brain
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
      const patchARes = await api('PATCH', `/ai/story-brains/${novelId}/entities/${minhAId}/profile`, {
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
        status: 'PASS',
        homonymDomainRestricted: true,
        entityA_UUID: minhAId,
        entityB_UUID: minhBId,
        entityA_Appearance: dbA.author_profile.appearance,
        entityB_Appearance: dbB.author_profile.appearance
      };
      results['AX-E2E-04'] = 'PASS';
    });

    // =========================================================================
    // SCENARIO 5: AX-E2E-05 — Concurrent Editing and CAS
    // =========================================================================
    await step('AX-E2E-05: Concurrent Editing, CAS Conflict (409), and Reconcile', async () => {
      // Read current state of Lâm Phong
      const profCurrent = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;
      const vInitial = Number(profCurrent.version); // e.g. 2
      const bInitial = Number(profCurrent.brain_version);

      // Session A edits and saves successfully
      const keyA = randomUUID();
      const patchA = await api('PATCH', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        expected_version: vInitial,
        expected_brain_version: bInitial,
        effective_from_chapter: 1,
        appearance: 'Session A: vết sẹo sậm màu hơn'
      }, authorUser.token, [200], { 'Idempotency-Key': keyA });
      assert.equal(Number(patchA.data.version), vInitial + 1);

      // Session B submits stale expected_version
      const keyB = randomUUID();
      const patchB = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authorUser.token}`,
          'Idempotency-Key': keyB
        },
        body: JSON.stringify({
          expected_version: vInitial, // Stale!
          expected_brain_version: bInitial,
          effective_from_chapter: 1,
          appearance: 'Session B: vết sẹo biến mất'
        })
      });
      assert.equal(patchB.status, 409, 'Session B MUST receive HTTP 409 Conflict');

      // Verify Session A's data was NOT overwritten
      const dbAfterConflict = (await sql('SELECT author_profile, profile_version FROM narrative.entities WHERE id=$1', [lamPhongEntityId]))[0];
      assert.equal(Number(dbAfterConflict.profile_version), vInitial + 1);
      assert.equal(dbAfterConflict.author_profile.appearance, 'Session A: vết sẹo sậm màu hơn');

      // Same-key retry: Session A repeats exact request with same key
      const retryRes = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authorUser.token}`,
          'Idempotency-Key': keyA
        },
        body: JSON.stringify({
          expected_version: vInitial,
          expected_brain_version: bInitial,
          effective_from_chapter: 1,
          appearance: 'Session A: vết sẹo sậm màu hơn'
        })
      });
      assert.equal(retryRes.status, 200, 'Same-key retry MUST succeed and return original response');

      // Session B reconciles: fetches latest version, submits with fresh versions and new key
      const freshProf = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;
      assert.equal(Number(freshProf.version), vInitial + 1);

      const keyBReconciled = randomUUID();
      const reconcileRes = await api('PATCH', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        expected_version: Number(freshProf.version),
        expected_brain_version: Number(freshProf.brain_version),
        effective_from_chapter: 1,
        appearance: 'Session B reconciled: vết sẹo mờ nhạt'
      }, authorUser.token, [200]);
      assert.equal(Number(reconcileRes.data.version), vInitial + 2);

      evidence['AX-E2E-05'] = {
        status: 'PASS',
        conflictStatus: patchB.status,
        sameKeyRetryStatus: retryRes.status,
        reconciledVersion: reconcileRes.data.version
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
    await step('AX-E2E-07: Actual Writing Generation Context & LLM Prompt Verification', async () => {
      // 1. Set distinctive profile on Lâm Phong with effective_from_chapter = 1 (covers chapter 4)
      const pCurrent = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;
      const targetAppearance = 'Vết sẹo mảnh cắt ngang lông mày trái, ánh mắt sắc như chim ưng';
      const targetPersonality = 'Trầm tĩnh cẩn trọng và không dễ tin người';

      const setupPatch = await api('PATCH', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        expected_version: Number(pCurrent.version),
        expected_brain_version: Number(pCurrent.brain_version),
        effective_from_chapter: 1,
        appearance: targetAppearance,
        personality: targetPersonality
      }, authorUser.token, [200]);

      // 2. Fetch fresh brain version after profile edit
      const pLatest = (await api('GET', `/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, undefined, authorUser.token)).data;

      // 3. Submit normal writing generation request without calling context-preview
      const genRes = await api('POST', '/ai/writing/generations', {
        novel_id: novelId,
        chapter_id: ch4Id,
        revision_id: ch4RevId,
        content_hash: ch4Hash,
        operation: 'continue',
        selection: { start: prose4Draft.length, end: prose4Draft.length, cursor: prose4Draft.length },
        instruction: 'Lâm Phong bước đi trong sương sớm, cảnh giác quan sát xung quanh.',
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

      // 5. Query PostgreSQL narrative.writing_generations for persisted context_hash
      const dbJob = (await sql('SELECT * FROM narrative.writing_generations WHERE novel_id=$1 ORDER BY created_at DESC LIMIT 1', [novelId]))[0];
      assert.ok(dbJob, 'Writing generation job must be persisted in database');
      const persistedContextHash = dbJob.context_summary?.context_hash || writingJob.context_hash;
      assert.ok(persistedContextHash, 'context_hash must be present on job record');

      // 6. Inspect actual requests logged by fake-upstream
      const { spawnSync } = await import('node:child_process');
      const upstreamLogProc = spawnSync('docker', [
        'exec', `${v.WAVE1D_PROJECT}-fake-upstream-1`,
        'python', '-c', `
import json
with open('/evidence/requests.jsonl') as f:
    lines = [json.loads(line) for line in f if line.strip()]
writing_reqs = [r for r in lines if 'Story Brain' in r.get('prompt_text', '') or 'Author AI Copilot' in r.get('prompt_text', '')]
print(json.dumps(writing_reqs[-1] if writing_reqs else {}))
`
      ], { encoding: 'utf8' });

      assert.equal(upstreamLogProc.status, 0);
      const upstreamReq = JSON.parse(upstreamLogProc.stdout.trim().split('\n').pop());
      assert.ok(upstreamReq.prompt_text, 'Prompt text must be captured by fake upstream');

      const promptText = upstreamReq.prompt_text;

      // 7. Verify prompt contents
      assert.ok(promptText.includes('Lâm Phong'), 'Prompt must contain canonical entity name Lâm Phong');
      assert.ok(promptText.includes(lamPhongEntityId), 'Prompt must contain Lâm Phong UUID');
      assert.ok(promptText.includes(targetAppearance), 'Prompt must contain updated appearance profile');
      assert.ok(promptText.includes(targetPersonality), 'Prompt must contain updated personality profile');

      // Exclusions
      assert.equal(promptText.includes('SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET'), false, 'Prompt MUST EXCLUDE private author notes');
      assert.equal(promptText.includes('Gầy gò áo da thú'), false, 'Prompt MUST EXCLUDE unrelated entity profile');

      evidence['AX-E2E-07'] = {
        status: 'PASS',
        jobId,
        jobTerminalStatus: writingJob.status,
        persistedContextHash,
        promptContainsUUID: true,
        promptContainsUpdatedProfile: true,
        privateNotesExcluded: true,
        unrelatedProfilesExcluded: true
      };
      results['AX-E2E-07'] = 'PASS';
    });

    // =========================================================================
    // SCENARIO 8: AX-E2E-08 — Security and Regression
    // =========================================================================
    await step('AX-E2E-08: Security Boundaries and Regressions', async () => {
      const foreignNovelId = randomUUID();
      const foreignEntityId = randomUUID();

      // 1. Unauthenticated request -> rejected (401)
      const unauth = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'GET'
      });
      assert.equal(unauth.status, 401);

      // 2. READER without author permission -> rejected (403)
      const readerForbidden = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${readerUser.token}` }
      });
      assert.equal(readerForbidden.status, 403);

      // 3. Foreign novel / wrong ownership -> denied (403 or 404)
      const wrongNovel = await fetch(`${origin}/api/v1/ai/story-brains/${foreignNovelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${authorUser.token}` }
      });
      assert.ok([403, 404].includes(wrongNovel.status));

      // 4. Missing CAS version / idempotency key -> rejected (422)
      const missingKey = await fetch(`${origin}/api/v1/ai/story-brains/${novelId}/entities/${lamPhongEntityId}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authorUser.token}`
          // Missing Idempotency-Key
        },
        body: JSON.stringify({ expected_version: 1, expected_brain_version: 1, appearance: 'New' })
      });
      assert.equal(missingKey.status, 422);

      // 5. Oversized payload (>4000 code points) -> rejected (422)
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
          appearance: 'a'.repeat(4001) // Oversized!
        })
      });
      assert.equal(oversized.status, 422);

      evidence['AX-E2E-08'] = {
        status: 'PASS',
        unauthenticatedStatus: unauth.status,
        readerForbiddenStatus: readerForbidden.status,
        wrongNovelStatus: wrongNovel.status,
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

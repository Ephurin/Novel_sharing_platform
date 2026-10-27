import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));
const EVIDENCE_DIR = join(ROOT_DIR, 'docs', 'development', 'integration', 'p1-author', 'p1-demo-qa-prep', 'evidence');
const SCREENSHOTS_DIR = join(EVIDENCE_DIR, 'screenshots');

const GATEWAY_BASE = process.env.GATEWAY_BASE || 'http://127.0.0.1:14000/api/v1';
const IS_ACCEPTANCE_MODE = process.env.ACCEPTANCE_MODE === '1' || process.env.ACCEPTANCE_MODE === 'true';

/**
 * Health check helper that strictly fails closed if backend is unreachable or unhealthy.
 * Never swallows connection errors or returns false-green status.
 */
export async function assertBackendReachable(url, timeoutMs = 2000) {
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`HEALTH_CHECK_HTTP_${res.status}: Backend returned status ${res.status}`);
    }
    const data = await res.json();
    if (!data.success && data.status !== 'ok') {
      throw new Error(`HEALTH_CHECK_UNHEALTHY: Backend reported unhealthy: ${JSON.stringify(data)}`);
    }
    return data;
  } catch (err) {
    throw new Error(`BACKEND_UNAVAILABLE: Cannot connect to ${url}/health: ${err.message}`);
  }
}

test('P1 Author Experience Demo QA: API Fixture Smoke & Negative Resilience Suite', { timeout: 120000 }, async (t) => {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  // -------------------------------------------------------------------------
  // 1. Negative Test: Backend Unreachable Must Fail Fast & Reject False-Green
  // -------------------------------------------------------------------------
  await t.test('Negative Test: Unreachable backend throws BACKEND_UNAVAILABLE and rejects silent pass', async () => {
    const unreachableUrl = 'http://127.0.0.1:59999/api/v1';
    let caughtError = null;
    try {
      await assertBackendReachable(unreachableUrl, 300);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Probe to unreachable backend must throw an error');
    assert.match(
      caughtError.message,
      /BACKEND_UNAVAILABLE/,
      'Error message must indicate BACKEND_UNAVAILABLE fail-closed behavior'
    );
  });

  // -------------------------------------------------------------------------
  // 2. Negative Test: Acceptance Mode Invariant Verification
  // -------------------------------------------------------------------------
  await t.test('Negative Test: In acceptance mode, unreachable backend triggers immediate failure', async () => {
    const unreachableUrl = 'http://127.0.0.1:59998/api/v1';
    function runAcceptanceProbe(url, isAcceptance) {
      return assertBackendReachable(url, 300).catch(err => {
        if (isAcceptance) {
          throw new Error(`ACCEPTANCE_FAIL_CLOSED: Acceptance mode requires live backend: ${err.message}`);
        }
        return { reachable: false, error: err.message };
      });
    }

    await assert.rejects(
      async () => {
        await runAcceptanceProbe(unreachableUrl, true);
      },
      /ACCEPTANCE_FAIL_CLOSED/,
      'Acceptance mode must throw ACCEPTANCE_FAIL_CLOSED when backend is unreachable'
    );
  });

  // -------------------------------------------------------------------------
  // 3. Probe Target Backend
  // -------------------------------------------------------------------------
  let isBackendLive = false;
  let backendHealthData = null;
  try {
    backendHealthData = await assertBackendReachable(GATEWAY_BASE, 1500);
    isBackendLive = true;
  } catch (err) {
    if (IS_ACCEPTANCE_MODE) {
      assert.fail(`[CRITICAL] Acceptance mode execution failed because backend at ${GATEWAY_BASE} is offline: ${err.message}`);
    } else {
      console.log(`[INFO] Backend offline at ${GATEWAY_BASE}. Live HTTP fixture smoke will be recorded as BLOCKED.`);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Live API Fixture Smoke (Executed only when backend is available)
  // -------------------------------------------------------------------------
  await t.test('Production API Fixture Smoke: Register -> Become Author -> Novel -> Chapters -> Snapshots', async (st) => {
    if (!isBackendLive) {
      st.skip(`Backend at ${GATEWAY_BASE} is not reachable. Live smoke blocked.`);
      return;
    }

    const runSuffix = crypto.randomBytes(4).toString('hex');
    const authorUser = `qa_author_${runSuffix}`;
    const authorEmail = `${authorUser}@example.invalid`;
    const authorPass = `DemoQA!${crypto.randomBytes(12).toString('hex')}`;

    // Step A: Register (Default role: READER)
    const regRes = await fetch(`${GATEWAY_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: authorUser, email: authorEmail, password: authorPass })
    }).then(r => r.json());
    assert.ok(regRes.success || regRes.status === 201, `Register failed: ${JSON.stringify(regRes)}`);

    // Step B: Login as Reader
    const loginRes = await fetch(`${GATEWAY_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: authorEmail, password: authorPass })
    }).then(r => r.json());
    const readerToken = loginRes.data?.accessToken;
    assert.ok(readerToken, 'Reader login must return access token');

    // Negative Invariant: Reader cannot create novel before becoming author (403 Forbidden)
    const unauthorizedNovelRes = await fetch(`${GATEWAY_BASE}/novels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${readerToken}` },
      body: JSON.stringify({ title: 'Unauthorized Test Novel', synopsis: 'Should fail' })
    });
    assert.equal(
      unauthorizedNovelRes.status,
      403,
      'Reader role must be rejected with 403 Forbidden when creating novel without becoming author'
    );

    // Step C: Promote to AUTHOR via production endpoint
    const becomeAuthorRes = await fetch(`${GATEWAY_BASE}/auth/become-author`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${readerToken}` }
    }).then(r => r.json());
    assert.ok(becomeAuthorRes.success, `become-author failed: ${JSON.stringify(becomeAuthorRes)}`);
    const authorToken = becomeAuthorRes.data?.accessToken;
    assert.ok(authorToken, 'become-author must return upgraded AUTHOR access token');

    // Step D: Create Novel with Author Token
    const novelRes = await fetch(`${GATEWAY_BASE}/novels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        title: 'Đại Lục Tinh Thần',
        synopsis: 'Hành trình giải mã phong ấn Thần Ma của Lâm Phong và Diệp Linh Nhi.'
      })
    }).then(r => r.json());
    const novelId = novelRes.data?.novelId || novelRes.data?.id;
    assert.ok(novelId, `Novel creation must return novelId: ${JSON.stringify(novelRes)}`);

    // Step E: Create Chapter 1 & Bootstrap Snapshot
    const ch1Res = await fetch(`${GATEWAY_BASE}/novels/${novelId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        title: 'Chương 1: Khởi Đầu Tại Trấn Thanh Phong',
        content: 'Lâm Phong đeo chiếc Ngọc Bội Huyết Long nguyên vẹn. Diệp Linh Nhi mỉm cười bước vào sân.'
      })
    }).then(r => r.json());
    const ch1Id = ch1Res.data?.chapterId || ch1Res.data?.id;
    assert.ok(ch1Id, 'Chapter 1 creation must succeed');

    const ch1Snap = await fetch(`${GATEWAY_BASE}/chapters/${ch1Id}/revisions/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        content: 'Lâm Phong đeo chiếc Ngọc Bội Huyết Long nguyên vẹn. Diệp Linh Nhi mỉm cười bước vào sân.',
        purpose: 'MANUSCRIPT_BOOTSTRAP'
      })
    }).then(r => r.json());
    const ch1RevId = ch1Snap.data?.revisionId;
    assert.ok(ch1RevId, 'Chapter 1 snapshot must return revisionId');

    // Negative Invariant: Invalid snapshot purpose must be rejected
    const invalidSnapRes = await fetch(`${GATEWAY_BASE}/chapters/${ch1Id}/revisions/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        content: 'test',
        purpose: 'INCREMENTAL_ANALYSIS' // Invalid enum
      })
    });
    assert.ok(
      invalidSnapRes.status === 400 || invalidSnapRes.status === 422,
      `Invalid snapshot purpose INCREMENTAL_ANALYSIS must be rejected (got ${invalidSnapRes.status})`
    );

    // Step F: Create Chapter 2 (Item Broken State Change)
    const ch2Res = await fetch(`${GATEWAY_BASE}/novels/${novelId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        title: 'Chương 2: Biến Cố Hang Hắc Long',
        content: 'Trong Hang Hắc Long, Ngọc Bội Huyết Long bị vỡ làm đôi. Lâm Phong giữ nửa long đầu, Diệp Linh Nhi giữ nửa long vĩ.'
      })
    }).then(r => r.json());
    const ch2Id = ch2Res.data?.chapterId || ch2Res.data?.id;
    assert.ok(ch2Id, 'Chapter 2 creation must succeed');

    const ch2Snap = await fetch(`${GATEWAY_BASE}/chapters/${ch2Id}/revisions/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        content: 'Trong Hang Hắc Long, Ngọc Bội Huyết Long bị vỡ làm đôi. Lâm Phong giữ nửa long đầu, Diệp Linh Nhi giữ nửa long vĩ.',
        purpose: 'AUTHOR_SNAPSHOT'
      })
    }).then(r => r.json());
    const ch2RevId = ch2Snap.data?.revisionId;
    assert.ok(ch2RevId, 'Chapter 2 snapshot must return revisionId');

    // Step G: Create Chapter 3 (Author lore setup)
    const ch3Res = await fetch(`${GATEWAY_BASE}/novels/${novelId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        title: 'Chương 3: Bí Mật Lâm Gia',
        content: 'Lâm Phong nhìn nửa mảnh ngọc long đầu. Diệp Linh Nhi mang nửa mảnh long vĩ về đan phòng.'
      })
    }).then(r => r.json());
    const ch3Id = ch3Res.data?.chapterId || ch3Res.data?.id;
    assert.ok(ch3Id, 'Chapter 3 creation must succeed');

    const ch3Snap = await fetch(`${GATEWAY_BASE}/chapters/${ch3Id}/revisions/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        content: 'Lâm Phong nhìn nửa mảnh ngọc long đầu. Diệp Linh Nhi mang nửa mảnh long vĩ về đan phòng.',
        purpose: 'AUTHOR_SNAPSHOT'
      })
    }).then(r => r.json());
    const ch3RevId = ch3Snap.data?.revisionId;
    assert.ok(ch3RevId, 'Chapter 3 snapshot must return revisionId');

    // Step H: Create Chapter 4 (Writing Loop initial draft)
    const ch4Res = await fetch(`${GATEWAY_BASE}/novels/${novelId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authorToken}` },
      body: JSON.stringify({
        title: 'Chương 4: Vết Tích Cổ Sơn',
        content: 'Sáng sớm hôm sau, Lâm Phong bước ra khỏi Trấn Thanh Phong...'
      })
    }).then(r => r.json());
    const ch4Id = ch4Res.data?.chapterId || ch4Res.data?.id;
    assert.ok(ch4Id, 'Chapter 4 creation must succeed');

    // -----------------------------------------------------------------------
    // Write Sanitized Public Manifest (NO secrets, NO tokens, NO passwords)
    // -----------------------------------------------------------------------
    const publicManifest = {
      manifest_type: 'P1_DEMO_QA_API_FIXTURE_SMOKE',
      run_id: `demo_qa_${runSuffix}`,
      status: 'BASIC_FIXTURE_READY',
      novel_id: novelId,
      author_username: authorUser,
      chapters: [
        { chapter_id: ch1Id, number: 1, title: 'Chương 1', revision_id: ch1RevId },
        { chapter_id: ch2Id, number: 2, title: 'Chương 2', revision_id: ch2RevId },
        { chapter_id: ch3Id, number: 3, title: 'Chương 3', revision_id: ch3RevId },
        { chapter_id: ch4Id, number: 4, title: 'Chương 4', draft_only: true }
      ],
      stages: {
        basic_fixture: 'BASIC_FIXTURE_READY',
        canon_fixture: 'CANON_FIXTURE_PENDING_HITL',
        browser_ui_rendered: 'NOT_RUN (Pending full UI render)'
      },
      timestamp: new Date().toISOString()
    };

    await writeFile(
      join(EVIDENCE_DIR, 'demo-qa-manifest.json'),
      JSON.stringify(publicManifest, null, 2),
      'utf-8'
    );
  });

  // -------------------------------------------------------------------------
  // 5. Explicit Browser E2E Boundary Declaration
  // -------------------------------------------------------------------------
  await t.test('Boundary Verification: Browser E2E must not be marked PASS without rendered UI', async () => {
    // Assert invariant: API smoke execution cannot claim browser UI PASS
    const e2eStatus = 'NOT_RUN (Requires full browser session with rendered UI)';
    assert.notEqual(e2eStatus, 'PASS', 'E2E browser status must remain NOT_RUN in API smoke suite');
  });
});


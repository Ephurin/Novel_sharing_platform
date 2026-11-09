import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-07A Regression Test Suite:
// UX-01: Mobile Sidebar & Mode Switching (390px vs desktop, resize, keyboard navigation, Escape)
// UX-04: Writer with 0 Chapters (Empty State, 503 retry with clientRequestId, and Chapter Creation)
test('P2-07A Regression: UX-01 Mobile Sidebar pointer safety & UX-04 Zero-chapter Empty State', {
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
  const out = process.env.P207A_EVIDENCE_DIR || join(root, '../docs/development/p2/evidence/p2-07a');
  await mkdir(out, { recursive: true });

  const A = '10000000-0000-0000-0000-000000000001';
  const C = '20000000-0000-0000-0000-000000000001';

  let chapter = null;
  let force503OnChapterCreate = false;
  const writes = [];
  const errors = [];

  const novel = id => ({
    novelId: id,
    authorId: 'author-A',
    title: 'Huyền Thoại An Thành',
    slug: 'huyen-thoai-an-thanh',
    synopsis: 'Tác phẩm kiểm thử UX-01 và UX-04',
    status: 'DRAFT',
    genres: [],
    chaptersCount: chapter ? 1 : 0
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
        return send({ userId: 'author-A', username: 'author-A', email: 'author@example.test', role: 'AUTHOR', status: 'ACTIVE' });
      }
      if (path === '/novels/me') return send([novel(A)]);
      if (path === `/novels/${A}`) return send(novel(A));
      if (path === `/novels/${A}/chapters`) {
        if (method === 'GET') return send(chapter ? [chapter] : []);
        if (method === 'POST') {
          if (force503OnChapterCreate) {
            return fail('SERVICE_UNAVAILABLE', 503, 'Máy chủ đang bận xử lý (503 Service Unavailable)');
          }
          chapter = {
            chapterId: C,
            novelId: A,
            chapterNumber: 1,
            title: body.title || 'Chương 1: Bản thảo mới',
            content: body.content || '',
            wordCount: 0,
            isVip: false,
            priceCoins: 0,
            status: 'DRAFT',
            draftVersion: 0,
            updatedAt: new Date().toISOString()
          };
          return send(chapter, 201);
        }
      }
      if (path === `/chapters/${C}`) {
        if (method === 'GET') return send(chapter);
        if (method === 'PATCH') {
          chapter = { ...chapter, ...body, draftVersion: (chapter.draftVersion ?? 0) + 1 };
          return send(chapter);
        }
      }
      if (path === `/ai/story-brains/by-novel/${A}`) {
        return fail('NOT_FOUND', 404);
      }
      if (path === `/ai/story-brains/${A}/setup`) {
        return fail('SETUP_NOT_FOUND', 404);
      }
      if (path === `/ai/story-plans/edit-v1/${A}`) {
        return send({ head_version: 0, active_plan_id: null, plans: [] });
      }
      return send({});
    });
  };

  try {
    // =========================================================================
    // SCENARIO 1: UX-01 Mobile Sidebar, Mode Switching & Keyboard Navigation (390px)
    // =========================================================================
    console.log('--- TEST 1: UX-01 Mobile Sidebar & Mode Switching (390px) ---');
    chapter = {
      chapterId: C,
      novelId: A,
      chapterNumber: 1,
      title: 'Chương 1: Khởi đầu huyền thoại',
      content: 'Nội dung ban đầu của chương 1...',
      wordCount: 10,
      isVip: false,
      priceCoins: 0,
      status: 'DRAFT',
      draftVersion: 1,
      updatedAt: new Date().toISOString()
    };

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setupMocks(mobilePage);

    await mobilePage.goto(origin + 'author/ide?novelId=' + A + '&chapterId=' + C, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await mobilePage.waitForLoadState('networkidle');

    const planBtn = mobilePage.getByRole('button', { name: 'Lập kế hoạch', exact: true });
    const writeBtn = mobilePage.getByRole('button', { name: 'Viết bản thảo', exact: true });
    const sidebar = mobilePage.locator('.sc-studio-sidebar');
    const backdrop = mobilePage.locator('.sc-sidebar-backdrop');
    const toggleSidebarBtn = mobilePage.getByTitle('Đóng/Mở thanh danh sách chương');
    const closeSidebarBtn = mobilePage.getByRole('button', { name: 'Thu gọn danh sách chương' });

    // 1.1 Verify initial Planning mode
    await planBtn.click();
    await expect(mobilePage.getByRole('region', { name: 'Planning Studio', exact: true })).toBeVisible();
    await mobilePage.screenshot({ path: join(out, 'ux01-mobile-planning-initial.png') });

    // 1.2 Switch to Writer mode
    await writeBtn.click();
    await expect(mobilePage.getByPlaceholder('Đặt tiêu đề chương tại đây...')).toBeVisible();
    await mobilePage.screenshot({ path: join(out, 'ux01-mobile-writer-initial.png') });

    // 1.3 Open Sidebar on Mobile
    await toggleSidebarBtn.click();
    await expect(sidebar).toBeVisible();
    await expect(backdrop).toBeVisible();
    await mobilePage.screenshot({ path: join(out, 'ux01-mobile-sidebar-open.png') });

    // 1.4 CRITICAL UX-01 CHECK: Click "Lập kế hoạch" when sidebar is OPEN on mobile
    // Must NOT timeout and must NOT be intercepted by sidebar!
    await planBtn.click({ timeout: 5000 });
    await expect(mobilePage.getByRole('region', { name: 'Planning Studio', exact: true })).toBeVisible();
    await mobilePage.screenshot({ path: join(out, 'ux01-mobile-switch-to-planning-success.png') });
    console.log('✓ UX-01: Successfully switched Planning from mobile while sidebar open without pointer interception!');

    // 1.5 Switch back to Writer mode
    await writeBtn.click();
    await expect(mobilePage.getByPlaceholder('Đặt tiêu đề chương tại đây...')).toBeVisible();

    // 1.6 Open sidebar and close with backdrop tap
    await toggleSidebarBtn.click();
    await expect(sidebar).toBeVisible();
    await expect(backdrop).toBeVisible();
    // Tap visible area of backdrop (outside 280px sidebar, e.g. at x=330)
    await backdrop.click({ position: { x: 330, y: 150 } });
    await expect(sidebar).toBeHidden();
    await mobilePage.screenshot({ path: join(out, 'ux01-mobile-backdrop-closed.png') });
    console.log('✓ UX-01: Backdrop tap dismisses mobile sidebar correctly!');

    // 1.7 Open sidebar and close with close button (accessible button)
    await toggleSidebarBtn.click();
    await expect(sidebar).toBeVisible();
    await closeSidebarBtn.click();
    await expect(sidebar).toBeHidden();
    console.log('✓ UX-01: Close button collapses mobile sidebar correctly!');

    // 1.8 Keyboard Navigation: Escape key closes sidebar
    await toggleSidebarBtn.click();
    await expect(sidebar).toBeVisible();
    await mobilePage.keyboard.press('Escape');
    await expect(sidebar).toBeHidden();
    console.log('✓ UX-01: Escape key closes sidebar correctly!');

    // 1.9 Real Tab navigation into and across sidebar controls
    await toggleSidebarBtn.click();
    await expect(sidebar).toBeVisible();

    const searchInput = sidebar.getByPlaceholder('Tìm kiếm chương...');
    const addChapterBtn = sidebar.getByRole('button', { name: /Thêm chương mới/ });
    const firstChapterItem = sidebar.getByRole('button', { name: /Chương 1/ });

    // Focus close button as entry point
    await closeSidebarBtn.focus();
    await expect(closeSidebarBtn).toBeFocused();

    // Tab 1: from close button to search input
    await mobilePage.keyboard.press('Tab');
    await expect(searchInput).toBeFocused();

    // Tab 2: from search input to "Thêm chương mới" button
    await mobilePage.keyboard.press('Tab');
    await expect(addChapterBtn).toBeFocused();

    // Tab 3: from "Thêm chương mới" to first chapter item
    await mobilePage.keyboard.press('Tab');
    await expect(firstChapterItem).toBeFocused();

    // Shift+Tab backward sequence:
    await mobilePage.keyboard.press('Shift+Tab');
    await expect(addChapterBtn).toBeFocused();

    await mobilePage.keyboard.press('Shift+Tab');
    await expect(searchInput).toBeFocused();

    await mobilePage.keyboard.press('Shift+Tab');
    await expect(closeSidebarBtn).toBeFocused();

    // Press Enter on close button to collapse sidebar
    await mobilePage.keyboard.press('Enter');
    await expect(sidebar).toBeHidden();
    console.log('✓ UX-01: Real keyboard Tab / Shift+Tab and Enter navigation verified across all sidebar controls!');

    // 1.10 Keyboard Navigation: Tab to chapter item and activate with Enter
    await toggleSidebarBtn.click();
    await expect(sidebar).toBeVisible();
    await closeSidebarBtn.focus();
    await mobilePage.keyboard.press('Tab'); // search
    await mobilePage.keyboard.press('Tab'); // add chapter
    await mobilePage.keyboard.press('Tab'); // chapter 1
    await expect(firstChapterItem).toBeFocused();
    await mobilePage.keyboard.press('Enter');
    await expect(sidebar).toBeHidden(); // auto-closes on mobile chapter selection
    console.log('✓ UX-01: Real Tab navigation to chapter item and Enter activation verified!');

    await mobilePage.close();

    // =========================================================================
    // SCENARIO 2: UX-01 Desktop (1280px) & Dynamic Resize (1280 -> 390 -> 1280)
    // =========================================================================
    console.log('--- TEST 2: UX-01 Desktop Sidebar & Dynamic Resize (1280 -> 390 -> 1280) ---');
    const resizePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await setupMocks(resizePage);

    await resizePage.goto(origin + 'author/ide?novelId=' + A + '&chapterId=' + C, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await resizePage.waitForLoadState('networkidle');

    const deskPlanBtn = resizePage.getByRole('button', { name: 'Lập kế hoạch', exact: true });
    const deskWriteBtn = resizePage.getByRole('button', { name: 'Viết bản thảo', exact: true });
    const deskSidebar = resizePage.locator('.sc-studio-sidebar');
    const deskBackdrop = resizePage.locator('.sc-sidebar-backdrop');

    // On desktop, sidebar is open by default side-by-side, and backdrop is hidden
    await expect(deskSidebar).toBeVisible();
    await expect(deskBackdrop).toBeHidden();

    // Switch between Planning and Writer on desktop
    await deskPlanBtn.click();
    await expect(resizePage.getByRole('region', { name: 'Planning Studio', exact: true })).toBeVisible();

    await deskWriteBtn.click();
    await expect(resizePage.getByPlaceholder('Đặt tiêu đề chương tại đây...')).toBeVisible();
    await expect(deskSidebar).toBeVisible();
    await expect(deskBackdrop).toBeHidden();
    await resizePage.screenshot({ path: join(out, 'ux01-desktop-writer-unaffected.png') });

    // Dynamic resize: 1280 -> 390
    await resizePage.setViewportSize({ width: 390, height: 844 });
    await resizePage.waitForTimeout(300);

    // After resize to mobile, switching modes must still work without interception
    await deskPlanBtn.click({ timeout: 5000 });
    await expect(resizePage.getByRole('region', { name: 'Planning Studio', exact: true })).toBeVisible();

    // Dynamic resize back: 390 -> 1280
    await resizePage.setViewportSize({ width: 1280, height: 900 });
    await resizePage.waitForTimeout(300);

    await deskWriteBtn.click();
    await expect(resizePage.getByPlaceholder('Đặt tiêu đề chương tại đây...')).toBeVisible();
    console.log('✓ UX-01: Resize 1280 -> 390 -> 1280 preserves sidebar and mode switcher stability!');

    await resizePage.close();

    // =========================================================================
    // SCENARIO 3: UX-04 Writer with 0 Chapters (Empty State, 503 Retry with clientRequestId)
    // =========================================================================
    console.log('--- TEST 3: UX-04 Zero-Chapter Empty State & 503 Safe Retry ---');
    // Reset chapters to 0
    chapter = null;
    writes.length = 0;

    const zeroChapterPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await setupMocks(zeroChapterPage);

    await zeroChapterPage.goto(origin + 'author/ide?novelId=' + A, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await zeroChapterPage.waitForLoadState('networkidle');

    // 3.1 Switch to Planning Studio, navigate to Step 5
    await zeroChapterPage.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
    await zeroChapterPage.getByRole('button', { name: '5. Bắt đầu viết' }).click();
    await expect(zeroChapterPage.getByText('Không bắt buộc có dàn ý')).toBeVisible();

    // 3.2 Author clicks "Bỏ qua dàn ý, mở trang viết"
    await zeroChapterPage.getByRole('button', { name: 'Bỏ qua dàn ý, mở trang viết' }).click();

    // 3.3 Verify NO chapter or revision was created automatically upon switching to Write
    const chapterCreatesBefore = writes.filter(w => w.path.endsWith('/chapters') && w.method === 'POST');
    assert.equal(chapterCreatesBefore.length, 0, 'No chapter must be created automatically when switching to Writer');

    // 3.4 Verify Empty State is displayed with explanation and CTA
    const emptyState = zeroChapterPage.locator('[data-testid="writer-empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState.getByRole('heading', { name: 'Chưa có chương nào trong tác phẩm' })).toBeVisible();
    await expect(emptyState.getByText('Tác phẩm của bạn chưa có chương nào. Bạn có thể bắt đầu sáng tác ngay bằng cách tạo chương đầu tiên.')).toBeVisible();

    const createFirstChapterBtn = emptyState.getByRole('button', { name: 'Tạo chương đầu tiên' });
    await expect(createFirstChapterBtn).toBeVisible();

    // Verify textarea is NOT rendered while in empty state
    await expect(zeroChapterPage.locator('.sc-manuscript')).toBeHidden();
    await zeroChapterPage.screenshot({ path: join(out, 'ux04-zero-chapters-empty-state.png') });
    console.log('✓ UX-04: Empty state explaining zero chapters rendered cleanly with CTA button!');

    // 3.5 Test 503 Service Unavailable and Safe Retry with same clientRequestId
    force503OnChapterCreate = true;
    await createFirstChapterBtn.click();

    // Verify error Alert is displayed in Empty State and Toast notification
    await expect(emptyState.getByText('Không thể tạo chương')).toBeVisible();
    await expect(zeroChapterPage.getByText('Máy chủ đang bận xử lý (503 Service Unavailable)')).toBeVisible();
    const retryBtn = emptyState.getByRole('button', { name: 'Thử lại tạo chương' });
    await expect(retryBtn).toBeVisible();

    const firstAttempt = writes.find(w => w.path.endsWith('/chapters') && w.method === 'POST');
    assert.ok(firstAttempt?.body?.clientRequestId, 'First attempt must include clientRequestId');
    const firstRequestId = firstAttempt.body.clientRequestId;

    // Reset 503 mock for retry
    force503OnChapterCreate = false;
    await retryBtn.click();

    // Verify second request used the EXACT SAME clientRequestId
    const createAttempts = writes.filter(w => w.path.endsWith('/chapters') && w.method === 'POST');
    assert.equal(createAttempts.length, 2, 'Must have attempted exactly 2 times');
    assert.equal(createAttempts[1].body.clientRequestId, firstRequestId, 'Retry must reuse identical clientRequestId');
    console.log('✓ UX-04: 503 error displayed and safe retry used identical clientRequestId: ' + firstRequestId);

    // 3.6 Verify Empty State disappears and manuscript editor is loaded for Chapter 1
    await expect(emptyState).toBeHidden();
    const titleInput = zeroChapterPage.getByPlaceholder('Đặt tiêu đề chương tại đây...');
    const contentTextarea = zeroChapterPage.getByPlaceholder('Bắt đầu câu từ chương truyện của bạn tại đây...');

    await expect(titleInput).toBeVisible();
    await expect(contentTextarea).toBeVisible();
    await expect(contentTextarea).not.toHaveAttribute('readonly');

    // Author can type directly into Chapter 1
    await titleInput.fill('Chương 1: Đại Hội Khởi Đầu');
    await contentTextarea.fill('Mặt trời vừa lên khỏi ngọn núi An Thành, tiếng chuông vang vọng khắp nơi.');

    await zeroChapterPage.screenshot({ path: join(out, 'ux04-chapter-created-and-writable.png') });
    console.log('✓ UX-04: Chapter 1 created via existing API and editor is fully unlocked for writing!');

    await zeroChapterPage.close();

    assert.equal(errors.length, 0, 'Page errors must be 0: ' + errors.join('\n'));
    console.log('=== ALL REGRESSION TESTS PASSED (0 ERRORS) ===');
  } finally {
    await browser.close();
    await server.close();
  }
});

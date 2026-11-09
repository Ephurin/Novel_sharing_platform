import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-07A Regression Test Suite:
// UX-01: Mobile Sidebar & Mode Switching (390px vs desktop)
// UX-04: Writer with 0 Chapters (Empty State & First Chapter Creation)
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
      const fail = (code, status = 404) => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code, message: code } })
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
    // SCENARIO 1: UX-01 Mobile Sidebar & Mode Switching (390px Viewport)
    // =========================================================================
    console.log('--- TEST 1: UX-01 Mobile Sidebar & Mode Switching (390px) ---');
    // Pre-seed 1 chapter for Scenario 1
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

    await mobilePage.goto(origin + 'author/ide?novelId=' + A + '&chapterId=' + C);
    await mobilePage.waitForLoadState('networkidle');

    const planBtn = mobilePage.getByRole('button', { name: 'Lập kế hoạch', exact: true });
    const writeBtn = mobilePage.getByRole('button', { name: 'Viết bản thảo', exact: true });
    const sidebar = mobilePage.locator('.sc-studio-sidebar');
    const backdrop = mobilePage.locator('.sc-sidebar-backdrop');
    const toggleSidebarBtn = mobilePage.getByTitle('Đóng/Mở thanh danh sách chương');
    const closeSidebarBtn = mobilePage.getByTitle('Thu gọn danh sách');

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

    // 1.7 Open sidebar and close with close button (first_page)
    await toggleSidebarBtn.click();
    await expect(sidebar).toBeVisible();
    await closeSidebarBtn.click();
    await expect(sidebar).toBeHidden();
    console.log('✓ UX-01: Close button collapses mobile sidebar correctly!');

    await mobilePage.close();

    // =========================================================================
    // SCENARIO 2: UX-01 Desktop Sidebar & Mode Switching (1280x900 Viewport)
    // =========================================================================
    console.log('--- TEST 2: UX-01 Desktop Sidebar & Mode Switching (1280x900) ---');
    const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await setupMocks(desktopPage);

    await desktopPage.goto(origin + 'author/ide?novelId=' + A + '&chapterId=' + C);
    await desktopPage.waitForLoadState('networkidle');

    const deskPlanBtn = desktopPage.getByRole('button', { name: 'Lập kế hoạch', exact: true });
    const deskWriteBtn = desktopPage.getByRole('button', { name: 'Viết bản thảo', exact: true });
    const deskSidebar = desktopPage.locator('.sc-studio-sidebar');
    const deskBackdrop = desktopPage.locator('.sc-sidebar-backdrop');

    // On desktop, sidebar is open by default side-by-side, and backdrop is hidden
    await expect(deskSidebar).toBeVisible();
    await expect(deskBackdrop).toBeHidden();

    // Switch between Planning and Writer on desktop
    await deskPlanBtn.click();
    await expect(desktopPage.getByRole('region', { name: 'Planning Studio', exact: true })).toBeVisible();

    await deskWriteBtn.click();
    await expect(desktopPage.getByPlaceholder('Đặt tiêu đề chương tại đây...')).toBeVisible();
    await expect(deskSidebar).toBeVisible();
    await expect(deskBackdrop).toBeHidden();
    await desktopPage.screenshot({ path: join(out, 'ux01-desktop-writer-unaffected.png') });
    console.log('✓ UX-01: Desktop workspace completely unaffected and side-by-side intact!');

    await desktopPage.close();

    // =========================================================================
    // SCENARIO 3: UX-04 Writer with 0 Chapters (Empty State & First Chapter Creation)
    // =========================================================================
    console.log('--- TEST 3: UX-04 Zero-Chapter Empty State & Creation ---');
    // Reset chapters to 0
    chapter = null;
    writes.length = 0;

    const zeroChapterPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await setupMocks(zeroChapterPage);

    await zeroChapterPage.goto(origin + 'author/ide?novelId=' + A);
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

    // 3.5 Author clicks "Tạo chương đầu tiên"
    await createFirstChapterBtn.click();

    // 3.6 Verify existing createChapter API is called
    const chapterCreatesAfter = writes.filter(w => w.path.endsWith('/chapters') && w.method === 'POST');
    assert.equal(chapterCreatesAfter.length, 1, 'Existing createChapter API must be called exactly once');

    // 3.7 Verify Empty State disappears and manuscript editor is loaded for Chapter 1
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

function parseRgba(cssColor) {
  const nums = cssColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  assert.ok(nums.length >= 3, `Unexpected CSS color: ${cssColor}`);
  if (cssColor.startsWith('color(srgb')) {
    return [nums[0] * 255, nums[1] * 255, nums[2] * 255, nums.length >= 4 ? nums[3] : 1];
  }
  return [nums[0], nums[1], nums[2], nums.length >= 4 ? nums[3] : 1];
}

function parseRgb(cssColor) {
  return parseRgba(cssColor).slice(0, 3);
}

function blendRgba(top, bottom) {
  const a = top[3];
  return [
    Math.round(top[0] * a + bottom[0] * (1 - a)),
    Math.round(top[1] * a + bottom[1] * (1 - a)),
    Math.round(top[2] * a + bottom[2] * (1 - a))
  ];
}

function luminance([r, g, b]) {
  const ch = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrastRatio(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

async function assertElementContrast(locator, label) {
  const colors = await locator.evaluate((el) => {
    const layers = [];
    let cur = el;
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
        layers.push(bg);
        if (/^rgb\(/.test(bg) || (/^color\(srgb /.test(bg) && !bg.includes('/'))) break;
      }
      cur = cur.parentElement;
    }
    const cs = getComputedStyle(el);
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    return { fg: cs.color, layers, theme };
  });
  let effectiveBg = colors.theme === 'dark' ? [23, 23, 21] : [255, 255, 255];
  for (let i = colors.layers.length - 1; i >= 0; i -= 1) {
    effectiveBg = blendRgba(parseRgba(colors.layers[i]), effectiveBg);
  }
  const fgRgba = parseRgba(colors.fg);
  const fg = fgRgba[3] < 1 ? blendRgba(fgRgba, effectiveBg) : fgRgba.slice(0, 3);
  const ratio = contrastRatio(fg, effectiveBg);
  assert.ok(ratio >= 4.5, `${label} must reach WCAG AA 4.5:1, got ${ratio.toFixed(2)}:1 (fg=${colors.fg}, effBg=rgb(${effectiveBg.join(', ')}))`);
}

async function assertPillContrast(buttonLocator, label) {
  await expect(buttonLocator).toHaveCSS('color', 'rgb(36, 25, 21)');
  const colors = await buttonLocator.evaluate((btn) => {
    const pill = btn.querySelector('span[aria-hidden="true"]');
    const btnCs = getComputedStyle(btn);
    const pillCs = pill ? getComputedStyle(pill) : btnCs;
    return { fg: btnCs.color, bg: pillCs.backgroundColor };
  });
  const ratio = contrastRatio(parseRgb(colors.fg), parseRgb(colors.bg));
  assert.ok(ratio >= 4.5, `${label} must reach WCAG AA 4.5:1, got ${ratio.toFixed(2)}:1 (${colors.fg} on ${colors.bg})`);
}

async function assertButtonContrast(buttonLocator, label) {
  const colors = await buttonLocator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fg: cs.color, bg: cs.backgroundColor };
  });
  const ratio = contrastRatio(parseRgb(colors.fg), parseRgb(colors.bg));
  assert.ok(ratio >= 4.5, `${label} must reach WCAG AA 4.5:1, got ${ratio.toFixed(2)}:1 (${colors.fg} on ${colors.bg})`);
}

test('StoryCraft portaled modals, dark-mode WCAG AA contrast, WAI-ARIA tabpanels, 4 delete confirmations, and TagsInput Escape layering', { timeout: 120000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = await createServer({
    root,
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
    plugins: [{
      name: 'storycraft-modals-tabs-a11y',
      configureServer(vite) {
        vite.middlewares.use('/__modals_tabs_a11y', async (req, res, next) => {
          try {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(await vite.transformIndexHtml('/__modals_tabs_a11y', `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/theme-init.js"></script></head><body><div id="root"></div><script type="module">
              import React from 'react';
              import { createRoot } from 'react-dom/client';
              import { createBrowserRouter, RouterProvider } from 'react-router-dom';
              import { Alert, Badge, Button, Group, Stack } from '@mantine/core';
              import { AppProviders } from '/src/app/providers.tsx';
              import { AuthorTheme } from '/src/shared/components/AuthorTheme.tsx';
              import { AnimatedModal } from '/src/shared/components/AnimatedModal.tsx';
              import { AuthorStoryContextPage } from '/src/features/story-context/AuthorStoryContextPage.tsx';
              import { AuthorNovelMetadataPage } from '/src/features/author-projects/AuthorNovelMetadataPage.tsx';
              import { AuthorProfilePage } from '/src/features/profile/ProfilePage.tsx';
              import { AuthorProjectsPage } from '/src/features/author-projects/AuthorProjectsPage.tsx';
              import { AuthorWritingIde } from '/src/features/author-ide/AuthorWritingIde.tsx';
              import { NotificationsPage } from '/src/features/notifications/NotificationsPage.tsx';
              import { useAuthStore } from '/src/features/auth/useAuthStore.ts';
              import '@fontsource/be-vietnam-pro/400.css';
              import '@fontsource/be-vietnam-pro/500.css';
              import '@fontsource/be-vietnam-pro/600.css';
              import '@fontsource-variable/material-symbols-outlined/full.css';
              import '/src/styles.css';
              import '/src/theme/color-mode.css';
              import '/src/theme/refinements.css';

              useAuthStore.getState().setSession({
                accessToken: 'fixture-token',
                user: { userId: 'author-1', username: 'tacgia', displayName: 'Tác giả thử', email: 'author@example.invalid', role: 'AUTHOR', status: 'ACTIVE' }
              });

              const h = React.createElement;
              function PaletteMatrix() {
                const [opened, setOpened] = React.useState(false);
                const colors = ['default', 'terracotta', 'teal', 'green', 'orange', 'yellow', 'red', 'gray'];
                const renderGroup = (prefix) => h(Stack, { gap: 'xs' },
                  h(Group, { gap: 'xs' }, colors.map((c) => h(Button, {
                    key: prefix + '-btn-filled-' + c,
                    ...(c === 'default' ? {} : { color: c }),
                    'data-testid': prefix + '-btn-filled-' + c
                  }, prefix + ' btn ' + c))),
                  h(Group, { gap: 'xs' }, ['default', 'red', 'orange', 'teal', 'gray'].map((c) => h(Button, {
                    key: prefix + '-btn-light-' + c,
                    variant: 'light',
                    ...(c === 'default' ? {} : { color: c }),
                    'data-testid': prefix + '-btn-light-' + c
                  }, prefix + ' light ' + c))),
                  h(Group, { gap: 'xs' }, ['default', 'red', 'gray'].map((c) => h(Button, {
                    key: prefix + '-btn-subtle-' + c,
                    variant: 'subtle',
                    ...(c === 'default' ? {} : { color: c }),
                    'data-testid': prefix + '-btn-subtle-' + c
                  }, prefix + ' subtle ' + c))),
                  h(Group, { gap: 'xs' }, colors.map((c) => h(Badge, {
                    key: prefix + '-badge-filled-' + c,
                    ...(c === 'default' ? {} : { color: c }),
                    'data-testid': prefix + '-badge-filled-' + c
                  }, 'filled ' + c))),
                  h(Group, { gap: 'xs' }, colors.map((c) => h(Badge, {
                    key: prefix + '-badge-light-' + c,
                    variant: 'light',
                    ...(c === 'default' ? {} : { color: c }),
                    'data-testid': prefix + '-badge-light-' + c
                  }, 'light ' + c))),
                  h(Group, { gap: 'xs' }, colors.map((c) => h(Badge, {
                    key: prefix + '-badge-outline-' + c,
                    variant: 'outline',
                    ...(c === 'default' ? {} : { color: c }),
                    'data-testid': prefix + '-badge-outline-' + c
                  }, 'outline ' + c))),
                  h(Stack, { gap: 'xs' }, ['default', 'teal', 'green', 'orange', 'yellow', 'red', 'gray'].map((c) => h(Alert, {
                    key: prefix + '-alert-' + c,
                    title: 'Alert ' + c,
                    ...(c === 'default' ? {} : { color: c }),
                    'data-testid': prefix + '-alert-' + c
                  }, 'Nội dung thông báo ' + c)))
                );
                return h(Stack, { gap: 'md', p: 'md' },
                  h(Button, { onClick: () => setOpened(true), 'data-testid': 'open-palette-modal' }, 'Mở modal bảng màu'),
                  renderGroup('page'),
                  h(AnimatedModal, { opened, onClose: () => setOpened(false), title: 'Kiểm tra bảng màu', size: 'lg' }, renderGroup('modal'))
                );
              }

              const router = createBrowserRouter([
                { path: '/author/context/:novelId', element: h(AuthorTheme, null, h(AuthorStoryContextPage)) },
                { path: '/author/novels/:novelId', element: h(AuthorTheme, null, h(AuthorNovelMetadataPage)) },
                { path: '/authors/:authorId', element: h(AuthorTheme, null, h(AuthorProfilePage)) },
                { path: '/author', element: h(AuthorTheme, null, h(AuthorProjectsPage)) },
                { path: '/author/ide', element: h(AuthorTheme, null, h(AuthorWritingIde)) },
                { path: '/notifications', element: h(AuthorTheme, null, h(NotificationsPage)) },
                { path: '/palette-check', element: h(AuthorTheme, null, h(PaletteMatrix)) }
              ], { basename: '/__modals_tabs_a11y' });

              createRoot(document.getElementById('root')).render(
                h(AppProviders, null, h(RouterProvider, { router }))
              );
            </script></body></html>`));
          } catch (err) {
            next(err);
          }
        });
      }
    }]
  });

  let browser;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}/__modals_tabs_a11y`;
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });

    // ─── Scenario 1: 375px Mobile Dark Mode on /author/context/:novelId ──────
    const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await mobileCtx.newPage();
    const pageErrors = [];
    mobilePage.on('pageerror', (err) => pageErrors.push(err.message));
    await mobilePage.addInitScript(() => localStorage.setItem('storycraft-theme', 'dark'));

    const deletedCalls = [];
    let characters = [
      { characterId: 'char-1', novelId: 'novel-1', name: 'Lâm Phong', role: 'PROTAGONIST', personality: 'Điềm tĩnh', description: 'Kiếm khách trẻ.', notes: '', source: 'AUTHOR_MANUAL' },
      { characterId: 'char-2', novelId: 'novel-1', name: 'Tô Nguyệt', role: 'SUPPORTING', personality: 'Thông tuệ', description: 'Dược sư.', notes: '', source: 'AUTHOR_MANUAL' }
    ];
    let relationships = [
      { relationshipId: 'rel-1', novelId: 'novel-1', sourceCharacterId: 'char-1', targetCharacterId: 'char-2', relationshipType: 'Đồng hành', description: 'Cùng vượt ải.' }
    ];
    let timelineEvents = [
      { eventId: 'ev-1', novelId: 'novel-1', title: 'Khởi hành rời sơn trang', summary: 'Mở đầu hành trình.', eventOrder: 1, chapterId: null, source: 'AUTHOR_MANUAL' }
    ];
    let plotSummaries = [
      { summaryId: 'sum-1', novelId: 'novel-1', scope: 'NOVEL', arcName: null, chapterId: null, startChapterNumber: null, endChapterNumber: null, summary: 'Toàn cảnh hành trình tu kiếm.', source: 'AUTHOR_MANUAL' }
    ];

    const installMocks = async (page) => {
      await page.route('**/api/v1/**', async (route) => {
        const req = route.request();
        const method = req.method();
        const pathname = new URL(req.url()).pathname;
        if (method === 'DELETE') {
          deletedCalls.push(pathname);
          if (pathname.includes('/characters/')) characters = characters.filter((c) => !pathname.endsWith(c.characterId));
          if (pathname.includes('/character-relationships/')) relationships = relationships.filter((r) => !pathname.endsWith(r.relationshipId));
          if (pathname.includes('/timeline-events/')) timelineEvents = timelineEvents.filter((e) => !pathname.endsWith(e.eventId));
          if (pathname.includes('/plot-summaries/')) plotSummaries = plotSummaries.filter((s) => !pathname.endsWith(s.summaryId));
          return route.fulfill({ json: { success: true, data: {} } });
        }
        if (method === 'PATCH' && pathname.endsWith('/chapters/ch-1')) {
          return route.fulfill({ status: 409, json: { success: false, error: { code: 'CONFLICT', message: 'Conflict' } } });
        }
        if (method === 'POST' && pathname.endsWith('/brainstorm')) {
          return route.fulfill({
            json: {
              success: true,
              data: {
                contract_version: 'brainstorm-v1',
                novel_id: 'novel-1',
                story_brain_id: 'brain-1',
                brain_version: 1,
                world_rules: [{ rule_id: 'r-1', fact_key: 'rule_magic', text: 'Linh khí giới hạn theo vùng.', category: 'magic_system', origin: 'model_proposed', status: 'model_proposed', is_canon: false, is_historical: false }],
                characters: [{ character_id: 'c-1', name: 'Hàn Lập', canonical_name: 'Hàn Lập', entity_type: 'character', role: 'protagonist', description: 'Đệ tử ngoại môn.', origin: 'model_proposed', status: 'model_proposed', is_canon: false, is_historical: false }],
                future_events: [{ event_id: 'e-1', target_chapter: 2, title: 'Khảo nghiệm tông môn', text: 'Thí luyện đầu tiên.', origin: 'model_proposed', status: 'model_proposed', is_canon: false, is_historical: false }],
                provenance: { contract_version: 'brainstorm-v1', provider: 'mock', model: 'mock', status: 'model_proposed', grounding_rules_count: 0, grounding_entities_count: 0, timestamp: '2026-11-18T00:00:00Z' }
              }
            }
          });
        }
        if (pathname.endsWith('/ai/story-brains/novel-1/setup') || pathname.endsWith('/ai/story-brains/by-novel/novel-1')) {
          return route.fulfill({ status: 404, json: { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } } });
        }
        let data = [];
        const novel1 = { novelId: 'novel-1', authorId: 'author-1', title: 'Kiếm Ảnh Giang Hồ', synopsis: 'Một tác phẩm thử nghiệm đủ dài hơn năm mươi ký tự cho quy tắc kiểm định.', status: 'DRAFT', serialStatus: 'ONGOING', genre: 'Kiếm hiệp', genres: ['Kiếm hiệp'], tags: [], coverImageUrl: null, viewsCount: 420, likesCount: 15, chaptersCount: 1, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' };
        const novel2 = { novelId: 'novel-2', authorId: 'author-1', title: 'Vân Sơn Lục', synopsis: 'Một tác phẩm thử nghiệm thứ hai cho kiểm tra danh sách và bộ lọc.', status: 'PUBLISHED', serialStatus: 'COMPLETED', genre: 'Tiên hiệp', genres: ['Tiên hiệp'], tags: [], coverImageUrl: null, viewsCount: 800, likesCount: 40, chaptersCount: 5, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' };
        if (pathname.endsWith('/novels/genres')) data = ['Tiên hiệp', 'Huyền huyễn', 'Kiếm hiệp'];
        else if (pathname.endsWith('/novels/me')) data = [novel1, novel2];
        else if (pathname.endsWith('/novels/novel-1')) data = novel1;
        else if (pathname.endsWith('/authors/author-1/profile')) data = { authorId: 'author-1', username: 'tacgia', displayName: 'Tác giả thử', bio: 'Tiểu sử.', totalViews: 1220, totalWords: 12500, followersCount: 35, isFollowing: false, novels: [novel1, novel2] };
        else if (pathname.endsWith('/notifications')) data = [{ notificationId: 'n-1', type: 'NOVEL_CHAPTER_PUBLISHED', status: 'UNREAD', title: 'Chương mới đã xuất bản', content: 'Chương 1 đã được duyệt.', payload: { href: '/author/novels/novel-1' }, createdAt: '2026-11-18T00:00:00Z', readAt: null }];
        else if (pathname.endsWith('/ai/story-plans/edit-v1/novel-1')) data = { head_version: 0, active_plan_id: null, plans: [] };
        else if (pathname.endsWith('/wallet/me') || pathname.endsWith('/wallet')) data = { coinsBalance: 100 };
        else if (pathname.endsWith('/statistics')) data = { ratingAverage: 4.8, followersCount: 35, totalWords: 12500 };
        else if (pathname.endsWith('/earnings')) data = { unlockCoins: 250 };
        else if (pathname.endsWith('/chapters')) data = [{ chapterId: 'ch-1', novelId: 'novel-1', chapterNumber: 1, title: 'Chương mở đầu', content: 'Nội dung bản máy chủ.', status: 'DRAFT', wordCount: 4, isVip: false, priceCoins: 0, draftVersion: 1, updatedAt: '2026-11-02T00:00:00Z' }];
        else if (pathname.endsWith('/chapters/ch-1')) data = { chapterId: 'ch-1', novelId: 'novel-1', chapterNumber: 1, title: 'Chương mở đầu', content: 'Nội dung bản máy chủ.', status: 'DRAFT', wordCount: 4, isVip: false, priceCoins: 0, draftVersion: 1, updatedAt: '2026-11-02T00:00:00Z' };
        else if (pathname.endsWith('/characters')) data = characters;
        else if (pathname.endsWith('/character-relationships')) data = relationships;
        else if (pathname.endsWith('/timeline-events')) data = timelineEvents;
        else if (pathname.endsWith('/plot-summaries')) data = plotSummaries;
        else if (pathname.endsWith('/memory')) data = { brain_version: 1, entities: [], facts: [], aliases: [], events: [], transitions: [] };
        return route.fulfill({ json: { success: true, data, meta: { totalPages: 1 } } });
      });
    };

    await installMocks(mobilePage);
    await mobilePage.goto(`${base}/author/context/novel-1`, { waitUntil: 'domcontentloaded' });
    await expect(mobilePage.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Verify active role filter pill contrast in Dark Mode
    const allRolePill = mobilePage.getByRole('button', { name: /Tất cả \(2\)/ });
    await expect(allRolePill).toBeVisible();
    await assertPillContrast(allRolePill, 'StoryContext dark active role pill');
    const mainRolePill = mobilePage.getByRole('button', { name: 'Tuyến chính', exact: true });
    await mainRolePill.click();
    await assertPillContrast(mainRolePill, 'StoryContext dark selected role pill');
    await allRolePill.click();

    const tablist = mobilePage.getByRole('tablist', { name: 'Danh mục Cẩm nang tác phẩm' });
    const firstTab = tablist.getByRole('tab', { name: /Nhân vật/ });
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');

    // Verify WAI-ARIA tab <-> tabpanel linkage & keyboard navigation across all 5 tabs
    const panelId0 = await firstTab.getAttribute('aria-controls');
    assert.ok(panelId0, 'active tab must expose aria-controls');
    await expect(mobilePage.locator(`[id="${panelId0}"][role="tabpanel"]`)).toBeVisible();

    await firstTab.focus();
    const expectedOrder = [/Mối quan hệ/, /Dòng thời gian/, /Tóm tắt hồi/, /Địa danh & dữ kiện/, /Nhân vật/];
    for (const pattern of expectedOrder) {
      await mobilePage.keyboard.press('ArrowRight');
      const focusedTab = tablist.getByRole('tab', { name: pattern });
      await expect(focusedTab).toBeFocused();
      await expect(focusedTab).toHaveAttribute('aria-selected', 'true');
      const controlled = await focusedTab.getAttribute('aria-controls');
      await expect(mobilePage.locator(`[id="${controlled}"][role="tabpanel"]`)).toBeVisible();
    }
    await mobilePage.keyboard.press('End');
    await expect(tablist.getByRole('tab', { name: /Địa danh & dữ kiện/ })).toBeFocused();
    await mobilePage.keyboard.press('Home');
    await expect(firstTab).toBeFocused();

    // Trigger all 4 destructive delete buttons: verify portaled dark-mode contrast, cancel focus return, and confirm DELETE
    const deleteFlows = [
      { tab: /Nhân vật/, triggerName: 'Xóa nhân vật', selectRow: null, endpointPart: '/characters/char-1' },
      { tab: /Mối quan hệ/, triggerName: 'Xóa mối quan hệ', selectRow: 'Đồng hành', endpointPart: '/character-relationships/rel-1' },
      { tab: /Dòng thời gian/, triggerName: 'Xóa mốc sự kiện', selectRow: 'Khởi hành rời sơn trang', endpointPart: '/timeline-events/ev-1' },
      { tab: /Tóm tắt hồi/, triggerName: 'Xóa bản tóm tắt', selectRow: 'Tóm tắt toàn bộ truyện', endpointPart: '/plot-summaries/sum-1' }
    ];

    for (const flow of deleteFlows) {
      await tablist.getByRole('tab', { name: flow.tab }).click();
      if (flow.selectRow) {
        await mobilePage.getByText(flow.selectRow, { exact: false }).first().click();
      }
      const deleteTrigger = mobilePage.getByRole('button', { name: flow.triggerName, exact: true });
      await expect(deleteTrigger).toBeVisible();
      await deleteTrigger.focus();
      await deleteTrigger.click();

      const modal = mobilePage.getByRole('dialog', { name: 'Xác nhận xóa dữ liệu Cẩm nang', exact: true });
      await expect(modal).toBeVisible();

      const confirmBtn = modal.getByRole('button', { name: 'Xóa', exact: true });
      const colors = await confirmBtn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { fg: cs.color, bg: cs.backgroundColor };
      });
      const ratio = contrastRatio(parseRgb(colors.fg), parseRgb(colors.bg));
      assert.ok(ratio >= 4.5, `Dark-mode portaled delete button must reach WCAG AA 4.5:1, got ${ratio.toFixed(2)}:1 (${colors.fg} on ${colors.bg})`);

      const countBeforeCancel = deletedCalls.length;
      await modal.getByRole('button', { name: 'Hủy', exact: true }).click();
      await expect(modal).toHaveCount(0);
      await expect(deleteTrigger).toBeFocused();
      assert.equal(deletedCalls.length, countBeforeCancel, 'Canceling modal must not send DELETE');

      await deleteTrigger.click();
      await expect(modal).toBeVisible();
      await modal.getByRole('button', { name: 'Xóa', exact: true }).click();
      await expect(modal).toHaveCount(0);
      await expect.poll(() => deletedCalls.some((p) => p.endsWith(flow.endpointPart))).toBe(true);
    }
    assert.deepEqual(pageErrors, []);
    await mobileCtx.close();

    // ─── Scenario 2: Dark Mode /author/novels/:novelId Edit Modal & TagsInput Escape Layering ───
    const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const deskPage = await deskCtx.newPage();
    const deskErrors = [];
    deskPage.on('pageerror', (err) => deskErrors.push(err.message));
    await deskPage.addInitScript(() => localStorage.setItem('storycraft-theme', 'dark'));
    await installMocks(deskPage);

    await deskPage.goto(`${base}/author/novels/novel-1`, { waitUntil: 'domcontentloaded' });
    await expect(deskPage.locator('html')).toHaveAttribute('data-theme', 'dark');

    const novelTabs = deskPage.getByRole('tablist', { name: 'Quản lý chương tác phẩm' });
    const allTab = novelTabs.getByRole('tab', { name: /Danh sách chương/ });
    await allTab.focus();
    await deskPage.keyboard.press('ArrowRight');
    const monoTab = novelTabs.getByRole('tab', { name: 'Phát hành & Thu phí', exact: true });
    await expect(monoTab).toBeFocused();
    const monoPanelId = await monoTab.getAttribute('aria-controls');
    await expect(deskPage.locator(`[id="${monoPanelId}"][role="tabpanel"]`)).toBeVisible();

    const editBtn = deskPage.getByRole('button', { name: 'Chỉnh sửa thông tin', exact: true });
    await editBtn.focus();
    await editBtn.click();

    const editDialog = deskPage.getByRole('dialog', { name: 'Chỉnh sửa thông tin tác phẩm', exact: true });
    await expect(editDialog).toBeVisible();

    // Verify portaled native input & primary save button contrast in Dark Mode
    const modalContrast = await editDialog.evaluate((dialogEl) => {
      const input = dialogEl.querySelector('input[type="text"]');
      const saveBtn = Array.from(dialogEl.querySelectorAll('button')).find((b) => b.textContent?.includes('Lưu thay đổi'));
      const inputCs = getComputedStyle(input);
      const saveCs = getComputedStyle(saveBtn);
      return {
        inputFg: inputCs.color,
        inputBg: inputCs.backgroundColor,
        saveFg: saveCs.color,
        saveBg: saveCs.backgroundColor
      };
    });
    const inputRatio = contrastRatio(parseRgb(modalContrast.inputFg), parseRgb(modalContrast.inputBg));
    const saveRatio = contrastRatio(parseRgb(modalContrast.saveFg), parseRgb(modalContrast.saveBg));
    assert.ok(inputRatio >= 4.5, `Portaled modal input in Dark Mode must reach 4.5:1, got ${inputRatio.toFixed(2)}:1 (${modalContrast.inputFg} on ${modalContrast.inputBg})`);
    assert.ok(saveRatio >= 4.5, `Portaled modal primary save button in Dark Mode must reach 4.5:1, got ${saveRatio.toFixed(2)}:1 (${modalContrast.saveFg} on ${modalContrast.saveBg})`);

    // Open TagsInput dropdown inside AnimatedModal: 1st Escape closes combobox only; 2nd Escape closes modal & restores focus
    const genresInput = editDialog.getByPlaceholder('Chọn hoặc nhập thể loại', { exact: true });
    await genresInput.click();
    await expect(genresInput).toHaveAttribute('data-expanded', 'true');
    await expect(editDialog.getByRole('option', { name: 'Tiên hiệp', exact: true })).toBeVisible();

    await deskPage.keyboard.press('Escape');
    await expect(genresInput).not.toHaveAttribute('data-expanded', 'true');
    await expect(editDialog).toBeVisible();

    await deskPage.keyboard.press('Escape');
    await expect(editDialog).toHaveCount(0);
    await expect(editBtn).toBeFocused();
    assert.deepEqual(deskErrors, []);
    await deskCtx.close();

    // ─── Scenario 3 & 4: Light + Dark WCAG AA contrast on active pills and AuthorWritingIde 409 reload modal ───
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.addInitScript((t) => localStorage.setItem('storycraft-theme', t), theme);
      await installMocks(page);

      // PR195-001: AuthorProfilePage active work-sort pill contrast
      await page.goto(`${base}/authors/author-1`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const sortGroup = page.getByRole('group', { name: 'Sắp xếp tác phẩm' });
      const popularSortBtn = sortGroup.getByRole('button', { name: 'Phổ biến nhất', exact: true });
      await expect(popularSortBtn).toBeVisible();
      await assertPillContrast(popularSortBtn, `AuthorProfilePage ${theme} active work-sort pill`);
      const likedSortBtn = sortGroup.getByRole('button', { name: 'Yêu thích nhất', exact: true });
      await likedSortBtn.click();
      await assertPillContrast(likedSortBtn, `AuthorProfilePage ${theme} selected work-sort pill`);

      // Sibling: AuthorProjectsPage active status pill contrast
      await page.goto(`${base}/author`, { waitUntil: 'domcontentloaded' });
      const allStatusBtn = page.getByRole('button', { name: /Tất cả \(2\)/ });
      await expect(allStatusBtn).toBeVisible();
      await assertPillContrast(allStatusBtn, `AuthorProjectsPage ${theme} active status pill`);
      const draftStatusBtn = page.getByRole('button', { name: /Bản nháp \(1\)/ });
      await draftStatusBtn.click();
      await assertPillContrast(draftStatusBtn, `AuthorProjectsPage ${theme} selected status pill`);

      // PR195-002: AuthorWritingIde 409 conflict reload confirmation <Button color="red"> + variant="filled"
      await page.goto(`${base}/author/ide?novelId=novel-1&chapterId=ch-1`, { waitUntil: 'domcontentloaded' });
      const writeModeBtn = page.getByRole('button', { name: 'Viết bản thảo', exact: true });
      await expect(writeModeBtn).toBeVisible();
      await assertButtonContrast(writeModeBtn, `AuthorWritingIde ${theme} filled mode-switch button`);

      const titleInput = page.getByPlaceholder('Đặt tiêu đề chương tại đây...', { exact: true });
      await expect(titleInput).toHaveValue('Chương mở đầu');
      await titleInput.fill('Chương mở đầu (chưa lưu)');
      await page.keyboard.press('ControlOrMeta+s');

      const reloadBtn = page.getByRole('button', { name: 'Tải bản máy chủ', exact: true });
      await expect(reloadBtn).toBeVisible();
      await reloadBtn.click();

      const reloadModal = page.getByRole('dialog', { name: 'Tải lại bản máy chủ?', exact: true });
      await expect(reloadModal).toBeVisible();
      const confirmReloadBtn = reloadModal.getByRole('button', { name: 'Xác nhận tải bản máy chủ', exact: true });
      await assertButtonContrast(confirmReloadBtn, `AuthorWritingIde ${theme} reload confirmation red button`);

      await reloadModal.getByRole('button', { name: 'Hủy', exact: true }).click();
      await expect(reloadModal).toHaveCount(0);

      // PR195-003 / PR195-004 / PR195-005: Semantic Mantine Button, Badge (filled/light/outline), and Alert contrast in page + portaled AnimatedModal
      await page.goto(`${base}/palette-check`, { waitUntil: 'domcontentloaded' });
      for (const prefix of ['page', 'modal']) {
        if (prefix === 'modal') {
          await page.getByTestId('open-palette-modal').click();
          await expect(page.getByRole('dialog', { name: 'Kiểm tra bảng màu', exact: true })).toBeVisible();
        }
        for (const c of ['default', 'terracotta', 'teal', 'green', 'orange', 'yellow', 'red', 'gray']) {
          const btn = page.getByTestId(`${prefix}-btn-filled-${c}`);
          await assertElementContrast(btn, `${theme} ${prefix} filled Button color="${c}"`);
          await btn.hover();
          await assertElementContrast(btn, `${theme} ${prefix} filled Button hover color="${c}"`);
          await assertElementContrast(page.getByTestId(`${prefix}-badge-filled-${c}`), `${theme} ${prefix} filled Badge color="${c}"`);
          await assertElementContrast(page.getByTestId(`${prefix}-badge-light-${c}`), `${theme} ${prefix} light Badge color="${c}"`);
          await assertElementContrast(page.getByTestId(`${prefix}-badge-outline-${c}`), `${theme} ${prefix} outline Badge color="${c}"`);
        }
        for (const c of ['default', 'red', 'orange', 'teal', 'gray']) {
          await assertElementContrast(page.getByTestId(`${prefix}-btn-light-${c}`), `${theme} ${prefix} light Button color="${c}"`);
        }
        for (const c of ['default', 'red', 'gray']) {
          await assertElementContrast(page.getByTestId(`${prefix}-btn-subtle-${c}`), `${theme} ${prefix} subtle Button color="${c}"`);
        }
        for (const c of ['default', 'teal', 'green', 'orange', 'yellow', 'red', 'gray']) {
          const alert = page.getByTestId(`${prefix}-alert-${c}`);
          await assertElementContrast(alert.locator('.mantine-Alert-title'), `${theme} ${prefix} Alert title color="${c}"`);
          await assertElementContrast(alert.locator('.mantine-Alert-message'), `${theme} ${prefix} Alert message color="${c}"`);
        }
      }

      // PR195-005: NotificationsPage light & outline badges
      await page.goto(`${base}/notifications`, { waitUntil: 'domcontentloaded' });
      const notifCard = page.getByTestId('notification-card-n-1');
      await expect(notifCard).toBeVisible();
      await assertElementContrast(notifCard.getByText('Mới', { exact: true }).locator('..'), `NotificationsPage ${theme} light badge`);
      await assertElementContrast(page.getByTestId('notification-type-NOVEL_CHAPTER_PUBLISHED'), `NotificationsPage ${theme} outline badge`);

      // PR195-003 / PR195-004 / PR195-005: PlanningStudio + BrainstormingModal real call sites
      await page.goto(`${base}/author/ide?novelId=novel-1&chapterId=ch-1`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
      const studio = page.getByRole('region', { name: 'Planning Studio', exact: true });
      await expect(studio).toBeVisible();
      await expect(studio.getByText('Chưa kích hoạt thiết lập', { exact: true })).toBeVisible();
      await assertElementContrast(studio.getByText('Chưa kích hoạt thiết lập', { exact: true }).locator('..'), `PlanningStudio ${theme} gray filled badge`);
      await assertElementContrast(studio.getByText('Chưa có bản thiết lập', { exact: true }).locator('..'), `PlanningStudio ${theme} light badge`);
      await assertElementContrast(studio.getByTestId('planning-memory-from-chapters').locator('.mantine-Alert-message'), `PlanningStudio ${theme} alert message`);

      await studio.getByTestId('brainstorm-open-idea-btn').click();
      const brainstormDialog = page.getByRole('dialog', { name: 'Trợ lý AI Động não (AI Brainstorming)', exact: true });
      await expect(brainstormDialog).toBeVisible();
      await assertElementContrast(brainstormDialog.locator('.mantine-Alert-title').first(), `BrainstormingModal ${theme} draft-only Alert title`);
      await brainstormDialog.getByTestId('brainstorm-submit-btn').click();
      await expect(brainstormDialog.getByTestId('brainstorm-results-container')).toBeVisible();
      await assertElementContrast(brainstormDialog.getByText('World Rules', { exact: true }).locator('..'), `BrainstormingModal ${theme} World Rules light badge`);
      await assertElementContrast(brainstormDialog.getByText('magic_system', { exact: true }).locator('..'), `BrainstormingModal ${theme} teal light badge`);
      await assertElementContrast(brainstormDialog.getByText('Characters', { exact: true }).locator('..'), `BrainstormingModal ${theme} Characters teal filled badge`);
      await assertElementContrast(brainstormDialog.getByText('protagonist', { exact: true }).locator('..'), `BrainstormingModal ${theme} role teal filled badge`);
      await assertElementContrast(brainstormDialog.getByText('Future Events', { exact: true }).locator('..'), `BrainstormingModal ${theme} Future Events orange light badge`);
      await assertElementContrast(brainstormDialog.getByText('Dự kiến Chương 2', { exact: true }).locator('..'), `BrainstormingModal ${theme} outline gray badge`);
      await assertElementContrast(brainstormDialog.getByTestId('adopt-character-btn-0'), `BrainstormingModal ${theme} teal filled Button`);
      await assertElementContrast(brainstormDialog.getByTestId('dismiss-character-btn-0'), `BrainstormingModal ${theme} gray subtle Button`);

      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});

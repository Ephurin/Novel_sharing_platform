import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

test('animated feedback: tabs, toasts, saves, controls, skeletons and real progress', { timeout: 180000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-feedback-'));
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)), server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'feedback-test', configureServer(vite) {
      vite.middlewares.use('/__feedback_test', async (req, res, next) => {
        if (req.url.includes('?')) return next();
        try {
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__feedback_test', `<!doctype html><html lang="vi"><head>
            <meta name="viewport" content="width=device-width, initial-scale=1"><script src="/theme-init.js"></script>
            <style>.material-symbols-outlined { font-family: 'Material Symbols Outlined Variable'; font-size: 18px; line-height: 1; }</style>
            </head><body><div id="root"></div><script type="module">
            import React, { useState } from 'react';
            import { createRoot } from 'react-dom/client';
            import { MemoryRouter, Routes, Route } from 'react-router-dom';
            import { Button, Checkbox, Switch, TextInput } from '@mantine/core';
            import { AppProviders } from '/src/app/providers.tsx';
            import { AuthorTheme } from '/src/shared/components/AuthorTheme.tsx';
            import { AnimatedTabs as Tabs } from '/src/shared/components/AnimatedTabs.tsx';
            import { useToast } from '/src/shared/components/ToastProvider.tsx';
            import { AnimatedSaveButton, SaveStatus } from '/src/shared/components/SaveFeedback.tsx';
            import { LoadingState } from '/src/shared/components/PageStates.tsx';
            import { AnimatedProgress } from '/src/shared/components/AnimatedProgress.tsx';
            import { ReadingProgress } from '/src/shared/components/ReadingProgress.tsx';
            import { ManuscriptImportPage } from '/src/features/manuscript-import/ManuscriptImportPage.tsx';
            import { useAuthStore } from '/src/features/auth/useAuthStore.ts';
            import '@fontsource/be-vietnam-pro/400.css'; import '@fontsource/be-vietnam-pro/500.css';
            import '@fontsource-variable/material-symbols-outlined/full.css';
            import '/src/styles.css'; import '/src/theme/color-mode.css';
            const h = React.createElement;
            function Demo() {
              const { showToast } = useToast();
              const [checked, setChecked] = useState(false), [enabled, setEnabled] = useState(false);
              const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
              const [status, setStatus] = useState('idle'), [dirty, setDirty] = useState(true);
              const [progress, setProgress] = useState(25);
              const save = () => {
                setSaving(true); setSaved(false); setStatus('saving');
                window.finishSave = ok => {
                  setSaving(false); setSaved(ok); setDirty(!ok); setStatus(ok ? 'saved' : 'error');
                  showToast(ok ? 'Đã lưu cấu hình kiểm thử' : 'Không lưu được cấu hình kiểm thử', ok ? 'success' : 'error');
                };
              };
              return h('main', { style: { padding: 24, maxWidth: 900, margin: 'auto' } },
                h(Tabs, { defaultValue: 'draft' },
                  h(Tabs.List, { 'aria-label': 'Bản thảo' }, h(Tabs.Tab, { value: 'draft' }, 'Soạn thảo'), h(Tabs.Tab, { value: 'history' }, 'Lịch sử')),
                  h(Tabs.Panel, { value: 'draft', pt: 'md' }, h(TextInput, { label: 'Tên bản thảo', defaultValue: 'Bản nháp' })),
                  h(Tabs.Panel, { value: 'history', pt: 'md' }, h('p', null, 'Lịch sử đã lưu'))),
                h('section', { style: { display: 'grid', gap: 16, marginTop: 24 } },
                  h(Checkbox, { label: 'Chọn chương', checked, onChange: e => setChecked(e.currentTarget.checked) }),
                  h(Switch, { label: 'Thông báo', checked: enabled, onChange: e => setEnabled(e.currentTarget.checked) }),
                  h(AnimatedSaveButton, { loading: saving, saved, onClick: save }, 'Lưu cấu hình'),
                  h(SaveStatus, { status, dirty, savedAt: '10:30' }),
                  h(LoadingState, { label: 'Đang tải danh sách chương', variant: 'table' }),
                  h(AnimatedProgress, { value: progress, label: 'Nhập chương' }),
                  h(Button, { onClick: () => setProgress(75) }, 'Đã nhập 3/4 chương'),
                  h(Button, { onClick: () => setProgress(null) }, 'Chưa biết tổng số')),
                h('article', { style: { marginTop: 40 } },
                  h(ReadingProgress, null, h('div', { id: 'manuscript', style: { height: 2400, padding: 20, background: 'var(--sc-surface)' } }, 'Nội dung chương'))),
                h('section', { id: 'comments', style: { height: 1800 } }, 'Bình luận'));
            }
            const importMode = location.pathname.endsWith('/import');
            if (importMode) useAuthStore.getState().setSession({ accessToken: 'fixture-token', user: { userId: 'author-test', username: 'tester', email: 'test@example.invalid', role: 'AUTHOR', status: 'ACTIVE' } });
            createRoot(document.getElementById('root')).render(h(AppProviders, null, importMode
              ? h(MemoryRouter, { initialEntries: ['/author/import/novel-test'] }, h(Routes, null, h(Route, { path: '/author/import/:novelId', element: h(AuthorTheme, null, h(ManuscriptImportPage)) })))
              : h(Demo)));
            </script></body></html>`));
        } catch (error) { next(error); }
      });
    }}]
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    for (const theme of ['light', 'dark']) for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: reducedMotion === 'reduce' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, reducedMotion });
      try {
        await context.addInitScript(theme => localStorage.setItem('storycraft-theme', theme), theme);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__feedback_test`);
        const draft = page.getByRole('tab', { name: 'Soạn thảo' });
        const history = page.getByRole('tab', { name: 'Lịch sử', exact: true });
        await expect(draft).toHaveAttribute('aria-selected', 'true');
        await page.getByLabel('Tên bản thảo').fill('Bản nháp được giữ');
        await draft.focus(); await page.keyboard.press('ArrowRight');
        await expect(history).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByText('Lịch sử đã lưu', { exact: true })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Tên bản thảo' })).toHaveCount(0);
        await page.keyboard.press('ArrowLeft');
        await expect(page.getByLabel('Tên bản thảo')).toHaveValue('Bản nháp được giữ');
        await expect(page.locator('[data-slot="tabs-indicator"]')).toHaveCount(1);

        const checkbox = page.getByRole('checkbox', { name: 'Chọn chương' });
        await checkbox.check(); await expect(checkbox).toBeChecked();
        await expect.poll(() => page.locator('.sc-checkbox-stroke').evaluate(el => getComputedStyle(el).strokeDashoffset)).toBe('0px');
        await checkbox.focus(); await page.keyboard.press('Space'); await expect(checkbox).not.toBeChecked();
        const toggle = page.getByRole('switch', { name: 'Thông báo', exact: true });
        await toggle.check(); await expect(toggle).toBeChecked();
        await toggle.focus(); await page.keyboard.press('Space'); await expect(toggle).not.toBeChecked();
        await expect(page.locator('.sc-save-status')).toContainText('Chưa lưu');
        const save = page.locator('button:has(.sc-save-button-label)');
        await expect(save).toHaveAccessibleName('Lưu cấu hình');
        const width = (await save.boundingBox()).width;
        await save.click(); await expect(save).toBeDisabled();
        await expect(page.locator('.sc-save-status')).toContainText('Đang lưu…');
        await page.evaluate(() => window.finishSave(false));
        await expect(page.locator('.sc-save-status')).toContainText('Lỗi lưu đám mây');
        await expect(page.locator('.sc-toast[data-tone="error"]')).toContainText('Không lưu được cấu hình kiểm thử');
        await page.getByRole('button', { name: 'Đóng thông báo' }).click();
        await expect(page.locator('.sc-toast')).toHaveCount(0);
        await save.click(); await page.evaluate(() => window.finishSave(true));
        await expect(page.locator('.sc-save-status')).toContainText('Đã lưu');
        await expect(page.locator('.sc-save-button-icon')).toHaveText('check_circle');
        assert.equal((await page.locator('button:has(.sc-save-button-label)').boundingBox()).width, width);
        await expect(page.locator('.sc-toast[data-tone="success"]')).toContainText('Đã lưu cấu hình kiểm thử');
        const toastBounds = await page.locator('.sc-toast').boundingBox();
        assert.ok(toastBounds.x >= 0 && toastBounds.x + toastBounds.width <= page.viewportSize().width, 'toast must fit inside the reserved scrollbar lane on mobile');

        const progress = page.getByRole('progressbar', { name: 'Nhập chương', exact: true });
        await expect(progress).toHaveAttribute('aria-valuenow', '25');
        await page.getByRole('button', { name: 'Đã nhập 3/4 chương' }).click();
        await expect(progress).toHaveAttribute('aria-valuenow', '75');
        await page.getByRole('button', { name: 'Chưa biết tổng số' }).click();
        assert.equal(await progress.getAttribute('aria-valuenow'), null);
        await expect(progress).toHaveAttribute('data-state', 'indeterminate');
        if (reducedMotion === 'reduce') assert.equal(await page.locator('.sc-skeleton-block').first().evaluate(el => getComputedStyle(el).animationName), 'none');
        await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
        await page.screenshot({ path: path.join(output, `${theme}-${reducedMotion}.png`) });

        const manuscript = await page.locator('#manuscript').evaluate(el => ({ top: el.getBoundingClientRect().top + scrollY, height: el.getBoundingClientRect().height }));
        const reading = page.getByRole('progressbar', { name: 'Tiến độ đọc chương' });
        await page.evaluate(top => scrollTo(0, top), manuscript.top);
        await expect(reading).toHaveAttribute('aria-valuenow', '0');
        await page.evaluate(({ top, height }) => scrollTo(0, top + (height - innerHeight) / 2), manuscript);
        await expect(reading).toHaveAttribute('aria-valuenow', '50');
        await page.locator('#comments').scrollIntoViewIfNeeded();
        await expect(reading).toHaveAttribute('aria-valuenow', '100');
        await page.evaluate(() => scrollTo(0, 0));
        await expect(reading).toHaveAttribute('aria-valuenow', '0');
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    // Exercise real FileReader events and actual import callbacks. Hold snapshot responses
    // so percentages can only advance when the corresponding server work completes.
    for (const failSecond of [false, true]) {
      const context = await browser.newContext({ viewport: failSecond ? { width: 1440, height: 900 } : { width: 390, height: 844 }, reducedMotion: failSecond ? 'no-preference' : 'reduce' });
      await context.addInitScript(theme => localStorage.setItem('storycraft-theme', theme), failSecond ? 'light' : 'dark');
      try {
        const page = await context.newPage();
        let created = 0;
        let releaseFirst, releaseSecond;
        const first = new Promise(resolve => { releaseFirst = resolve; });
        const second = new Promise(resolve => { releaseSecond = resolve; });
        await page.route('**/api/v1/**', async route => {
          const pathname = new URL(route.request().url()).pathname;
          const method = route.request().method();
          let data = {};
          if (pathname.endsWith('/novels/novel-test/chapters')) {
            data = method === 'POST' ? { chapterId: `import-${++created}`, novelId: 'novel-test' } : [];
          } else if (pathname.endsWith('/novels/novel-test')) data = { novelId: 'novel-test', title: 'Tác phẩm thử nghiệm', status: 'DRAFT' };
          else if (pathname.endsWith('/revisions/snapshot')) {
            const isFirst = pathname.includes('import-1');
            await (isFirst ? first : second);
            if (!isFirst && failSecond) return route.fulfill({ status: 500, json: { success: false, error: { message: 'Không lưu được chương thứ hai' } } });
            data = { revisionId: `revision-${created}`, contentHash: 'fixture-hash' };
          } else if (pathname.endsWith('/notifications') || pathname.endsWith('/review-queue')) data = [];
          else if (pathname.includes('/story-brains/')) data = { counts: { entities: 0, events: 0, pending_proposals: 0, open_findings: 0 } };
          return route.fulfill({ json: { success: true, data, meta: { totalItems: 0 } } });
        });
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__feedback_test/import`);
        await expect(page.getByRole('navigation', { name: 'Các bước nhập bản thảo' }).locator('[aria-current="step"]')).toContainText('1. Tải bản thảo');
        if (!failSecond) {
          const content = Array.from({ length: 8 }, (_, index) => `Chương ${index + 1}: ${index === 7 ? '[Chưa có tên]' : 'Tiêu đề hợp lệ'}\nNội dung bản thảo để kiểm tra lỗi.`).join('\n');
          await page.locator('input[type="file"]').setInputFiles({ name: 'loi-ban-thao.txt', mimeType: 'text/plain', buffer: Buffer.from(content) });
          await page.getByRole('button', { name: 'Lỗi tiếp theo', exact: true }).click();
          await expect(page.getByRole('textbox', { name: 'Tiêu đề chương 8', exact: true })).toBeFocused();
          await expect(page.getByText('Trang 2 / 2', { exact: true })).toBeVisible();
          await page.getByRole('checkbox', { name: /Chỉ chương cần sửa/ }).check();
          await expect(page.locator('input[data-chapter-title]')).toHaveCount(1);
          await page.getByRole('textbox', { name: 'Tiêu đề chương 8', exact: true }).fill('Chương 8: Đã sửa tiêu đề');
          await expect(page.getByText('Không có chương cần sửa.', { exact: true })).toBeVisible();
          await page.getByRole('checkbox', { name: /Chỉ chương cần sửa/ }).uncheck();
          await expect(page.getByRole('region', { name: 'Chương trùng nội dung', exact: true })).toContainText('1 nhóm chương');
          await page.getByRole('button', { name: 'Bỏ chọn bản trùng', exact: true }).click();
          await expect(page.getByRole('button', { name: /Xác nhận nhập 1 chương/ })).toBeVisible();
          await page.getByRole('button', { name: 'Xem chương trùng', exact: true }).click();
          await expect(page.getByRole('checkbox', { name: /Chỉ chương trùng/ })).toBeChecked();
          await expect(page.locator('input[data-chapter-title]')).toHaveCount(6);
          await page.getByRole('checkbox', { name: /Chỉ chương trùng/ }).uncheck();
          await page.getByRole('button', { name: 'Cấu hình nâng cao', exact: true }).click();
          await page.locator('.sc-filter-presets summary').filter({ hasText: 'Mẫu tách chương đã lưu' }).click();
          await page.getByRole('textbox', { name: 'Tên mẫu tách chương', exact: true }).fill('Mẫu của tác giả');
          const savedPattern = await page.getByRole('textbox', { name: 'Quy tắc nhận diện Regex', exact: true }).inputValue();
          await page.getByRole('button', { name: 'Lưu mẫu tách chương', exact: true }).click();
          await page.getByRole('textbox', { name: 'Quy tắc nhận diện Regex', exact: true }).fill('[');
          await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
          await expect(page.locator('.sc-toast').filter({ hasText: 'Regex không hợp lệ' })).toBeVisible();
          await page.getByRole('button', { name: 'Mẫu của tác giả', exact: true }).click();
          await expect(page.getByRole('textbox', { name: 'Quy tắc nhận diện Regex', exact: true })).toHaveValue(savedPattern);
          await page.getByRole('button', { name: 'Cấu hình nâng cao', exact: true }).click();
          await page.reload();
          await page.getByRole('button', { name: 'Cấu hình nâng cao', exact: true }).click();
          await page.locator('.sc-filter-presets summary').filter({ hasText: 'Mẫu tách chương đã lưu' }).click();
          await expect(page.getByRole('button', { name: 'Mẫu của tác giả', exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Mẫu của tác giả', exact: true }).click();
          await expect(page.getByRole('textbox', { name: 'Quy tắc nhận diện Regex', exact: true })).toHaveValue(savedPattern);
          await page.getByRole('button', { name: 'Cấu hình nâng cao', exact: true }).click();
        }
        await page.locator('input[type="file"]').setInputFiles({ name: 'ban-thao.txt', mimeType: 'text/plain', buffer: Buffer.from('Chương 1: Bắt đầu\n"Nội dung mở đầu"... của câu chuyện.\n\n\nChương 2: Tiếp tục\nNội dung phần tiếp theo của câu chuyện.') });
        await expect(page.getByRole('progressbar', { name: 'Đã đọc tệp bản thảo' })).toHaveAttribute('aria-valuenow', '100');
        await expect(page.getByRole('navigation', { name: 'Các bước nhập bản thảo' }).locator('[aria-current="step"]')).toContainText('2. Phân tích');
        await page.getByRole('button', { name: 'Cấu hình nâng cao' }).click();
        await page.locator('.sc-normalization-preview summary').click();
        await expect(page.locator('pre[aria-label="Trước chuẩn hóa"]')).toContainText('"Nội dung mở đầu"...');
        await expect(page.locator('pre[aria-label="Sau chuẩn hóa"]')).toContainText('“Nội dung mở đầu”…');
        await page.screenshot({ path: path.join(output, `normalization-${failSecond ? 'failure' : 'success'}.png`), fullPage: true });
        await page.getByRole('checkbox', { name: /Kích hoạt Story Brain AI/ }).uncheck();
        await page.getByRole('checkbox', { name: 'Chọn tất cả chương', exact: true }).check();
        await page.getByRole('button', { name: /Xác nhận nhập 2 chương/ }).click();
        await expect(page.getByRole('progressbar', { name: 'Đã nhập 0/2 chương' })).toHaveAttribute('aria-valuenow', '0');
        releaseFirst();
        await expect(page.getByRole('progressbar', { name: 'Đã nhập 1/2 chương' })).toHaveAttribute('aria-valuenow', '50');
        releaseSecond();
        if (failSecond) {
          await expect(page.getByRole('region', { name: 'Kết quả nhập bản thảo' })).toContainText('1/2 chương hoàn tất');
          await expect(page.getByRole('region', { name: 'Kết quả nhập bản thảo' })).toContainText('Chương đã được tạo nhưng chưa hoàn tất snapshot');
          await expect(page.locator('.sc-toast').filter({ hasText: 'Lỗi nhập chương' })).toBeVisible();
          await expect(page.getByRole('progressbar', { name: 'Đã nhập 1/2 chương' })).toHaveAttribute('aria-valuenow', '50');
          await expect(page.getByRole('navigation', { name: 'Các bước nhập bản thảo' }).locator('[aria-current="step"]')).toContainText('2. Phân tích');
        } else {
          await expect(page.getByRole('region', { name: 'Kết quả nhập bản thảo' })).toContainText('2/2 chương hoàn tất');
          await expect(page.locator('.sc-toast').filter({ hasText: 'Đã nhập thành công 2 chương' })).toBeVisible();
          await expect(page.getByRole('navigation', { name: 'Các bước nhập bản thảo' }).locator('[aria-current="step"]')).toContainText('3. Xác nhận');
        }
      } finally { await context.close(); }
    }
    console.log(`Feedback screenshots: ${output}`);
  } finally { await browser?.close(); await server.close(); }
});

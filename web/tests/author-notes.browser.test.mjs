import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('author footnotes survive edits, undo, autosave and reload, then appear to guests only in the published chapter', { timeout: 180000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-author-notes-'));
  const server = process.env.AUTHOR_NOTES_TEST_BASE_URL ? null : await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const base = process.env.AUTHOR_NOTES_TEST_BASE_URL || `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  try {
    for (const profile of [{ width: 1440, theme: 'light', mode: 'visual' }, { width: 390, theme: 'dark', mode: 'source' }]) {
      const initial = '“Huynh cứ yên tâm”, nàng khẽ nói.\n\nMột câu chuyện mới bắt đầu.';
      let saved = initial, published = initial, version = 1, patches = 0, publications = 0;
      const noteBody = '“Huynh” là cách gọi anh kết nghĩa, không phải anh ruột.\nCách xưng hô này thể hiện sự kính trọng.';
      const updatedBody = noteBody + '\n<script>window.noteExecuted = true</script>';
      const chapter = content => ({ chapterId: 'chapter-1', novelId: 'novel-1', chapterNumber: 1, title: 'Cách xưng hô', status: 'DRAFT', content, isVip: false, priceCoins: 0, draftVersion: version, draft: { content, title: 'Cách xưng hô', version } });
      const authorChapter = () => ({ ...chapter(published), status: 'PUBLISHED', draft: { content: saved, title: 'Cách xưng hô', version } });
      const routeApi = async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        let data = [];
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'author-1', username: 'author', email: 'author@example.invalid', role: 'AUTHOR', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/novels/me')) data = [{ novelId: 'novel-1', title: 'Truyện thử', status: 'DRAFT' }];
        else if (url.pathname.endsWith('/reading/novels/novel-1')) data = { novelId: 'novel-1', title: 'Truyện thử', chapters: [chapter(published)] };
        else if (url.pathname.endsWith('/reading/chapters/chapter-1')) data = chapter(published);
        else if (url.pathname.endsWith('/novels/novel-1/chapters')) data = [authorChapter()];
        else if (url.pathname.endsWith('/novels/novel-1')) data = { novelId: 'novel-1', authorId: 'author-1', title: 'Truyện thử', status: 'DRAFT' };
        else if (url.pathname.endsWith('/chapters/chapter-1/revisions/snapshot')) data = { revisionId: 'revision-1', contentHash: 'test-hash', content: saved };
        else if (url.pathname.endsWith('/chapters/chapter-1/submit-publish')) { publications++; published = saved; data = { chapterId: 'chapter-1', status: 'PUBLISHED', moderationRequired: false }; }
        else if (url.pathname.endsWith('/chapters/chapter-1')) {
          if (method === 'PATCH') { const payload = route.request().postDataJSON(); assert.equal(payload.expectedVersion, version); saved = payload.content; version++; patches++; }
          data = authorChapter();
        }
        await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: Array.isArray(data) ? data.length : 1 } } });
      };
      const context = await browser.newContext({ viewport: { width: profile.width, height: 1000 }, reducedMotion: profile.theme === 'dark' ? 'reduce' : 'no-preference' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(profile => { localStorage.setItem('ephurin_access_token', 'fixture-token'); localStorage.setItem('storycraft-theme', profile.theme); localStorage.setItem('storycraft-studio-editor-mode', profile.mode); }, profile);
      await page.route('**/api/v1/**', routeApi);
      try {
        await page.goto(`${base}/author/ide?novelId=novel-1&chapterId=chapter-1`);
        const canonical = page.locator('textarea.sc-manuscript'), rich = page.locator('[data-studio-rich-editor]');
        await expect(canonical).toHaveValue(initial);
        const select = async (start, end) => canonical.evaluate((el, range) => {
          if (el.hidden) el.dispatchEvent(new CustomEvent('studio-select-source', { detail: { ...range, scroll: false }, cancelable: true }));
          else { el.focus(); el.setSelectionRange(range.start, range.end); el.dispatchEvent(new Event('select', { bubbles: true })); }
        }, { start, end });
        await select(1, 6);
        const selectionTools = page.getByRole('toolbar', { name: 'Công cụ vùng chọn', exact: true });
        await selectionTools.getByRole('button', { name: 'Chú thích vùng chọn cho độc giả', exact: true }).click();
        const notes = page.getByRole('complementary', { name: 'Ghi chú chương', exact: true });
        await expect(notes.getByRole('tab', { name: 'Cho độc giả', exact: true })).toHaveAttribute('aria-selected', 'true');
        await notes.getByRole('textbox', { name: 'Nội dung chú thích', exact: true }).fill(noteBody);
        await notes.getByRole('button', { name: 'Lưu chú thích', exact: true }).click();
        await expect(canonical).toHaveValue(/\[\^author-/);
        const withNote = await canonical.inputValue();
        await (profile.mode === 'source' ? canonical : rich).focus();
        await page.keyboard.press('Control+z'); await expect(canonical).toHaveValue(initial);
        await page.keyboard.press('Control+Shift+z'); await expect(canonical).toHaveValue(withNote);
        await page.keyboard.press('Control+s'); await expect.poll(() => saved).toBe(withNote);
        await expect(notes.getByRole('status', { name: 'Trạng thái công khai chú thích', exact: true })).toContainText('cần xuất bản phiên bản mới');
        await expect(notes.getByText('Chưa có trên bản công khai', { exact: true })).toBeVisible();
        const id = /\[\^(author-[\w-]+)\]/.exec(saved)[1];
        if (profile.mode === 'visual') {
          await expect(rich.locator('.sc-rich-author-note-ref')).toHaveText('[1]');
          await select(0, 0); await page.keyboard.type('Lời dẫn. '); await page.keyboard.press('Control+s');
          await expect.poll(() => saved.startsWith('Lời dẫn. ')).toBe(true);
          assert.ok(saved.includes(`[^${id}]:`), 'typing in the rich editor preserves the serialized note');
        }
        await page.reload(); await expect(canonical).toHaveValue(saved);
        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();
        await notes.getByRole('tab', { name: 'Cho độc giả', exact: true }).click();
        await expect(notes.getByText(noteBody, { exact: true })).toBeVisible();
        await notes.getByRole('button', { name: 'Sửa chú thích', exact: true }).click();
        await notes.getByRole('textbox', { name: 'Nội dung chú thích', exact: true }).fill(updatedBody);
        await notes.getByRole('button', { name: 'Lưu chú thích', exact: true }).click();
        await page.keyboard.press('Control+s'); await expect.poll(() => saved.includes('<script>')).toBe(true);
        const editedNote = await canonical.inputValue();
        await notes.getByRole('button', { name: 'Xóa chú thích', exact: true }).click();
        await expect(canonical).not.toHaveValue(/\[\^author-/);
        await (profile.mode === 'source' ? canonical : rich).focus();
        await page.keyboard.press('Control+z'); await expect(canonical).toHaveValue(editedNote);
        await page.keyboard.press('Control+s'); await expect.poll(() => saved).toBe(editedNote);
        if (profile.mode === 'source') {
          await canonical.fill(saved.replace(`[^${id}]`, ''));
          await expect(notes.getByRole('heading', { name: 'Chú thích chưa gắn vào lời văn', exact: true })).toBeVisible();
          await select(1, 6);
          await notes.getByRole('button', { name: 'Gắn vào vùng chọn / dòng hiện tại', exact: true }).click();
          await page.keyboard.press('Control+s'); await expect.poll(() => saved.includes(`[^${id}]”`) || saved.includes(`[^${id}] `)).toBe(true);
        }
        await page.screenshot({ path: path.join(output, `${profile.width}-studio.png`) });
        await notes.getByRole('button', { name: 'Xem trước như độc giả', exact: true }).click();
        const preview = page.getByRole('dialog', { name: 'Xem bản định dạng', exact: true });
        await expect(preview.getByRole('button', { name: 'Chú thích 1 của tác giả', exact: true })).toBeVisible();
        await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0);
        await page.getByRole('toolbar', { name: 'Công cụ bản thảo', exact: true }).getByRole('button', { name: 'Tệp', exact: true }).click();
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('menuitem', { name: 'Tải bản định dạng HTML', exact: true }).click();
        const download = await downloadPromise, exported = await readFile(await download.path(), 'utf8');
        assert.ok(exported.includes('Chú thích của tác giả'));
        assert.ok(exported.includes('&lt;script&gt;window.noteExecuted = true&lt;/script&gt;'));
        assert.equal(exported.includes(`[^${id}]`), false);
        const guest = await browser.newContext({ viewport: { width: profile.width, height: 900 } });
        const reader = await guest.newPage();
        reader.on('pageerror', error => errors.push(error.message));
        await reader.addInitScript(theme => localStorage.setItem('storycraft-theme', theme), profile.theme);
        await reader.route('**/api/v1/**', routeApi);
        try {
          await reader.goto(`${base}/public/chapters/chapter-1`);
          await expect(reader.locator('.chapter-prose')).toBeVisible();
          await expect(reader.locator('.sc-author-note-reference')).toHaveCount(0);
          assert.equal(publications, 0, 'saving and previewing a note must not publish the draft');
          await notes.getByRole('button', { name: 'Xuất bản phiên bản mới', exact: true }).click();
          await page.getByRole('button', { name: 'Xác nhận gửi duyệt', exact: true }).click();
          await expect.poll(() => publications).toBe(1);
          await expect(notes.getByRole('status', { name: 'Trạng thái công khai chú thích', exact: true })).toHaveAttribute('data-published', 'true');
          await reader.reload();
          const reference = reader.getByRole('button', { name: 'Chú thích 1 của tác giả', exact: true });
          await expect(reference).toBeVisible(); await reference.click();
          await expect(reference).toHaveCSS('font-size', '18px');
          const popup = reader.getByRole('dialog', { name: 'Chú thích 1 của tác giả', exact: true });
          await expect(popup).toContainText(updatedBody);
          await expect(popup.locator('script')).toHaveCount(0);
          await expect(reader.locator('.sc-author-footnotes li')).toHaveText(updatedBody);
          await expect(popup).toHaveCSS('opacity', '1');
          const bounds = await popup.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= profile.width);
          assert.equal(await reader.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          assert.equal(await reader.evaluate(() => window.noteExecuted), undefined);
          await reader.screenshot({ path: path.join(output, `${profile.width}-reader.png`) });
          await reader.keyboard.press('Escape'); await expect(popup).toHaveCount(0); await expect(reference).toBeFocused();
        } finally { await guest.close(); }
        assert.ok(patches > 0); assert.deepEqual(errors, []);
      } catch (error) { await page.screenshot({ path: path.join(output, `${profile.width}-failure.png`) }); console.log(`Author note failure screenshots: ${output}`); throw error; }
      finally { await context.close(); }
    }
    console.log(`Author note screenshots: ${output}`);
  } finally { await browser.close(); if (server) await new Promise(resolve => server.httpServer.close(resolve)); }
});

import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(testDir, '..');
const webRoot = path.resolve(mobileRoot, '..', 'web');
const webRequire = createRequire(path.join(webRoot, 'package.json'));
const mobileRequire = createRequire(path.join(mobileRoot, 'package.json'));

const { chromium, expect } = webRequire('@playwright/test');
const esbuild = webRequire('esbuild');

function createHarnessPlugin() {
  const reactDir = path.dirname(webRequire.resolve('react/package.json'));
  const reactDomDir = path.dirname(webRequire.resolve('react-dom/package.json'));
  const axiosPath = path.join(path.dirname(mobileRequire.resolve('axios/package.json')), 'dist/esm/axios.js');

  return {
    name: 'mobile-home-harness',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: path.join(reactDir, 'index.js') }));
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: path.join(reactDir, 'jsx-runtime.js') }));
      build.onResolve({ filter: /^react\/jsx-dev-runtime$/ }, () => ({ path: path.join(reactDir, 'jsx-dev-runtime.js') }));
      build.onResolve({ filter: /^react-dom$/ }, () => ({ path: path.join(reactDomDir, 'index.js') }));
      build.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: path.join(reactDomDir, 'client.js') }));
      build.onResolve({ filter: /^axios$/ }, () => ({ path: axiosPath }));

      build.onResolve({ filter: /^react-native$/ }, () => ({ path: 'react-native', namespace: 'rn-shim' }));
      build.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: 'rn-safe-area', namespace: 'rn-shim' }));
      build.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: 'async-storage', namespace: 'rn-shim' }));

      build.onLoad({ filter: /^react-native$/, namespace: 'rn-shim' }, () => ({
        contents: `
          import * as React from 'react';
          export const Platform = { OS: 'web', select: (obj) => obj.web ?? obj.default };
          export const StyleSheet = { create: (styles) => styles };
          export const useColorScheme = () => 'light';
          export function View({ children, accessibilityRole, accessibilityLabel, accessibilityLiveRegion }) {
            return React.createElement('div', {
              role: accessibilityRole,
              'aria-label': accessibilityLabel,
              'aria-live': accessibilityLiveRegion
            }, children);
          }
          export function ScrollView({ children }) {
            return React.createElement('div', { 'data-rn': 'ScrollView' }, children);
          }
          export function KeyboardAvoidingView({ children }) {
            return React.createElement('div', { 'data-rn': 'KeyboardAvoidingView' }, children);
          }
          export function Text({ children, accessibilityRole, accessibilityLiveRegion }) {
            const tag = accessibilityRole === 'header' ? 'h2' : 'span';
            return React.createElement(tag, { 'aria-live': accessibilityLiveRegion }, children);
          }
          export function ActivityIndicator() {
            return React.createElement('span', { 'data-rn': 'ActivityIndicator', 'aria-hidden': 'true' }, '...');
          }
          export function Pressable({ children, onPress, disabled, accessibilityLabel }) {
            return React.createElement('button', {
              type: 'button',
              disabled: Boolean(disabled),
              'aria-label': accessibilityLabel,
              onClick: () => { if (!disabled) onPress?.(); }
            }, typeof children === 'function' ? children({ pressed: false }) : children);
          }
          export const TextInput = React.forwardRef(function TextInput({ value, onChangeText, placeholder, accessibilityLabel }, ref) {
            return React.createElement('input', {
              ref,
              type: 'text',
              value: value ?? '',
              placeholder,
              'aria-label': accessibilityLabel,
              onChange: (event) => onChangeText?.(event.target.value)
            });
          });
        `,
        loader: 'js'
      }));

      build.onLoad({ filter: /^rn-safe-area$/, namespace: 'rn-shim' }, () => ({
        contents: `
          import * as React from 'react';
          export function SafeAreaView({ children }) {
            return React.createElement('div', { 'data-rn': 'SafeAreaView' }, children);
          }
        `,
        loader: 'js'
      }));

      build.onLoad({ filter: /^async-storage$/, namespace: 'rn-shim' }, () => ({
        contents: `
          const store = new Map();
          export default {
            getItem: async (k) => store.get(k) ?? null,
            setItem: async (k, v) => { store.set(k, v); },
            removeItem: async (k) => { store.delete(k); }
          };
        `,
        loader: 'js'
      }));
    }
  };
}

async function buildBundle() {
  const entryCode = `
    import * as React from 'react';
    import { createRoot } from 'react-dom/client';
    import { apiClient } from './src/api/api-client';
    import { StoryCraftThemeProvider } from './src/theme/ThemeProvider';
    import { HomeScreen } from './src/screens/HomeScreen';

    const pendingRequests = [];
    window.__requests = pendingRequests;
    window.__ignoreAbort = false;
    window.__searchRequests = () => pendingRequests.filter((r) => r.url === '/reading/search');
    window.__activeSearchRequests = () => pendingRequests.filter((r) => r.url === '/reading/search' && !r.aborted);
    window.__historyRequests = () => pendingRequests.filter((r) => r.url === '/reading/history/me');
    window.__resolveRequest = (index, data) => {
      const req = pendingRequests[index];
      if (!req) throw new Error('Missing request at index ' + index);
      req.resolve({
        data: { success: true, data, error: null, meta: {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: req.config
      });
    };
    window.__rejectRequest = (index, message) => {
      const req = pendingRequests[index];
      if (!req) throw new Error('Missing request at index ' + index);
      req.reject(new Error(message));
    };

    apiClient.defaults.adapter = (config) =>
      new Promise((resolve, reject) => {
        const ignoreAbort = window.__ignoreAbort;
        const entry = {
          index: pendingRequests.length,
          url: config.url,
          q: config.params?.q ?? null,
          aborted: Boolean(config.signal?.aborted),
          config,
          resolve,
          reject
        };
        if (config.signal) {
          config.signal.addEventListener('abort', () => {
            entry.aborted = true;
            if (!ignoreAbort) {
              const err = new Error('canceled');
              err.name = 'CanceledError';
              err.code = 'ERR_CANCELED';
              err.isAxiosError = true;
              reject(err);
            }
          }, { once: true });
        }
        pendingRequests.push(entry);
      });

    window.__mountHome = (authenticated = false) => {
      const rootEl = document.getElementById('root');
      if (window.__root) window.__root.unmount();
      window.__root = createRoot(rootEl);
      window.__root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(
            StoryCraftThemeProvider,
            null,
            React.createElement(HomeScreen, {
              authenticated,
              onOpenNovel: () => {},
              onOpenChapter: () => {}
            })
          )
        )
      );
    };
  `;

  const result = await esbuild.build({
    stdin: {
      contents: entryCode,
      resolveDir: mobileRoot,
      loader: 'tsx'
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: {
      'process.env.EXPO_PUBLIC_API_BASE_URL': '"http://localhost:4000/api/v1"'
    },
    plugins: [createHarnessPlugin()]
  });

  return result.outputFiles[0].text;
}

const SAMPLE_NOVELS = [
  { novelId: 'n1', title: 'Ánh Trăng Cũ', authorName: 'Tác giả A', genre: 'Tiên hiệp', chaptersCount: 12, viewsCount: 340, likesCount: 25 },
  { novelId: 'n2', title: 'Gió Qua Đồi Cỏ', authorName: 'Tác giả B', genre: 'Đời thường', chaptersCount: 8, viewsCount: 190, likesCount: 14 }
];

const SAMPLE_HISTORY = [
  {
    novelId: 'n1',
    chapterId: 'c3',
    novel: { novelId: 'n1', title: 'Ánh Trăng Cũ' },
    chapter: { chapterId: 'c3', chapterNumber: 3, title: 'Đêm trăng trên đỉnh' }
  }
];

async function waitForNextSearch(page, afterCount, expectedQuery) {
  await page.waitForFunction(
    ({ afterCount, expectedQuery }) =>
      window.__searchRequests().slice(afterCount).some((r) => r.q === expectedQuery),
    { afterCount, expectedQuery },
    { timeout: 5000 }
  );
  return page.evaluate(
    ({ afterCount, expectedQuery }) =>
      window.__searchRequests().slice(afterCount).find((r) => r.q === expectedQuery),
    { afterCount, expectedQuery }
  );
}

test('HomeScreen keeps search input mounted and focused across empty results, discards stale responses, and recovers from initial error', { timeout: 60000 }, async () => {
  const bundleJs = await buildBundle();
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined
  });

  try {
    const context = await browser.newContext();

    // Scenario 1 & 2: StrictMode initial load -> empty search -> backspace keeps exact TextInput mounted & focused, plus stale response guard
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: bundleJs });
    await page.evaluate(() => window.__mountHome(false));

    await expect(page.getByText('Đang tải kho truyện...')).toBeVisible();
    await page.waitForFunction(() => window.__searchRequests().length === 2 && window.__activeSearchRequests().length === 1);
    assert.equal(await page.evaluate(() => window.__searchRequests()[0].aborted), true, 'StrictMode initial cleanup should abort first request');

    const initialReqIndex = await page.evaluate(() => window.__activeSearchRequests()[0].index);
    await page.evaluate(({ index, novels }) => window.__resolveRequest(index, novels), { index: initialReqIndex, novels: SAMPLE_NOVELS });

    const searchInput = page.getByRole('textbox', { name: 'Tìm kiếm tác phẩm' });
    await expect(searchInput).toBeVisible();
    await expect(page.getByText('Ánh Trăng Cũ')).toBeVisible();

    await searchInput.focus();
    await page.evaluate(() => {
      window.__initialInputEl = document.querySelector('input[aria-label="Tìm kiếm tác phẩm"]');
    });
    await expect(searchInput).toBeFocused();

    // Type a query that yields 0 results via keyboard input
    await searchInput.pressSequentially('khongtontai');
    await expect(page.getByText('Đang tìm kiếm tác phẩm...')).toBeVisible();
    await expect(page.getByText('Đang tải kho truyện...')).toHaveCount(0);
    await page.waitForFunction(
      () => window.__activeSearchRequests().some((r) => r.q === 'khongtontai'),
      null,
      { timeout: 5000 }
    );
    const emptyReq = await page.evaluate(() => window.__activeSearchRequests().find((r) => r.q === 'khongtontai'));
    assert.ok(emptyReq, 'expected search request for khongtontai');
    await page.evaluate((index) => window.__resolveRequest(index, []), emptyReq.index);

    await expect(page.getByText('Chưa tìm thấy tác phẩm phù hợp.')).toBeVisible();
    await expect(searchInput).toBeFocused();

    // Backspace while novels is STILL empty ([]): input must stay mounted, focused, and inline indicator must show
    const countBeforeBackspace = await page.evaluate(() => window.__searchRequests().length);
    await page.evaluate(() => {
      window.__ignoreAbort = true;
    });
    await searchInput.press('Backspace');
    await expect(searchInput).toHaveValue('khongtonta');
    await expect(searchInput).toBeFocused();
    await expect(page.getByText('Đang tải kho truyện...')).toHaveCount(0);
    await expect(page.getByText('Đang tìm kiếm tác phẩm...')).toBeVisible();
    await expect(page.getByText('Chưa tìm thấy tác phẩm phù hợp.')).toHaveCount(0);

    const sameElementAfterEmptyEdit = await page.evaluate(
      () => window.__initialInputEl === document.querySelector('input[aria-label="Tìm kiếm tác phẩm"]')
    );
    assert.equal(sameElementAfterEmptyEdit, true, 'Search input DOM node should never unmount on empty refetch');

    // Wait for q="khongtonta" to fire with ignoreAbort=true so we exercise the sequence/cancellation guard
    // even if a transport resolves out-of-order after abort.
    const staleSearchReq = await waitForNextSearch(page, countBeforeBackspace, 'khongtonta');

    const countBeforeGio = await page.evaluate(() => window.__searchRequests().length);
    await searchInput.press('Control+a');
    await searchInput.pressSequentially('gio');
    await expect(searchInput).toBeFocused();

    // Superseded request must have its AbortSignal aborted immediately on cleanup
    await page.waitForFunction((idx) => window.__requests[idx].aborted === true, staleSearchReq.index);
    const newerSearchReq = await waitForNextSearch(page, countBeforeGio, 'gio');

    // Resolve newer request FIRST
    await page.evaluate(({ index, novels }) => window.__resolveRequest(index, [novels[1]]), {
      index: newerSearchReq.index,
      novels: SAMPLE_NOVELS
    });
    await expect(page.getByText('Gió Qua Đồi Cỏ')).toBeVisible();
    await expect(page.getByText('Đang tìm kiếm tác phẩm...')).toHaveCount(0);

    // Resolve stale request LATE: sequence/cancellation guard must discard it
    await page.evaluate(({ index, novels }) => window.__resolveRequest(index, [novels[0]]), {
      index: staleSearchReq.index,
      novels: SAMPLE_NOVELS
    });
    await page.waitForTimeout(50);
    await expect(page.getByText('Gió Qua Đồi Cỏ')).toBeVisible();
    await expect(page.getByText('Ánh Trăng Cũ')).toHaveCount(0);

    // Also verify a stale rejection from a superseded request never overwrites newer state with an error
    await page.evaluate(() => {
      window.__ignoreAbort = false;
    });
    const countBeforeAnh = await page.evaluate(() => window.__searchRequests().length);
    await searchInput.press('Control+a');
    await searchInput.pressSequentially('anh');
    const supersededForRefresh = await waitForNextSearch(page, countBeforeAnh, 'anh');
    await page.evaluate(() => {
      window.__ignoreAbort = true;
    });
    const countBeforeRefresh = await page.evaluate(() => window.__searchRequests().length);
    await page.getByRole('button', { name: 'Làm mới danh sách' }).click();
    const manualRefresh = await waitForNextSearch(page, countBeforeRefresh, 'anh');
    await page.evaluate(({ index, novels }) => window.__resolveRequest(index, [novels[0]]), {
      index: manualRefresh.index,
      novels: SAMPLE_NOVELS
    });
    await expect(page.getByText('Ánh Trăng Cũ')).toBeVisible();
    await page.evaluate((idx) => window.__rejectRequest(idx, 'Lỗi cũ đã quá hạn'), supersededForRefresh.index);
    await page.waitForTimeout(50);
    await expect(page.getByText('Lỗi cũ đã quá hạn')).toHaveCount(0);
    await expect(page.getByText('Ánh Trăng Cũ')).toBeVisible();

    // Clear back to empty query via keyboard -> shows "Đang cập nhật danh sách..." inline and preserves focus
    await page.evaluate(() => {
      window.__ignoreAbort = false;
    });
    const countBeforeClear = await page.evaluate(() => window.__searchRequests().length);
    await searchInput.focus();
    await searchInput.press('Control+a');
    await searchInput.press('Backspace');
    await expect(page.getByText('Đang cập nhật danh sách...')).toBeVisible();
    await expect(searchInput).toBeFocused();
    const clearedReq = await waitForNextSearch(page, countBeforeClear, null);
    await page.evaluate(({ index, novels }) => window.__resolveRequest(index, novels), {
      index: clearedReq.index,
      novels: SAMPLE_NOVELS
    });
    await expect(page.getByText('Ánh Trăng Cũ')).toBeVisible();
    await expect(page.getByText('Gió Qua Đồi Cỏ')).toBeVisible();
    await expect(searchInput).toBeFocused();
    assert.equal(
      await page.evaluate(() => window.__initialInputEl === document.querySelector('input[aria-label="Tìm kiếm tác phẩm"]')),
      true,
      'Search input DOM node should stay identical across all refetches'
    );

    // Scenario 3: Initial fetch error settles initialLoading -> mounts Screen with ErrorState + Retry without unmounting Screen
    const page2 = await context.newPage();
    await page2.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page2.addScriptTag({ content: bundleJs });
    await page2.evaluate(() => window.__mountHome(false));
    await page2.waitForFunction(() => window.__activeSearchRequests().length === 1);
    const errInitIdx = await page2.evaluate(() => window.__activeSearchRequests()[0].index);
    await page2.evaluate((idx) => window.__rejectRequest(idx, 'Mất kết nối máy chủ'), errInitIdx);

    await expect(page2.getByText('Mất kết nối máy chủ')).toBeVisible();
    const retryInput = page2.getByRole('textbox', { name: 'Tìm kiếm tác phẩm' });
    await expect(retryInput).toBeVisible();

    const countBeforeRetry = await page2.evaluate(() => window.__searchRequests().length);
    await page2.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page2.getByText('Đang tải kho truyện...')).toHaveCount(0);
    await expect(page2.getByText('Đang cập nhật danh sách...')).toBeVisible();
    const retryReq = await waitForNextSearch(page2, countBeforeRetry, null);
    await page2.evaluate(({ index, novels }) => window.__resolveRequest(index, novels), {
      index: retryReq.index,
      novels: SAMPLE_NOVELS
    });
    await expect(page2.getByText('Ánh Trăng Cũ')).toBeVisible();
    await expect(page2.getByText('Mất kết nối máy chủ')).toHaveCount(0);

    // Scenario 4: Authenticated session preserves "Đọc tiếp" and does not spam listHistory on search edits
    const page3 = await context.newPage();
    await page3.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page3.addScriptTag({ content: bundleJs });
    await page3.evaluate(() => window.__mountHome(true));
    await page3.waitForFunction(
      () => window.__activeSearchRequests().length === 1 && window.__historyRequests().filter((r) => !r.aborted).length === 1
    );
    const authSearchIdx = await page3.evaluate(() => window.__activeSearchRequests()[0].index);
    const authHistoryIdx = await page3.evaluate(() => window.__historyRequests().filter((r) => !r.aborted)[0].index);
    await page3.evaluate(({ index, novels }) => window.__resolveRequest(index, novels), { index: authSearchIdx, novels: SAMPLE_NOVELS });
    await page3.evaluate(({ index, history }) => window.__resolveRequest(index, history), { index: authHistoryIdx, history: SAMPLE_HISTORY });

    await expect(page3.getByText('Đọc tiếp')).toBeVisible();
    await expect(page3.getByText('Chương 3: Đêm trăng trên đỉnh')).toBeVisible();

    const authInput = page3.getByRole('textbox', { name: 'Tìm kiếm tác phẩm' });
    await authInput.focus();
    await authInput.pressSequentially('gio');
    await page3.waitForFunction(() => window.__activeSearchRequests().some((r) => r.q === 'gio'));
    const authSearch2Idx = await page3.evaluate(() => window.__activeSearchRequests().find((r) => r.q === 'gio').index);
    await page3.evaluate(({ index, novels }) => window.__resolveRequest(index, [novels[1]]), {
      index: authSearch2Idx,
      novels: SAMPLE_NOVELS
    });
    await expect(page3.getByText('Gió Qua Đồi Cỏ')).toBeVisible();
    await expect(page3.getByText('Đọc tiếp')).toBeVisible();
    const activeHistoryCount = await page3.evaluate(
      () => window.__historyRequests().filter((r) => !r.aborted).length
    );
    assert.equal(activeHistoryCount, 1, 'Search edits should not refetch reading history');
  } finally {
    await browser.close();
  }
});

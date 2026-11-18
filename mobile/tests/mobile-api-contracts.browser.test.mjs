import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(testDir, '..');
const repoRoot = path.resolve(mobileRoot, '..');
const webRoot = path.join(repoRoot, 'web');
const backendRoot = path.join(repoRoot, 'backend');

const webRequire = createRequire(path.join(webRoot, 'package.json'));
const mobileRequire = createRequire(path.join(mobileRoot, 'package.json'));
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));

const { chromium, expect } = webRequire('@playwright/test');
const esbuild = webRequire('esbuild');

async function loadBackendSchemas() {
  const entryCode = `
    export { readingPreferencesSchema, syncReadingHistorySchema } from './src/modules/reading/reading.schemas.ts';
    export { createDepositSessionSchema, mockDepositSuccessSchema } from './src/modules/wallet/wallet.schemas.ts';
    export { updateProfileSchema } from './src/modules/users/users.schemas.ts';
    export { createReportSchema } from './src/modules/content-control/content-control.schemas.ts';
  `;
  const zodPath = backendRequire.resolve('zod');
  const result = await esbuild.build({
    stdin: {
      contents: entryCode,
      resolveDir: backendRoot,
      loader: 'ts'
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'resolve-backend-zod',
        setup(build) {
          build.onResolve({ filter: /^zod$/ }, () => ({ path: zodPath }));
        }
      }
    ]
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
  return import(dataUrl);
}

function createHarnessPlugin() {
  const reactDir = path.dirname(webRequire.resolve('react/package.json'));
  const reactDomDir = path.dirname(webRequire.resolve('react-dom/package.json'));
  const axiosPath = path.join(path.dirname(mobileRequire.resolve('axios/package.json')), 'dist/esm/axios.js');

  return {
    name: 'mobile-contracts-harness',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: path.join(reactDir, 'index.js') }));
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: path.join(reactDir, 'jsx-runtime.js') }));
      build.onResolve({ filter: /^react\/jsx-dev-runtime$/ }, () => ({ path: path.join(reactDir, 'jsx-dev-runtime.js') }));
      build.onResolve({ filter: /^react-dom$/ }, () => ({ path: path.join(reactDomDir, 'index.js') }));
      build.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: path.join(reactDomDir, 'client.js') }));
      build.onResolve({ filter: /^axios$/ }, () => ({ path: axiosPath }));

      build.onResolve({ filter: /^react-native$/ }, () => ({ path: 'react-native', namespace: 'rn-shim' }));
      build.onResolve({ filter: /^@react-navigation\/native$/ }, () => ({ path: 'navigation', namespace: 'rn-shim' }));
      build.onResolve({ filter: /^@react-native-community\/netinfo$/ }, () => ({ path: 'netinfo', namespace: 'rn-shim' }));
      build.onLoad({ filter: /^navigation$/, namespace: 'rn-shim' }, () => ({
        contents: 'export const useIsFocused = () => true;',
        loader: 'js'
      }));
      build.onLoad({ filter: /^netinfo$/, namespace: 'rn-shim' }, () => ({
        contents: 'export const useNetInfo = () => ({ isConnected: true });',
        loader: 'js'
      }));
      build.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: 'rn-safe-area', namespace: 'rn-shim' }));
      build.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: 'async-storage', namespace: 'rn-shim' }));
      build.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: 'rn-svg', namespace: 'rn-shim' }));

      build.onLoad({ filter: /^rn-svg$/, namespace: 'rn-shim' }, () => ({
        contents: `
          import * as React from 'react';
          export function Svg({ children, width, height, viewBox }) {
            return React.createElement('svg', { width, height, viewBox, 'aria-hidden': 'true' }, children);
          }
          export default Svg;
          export const Path = (props) => React.createElement('path', props);
          export const Circle = (props) => React.createElement('circle', props);
          export const Rect = (props) => React.createElement('rect', props);
          export const Line = (props) => React.createElement('line', props);
          export const Polyline = (props) => React.createElement('polyline', props);
        `,
        loader: 'js'
      }));

      build.onLoad({ filter: /^react-native$/, namespace: 'rn-shim' }, () => ({
        contents: `
          import * as React from 'react';
          export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
          export const Platform = {
            get OS() {
              return window.__simulatedOS || 'ios';
            },
            select: (obj) => {
              const os = window.__simulatedOS || 'ios';
              return (os in obj ? obj[os] : undefined) ?? obj.default;
            }
          };
          export const Alert = {
            alert: (title, message, buttons) => {
              window.__lastAlert = { title, message, buttons };
            }
          };
          export const StyleSheet = {
            create: (styles) => styles,
            flatten: (style) => {
              if (!style) return {};
              if (Array.isArray(style)) {
                return style.reduce((acc, item) => Object.assign(acc, StyleSheet.flatten(item)), {});
              }
              return style;
            }
          };
          export const useColorScheme = () => 'light';
          export function View({ children, style, accessibilityRole, accessibilityLabel, accessibilityLiveRegion }) {
            const flat = StyleSheet.flatten(style);
            return React.createElement('div', {
              role: accessibilityRole,
              'aria-label': accessibilityLabel,
              'aria-live': accessibilityLiveRegion,
              'data-bg': flat.backgroundColor || undefined
            }, children);
          }
          export function ScrollView({ children }) {
            return React.createElement('div', { 'data-rn': 'ScrollView' }, children);
          }
          export function RefreshControl() {
            return null;
          }
          export function FlatList({ data = [], renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, ItemSeparatorComponent }) {
            const header = typeof ListHeaderComponent === 'function' ? React.createElement(ListHeaderComponent) : ListHeaderComponent;
            const footer = typeof ListFooterComponent === 'function' ? React.createElement(ListFooterComponent) : ListFooterComponent;
            const empty = typeof ListEmptyComponent === 'function' ? React.createElement(ListEmptyComponent) : ListEmptyComponent;
            return React.createElement(
              'div',
              { 'data-rn': 'FlatList' },
              header,
              data.length > 0
                ? data.map((item, index) =>
                    React.createElement(
                      React.Fragment,
                      { key: keyExtractor ? keyExtractor(item, index) : String(index) },
                      index > 0 && ItemSeparatorComponent
                        ? typeof ItemSeparatorComponent === 'function'
                          ? React.createElement(ItemSeparatorComponent)
                          : ItemSeparatorComponent
                        : null,
                      renderItem({ item, index })
                    )
                  )
                : empty,
              footer
            );
          }
          export function Image({ source, onError }) {
            return React.createElement('img', {
              src: source?.uri ?? '',
              alt: '',
              onError: () => onError?.()
            });
          }
          export function Modal({ visible, children }) {
            return visible ? React.createElement('div', { role: 'dialog', 'aria-modal': 'true' }, children) : null;
          }
          export function KeyboardAvoidingView({ children }) {
            return React.createElement('div', { 'data-rn': 'KeyboardAvoidingView' }, children);
          }
          export function Text({ children, style, accessibilityRole, accessibilityLiveRegion }) {
            const flat = StyleSheet.flatten(style);
            const tag = accessibilityRole === 'header' ? 'h2' : 'span';
            return React.createElement(tag, {
              'aria-live': accessibilityLiveRegion,
              'data-font-family': flat.fontFamily === undefined ? '__SYSTEM__' : String(flat.fontFamily),
              'data-color': flat.color || undefined
            }, children);
          }
          export function ActivityIndicator() {
            return React.createElement('span', { 'data-rn': 'ActivityIndicator', 'aria-hidden': 'true' }, '...');
          }
          export function Pressable({ children, onPress, disabled, accessibilityLabel, accessibilityRole, accessibilityState }) {
            return React.createElement('button', {
              type: 'button',
              role: accessibilityRole,
              'aria-selected': accessibilityState?.selected,
              'aria-checked': accessibilityState?.checked,
              'aria-expanded': accessibilityState?.expanded,
              'aria-busy': accessibilityState?.busy || undefined,
              disabled: Boolean(disabled),
              'aria-label': accessibilityLabel,
              onClick: () => { if (!disabled) onPress?.(); }
            }, typeof children === 'function' ? children({ pressed: false }) : children);
          }
          export const TextInput = React.forwardRef(function TextInput({ value, onChangeText, placeholder, accessibilityLabel, onFocus, onBlur, editable = true, secureTextEntry, maxLength }, ref) {
            return React.createElement('input', {
              ref,
              type: secureTextEntry ? 'password' : 'text',
              disabled: editable === false,
              maxLength,
              value: value ?? '',
              placeholder,
              'aria-label': accessibilityLabel,
              onFocus: () => onFocus?.(),
              onBlur: () => onBlur?.(),
              onChange: (event) => {
                const raw = event.target.value;
                onChangeText?.(typeof maxLength === 'number' ? raw.slice(0, maxLength) : raw);
              }
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
    import { apiClient, ApiClientError } from './src/api/api-client';
    import { StoryCraftThemeProvider } from './src/theme/ThemeProvider';
    import { ReaderScreen, resolveMobileReaderFontFamily, resolveReaderPaperTone } from './src/screens/ReaderScreen';
    import { NovelDetailScreen } from './src/screens/NovelDetailScreen';
    import { LibraryScreen } from './src/screens/LibraryScreen';
    import { AuthScreen } from './src/screens/AuthScreen';
    import { CommentsScreen } from './src/screens/CommentsScreen';
    import { WalletScreen } from './src/screens/WalletScreen';
    import { ProfileScreen } from './src/screens/ProfileScreen';
    import { NotificationsScreen } from './src/screens/NotificationsScreen';
    import {
      fetchUnreadNotificationCount,
      getUnreadNotificationCount,
      listNotificationsPage,
      markAllNotificationsRead
    } from './src/api/notification-api';
    import { lightColors } from './src/theme/colors';

    window.__helpers = {
      resolveMobileReaderFontFamily,
      resolveReaderPaperTone,
      lightPalette: lightColors,
      ApiClientError,
      fetchUnreadNotificationCount,
      getUnreadNotificationCount,
      listNotificationsPage,
      markAllNotificationsRead
    };
    window.__capturedRequests = [];
    window.__mockHandlers = {};
    window.__walletOpenedCount = 0;
    window.__openedNovels = [];
    window.__openedChapters = [];
    window.__unreadCountHistory = [];

    apiClient.defaults.adapter = async (config) => {
      const method = (config.method || 'get').toUpperCase();
      const key = method + ' ' + config.url;
      const parsedBody = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const record = {
        method,
        url: config.url,
        body: parsedBody,
        params: config.params,
        aborted: Boolean(config.signal?.aborted)
      };
      if (config.signal) {
        config.signal.addEventListener('abort', () => {
          record.aborted = true;
        }, { once: true });
      }
      window.__capturedRequests.push(record);
      const handler = window.__mockHandlers[key];
      if (!handler) {
        throw new Error('Unhandled mock request: ' + key);
      }
      const result = await handler(parsedBody, config, record);
      const isEnvelope =
        result && typeof result === 'object' && !Array.isArray(result) && result.__envelope === true;
      const data = isEnvelope ? result.data : result;
      const meta = isEnvelope ? (result.meta ?? {}) : {};
      return {
        data: { success: true, data, error: null, meta },
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      };
    };

    function mountElement(element) {
      const rootEl = document.getElementById('root');
      if (window.__root) window.__root.unmount();
      window.__root = createRoot(rootEl);
      window.__root.render(React.createElement(StoryCraftThemeProvider, null, element));
    }

    function rerenderElement(element) {
      const rootEl = document.getElementById('root');
      if (!window.__root) {
        window.__root = createRoot(rootEl);
      }
      window.__root.render(React.createElement(StoryCraftThemeProvider, null, element));
    }

    window.__mountReader = (chapterId, novelId, authenticated = true) =>
      mountElement(
        React.createElement(ReaderScreen, {
          chapterId,
          novelId,
          authenticated,
          onLoginRequired: () => {},
          onOpenComments: () => {},
          onOpenChapter: (nextChapterId) => {
            window.__openedChapters.push(nextChapterId);
          },
          onOpenWallet: () => {
            window.__walletOpenedCount += 1;
          }
        })
      );

    window.__rerenderReader = (chapterId, novelId, authenticated = true) =>
      rerenderElement(
        React.createElement(ReaderScreen, {
          chapterId,
          novelId,
          authenticated,
          onLoginRequired: () => {},
          onOpenComments: () => {},
          onOpenChapter: (nextChapterId) => {
            window.__openedChapters.push(nextChapterId);
          },
          onOpenWallet: () => {
            window.__walletOpenedCount += 1;
          }
        })
      );

    window.__mountLibrary = () =>
      mountElement(
        React.createElement(LibraryScreen, {
          onOpenNovel: (novelId) => {
            window.__openedNovels.push(novelId);
          },
          onBrowse: () => {}
        })
      );

    window.__mountNovelDetail = (novelId) =>
      mountElement(
        React.createElement(NovelDetailScreen, {
          novelId,
          authenticated: true,
          onLoginRequired: () => {},
          onOpenChapter: () => {}
        })
      );

    window.__mountAuth = () => mountElement(React.createElement(AuthScreen, { onAuthenticated: () => {} }));
    window.__mountComments = (chapterId) =>
      mountElement(React.createElement(CommentsScreen, { target: { kind: 'chapter', id: chapterId }, user: null, onLoginRequired: () => {}, onThread: () => {}, onProfile: () => {} }));
    window.__mountWallet = () => mountElement(React.createElement(WalletScreen));
    window.__mountProfile = () => mountElement(React.createElement(ProfileScreen, { onLogout: () => {} }));
    window.__mountNotifications = (props = {}) =>
      mountElement(
        React.createElement(NotificationsScreen, {
          onUnreadCountChange: (count) => {
            window.__unreadCountHistory.push(count);
          },
          ...props
        })
      );
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

const NOVEL_UUID = '11111111-1111-4111-8111-111111111111';
const CHAPTER_UUID = '22222222-2222-4222-8222-222222222222';
const SESSION_UUID = '33333333-3333-4333-8333-333333333333';

test('Mobile Reader, Wallet, Profile, and Notifications screens satisfy backend Zod contracts and cross-platform UI rules', { timeout: 60000 }, async () => {
  const [schemas, bundleJs] = await Promise.all([loadBackendSchemas(), buildBundle()]);
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: bundleJs });

    // 1. Verify ReaderScreen on simulated iOS with Web preferences ('Be Vietnam Pro' + 'MINT' pastel background)
    const fontCheck = await page.evaluate(() => {
      const { resolveMobileReaderFontFamily, resolveReaderPaperTone } = window.__helpers;
      return {
        iosVietnam: resolveMobileReaderFontFamily('Be Vietnam Pro', 'ios') ?? '__SYSTEM__',
        iosLiterata: resolveMobileReaderFontFamily('Literata', 'ios'),
        iosAndroidSerif: resolveMobileReaderFontFamily('serif', 'ios'),
        androidVietnam: resolveMobileReaderFontFamily('Be Vietnam Pro', 'android'),
        androidLiterata: resolveMobileReaderFontFamily('Literata', 'android'),
        webLiterata: resolveMobileReaderFontFamily('Literata', 'web'),
        mintTone: resolveReaderPaperTone('MINT'),
        roseTone: resolveReaderPaperTone('ROSE'),
        blueTone: resolveReaderPaperTone('BLUE'),
        blackTone: resolveReaderPaperTone('BLACK'),
        sepiaTone: resolveReaderPaperTone('SEPIA')
      };
    });

    assert.equal(fontCheck.iosVietnam, '__SYSTEM__', 'iOS must use system default font instead of unregistered Be Vietnam Pro');
    assert.equal(fontCheck.iosLiterata, 'Georgia', 'iOS must map Web serif fonts to built-in Georgia');
    assert.equal(fontCheck.iosAndroidSerif, 'Georgia', 'iOS must never pass raw Android "serif" font name');
    assert.equal(fontCheck.androidVietnam, 'sans-serif');
    assert.equal(fontCheck.androidLiterata, 'serif');
    assert.equal(fontCheck.webLiterata, 'Literata');
    assert.equal(fontCheck.mintTone, 'light');
    assert.equal(fontCheck.roseTone, 'light');
    assert.equal(fontCheck.blueTone, 'light');
    assert.equal(fontCheck.blackTone, 'dark');
    assert.equal(fontCheck.sepiaTone, 'sepia');

    await page.evaluate(
      ({ novelId, chapterId }) => {
        window.__simulatedOS = 'ios';
        window.__capturedRequests = [];
        window.__mockHandlers = {
          [`GET /reading/chapters/${chapterId}`]: () => ({
            chapterId,
            novelId,
            title: 'Khởi đầu mới',
            chapterNumber: 1,
            content: 'Đoạn văn mẫu kiểm thử hiển thị trên iOS.',
            isVip: false,
            priceCoins: 0,
            wordCount: 420
          }),
          'GET /reading/preferences/me': () => ({
            fontFamily: 'Be Vietnam Pro',
            fontSize: 18,
            background: 'MINT',
            lineHeight: 1.8,
            margin: 24,
            textAlign: 'JUSTIFY'
          }),
          'PUT /reading/history/me': () => ({ synced: true }),
          'PUT /reading/preferences/me': (body) => body
        };
        window.__mountReader(chapterId);
      },
      { novelId: NOVEL_UUID, chapterId: CHAPTER_UUID }
    );

    const chapterBody = page.getByText('Đoạn văn mẫu kiểm thử hiển thị trên iOS.');
    await expect(chapterBody).toBeVisible();
    assert.equal(await chapterBody.getAttribute('data-font-family'), '__SYSTEM__');

    const paperBg = await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll('span')).find((el) =>
        el.textContent?.includes('Đoạn văn mẫu kiểm thử hiển thị trên iOS.')
      );
      return {
        actualBg: span?.parentElement?.getAttribute('data-bg'),
        expectedMintBg: window.__helpers.lightPalette.mintBackground
      };
    });
    assert.equal(paperBg.actualBg, paperBg.expectedMintBg, 'MINT Web background must render with dedicated mint paper token');

    // Reader customization panel is collapsed by default so prose dominates immediately on open
    await expect(page.getByText('Màu nền trang sách')).toHaveCount(0);
    await page.getByRole('button', { name: 'Tăng cỡ chữ' }).click();
    await expect(page.getByText('Đã lưu tùy chỉnh đọc truyện.')).toBeVisible();

    // Opening "Aa Tùy chỉnh" exposes all 7 ReadingBackground options; reporting requires confirmation + reason
    await page.getByRole('button', { name: 'Aa Tùy chỉnh' }).click();
    await expect(page.getByText('Màu nền trang sách')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nền đọc Đen sâu' })).toBeVisible();

    await page.evaluate(() => {
      window.__mockHandlers['POST /reports'] = (body) => ({ reportId: 'rep-1', status: 'PENDING', ...body });
    });
    await page.getByRole('button', { name: 'Báo cáo chương' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('radio', { name: 'Bản quyền' }).click();
    await page.getByRole('button', { name: 'Gửi báo cáo' }).click();
    await expect(page.getByText('Đã gửi báo cáo chương.')).toBeVisible();

    const reportReq = await page.evaluate(() =>
      window.__capturedRequests.find((r) => r.method === 'POST' && r.url === '/reports')
    );
    assert.ok(reportReq, 'Expected POST /reports after confirming reason');
    const parsedReport = schemas.createReportSchema.parse({ body: reportReq.body });
    assert.equal(parsedReport.body.reason, 'Bản quyền');

    const readerRequests = await page.evaluate(() => window.__capturedRequests);
    const historyPut = readerRequests.find((r) => r.method === 'PUT' && r.url === '/reading/history/me');
    const prefPut = readerRequests.find((r) => r.method === 'PUT' && r.url === '/reading/preferences/me');
    assert.ok(historyPut, 'Expected PUT /reading/history/me');
    assert.ok(prefPut, 'Expected PUT /reading/preferences/me');
    schemas.syncReadingHistorySchema.parse({ body: historyPut.body });
    const parsedPref = schemas.readingPreferencesSchema.parse({ body: prefPut.body });
    assert.equal(parsedPref.body.fontFamily, 'Be Vietnam Pro', 'Saving A+ on mobile must preserve synced Web fontFamily');
    assert.equal(parsedPref.body.fontSize, 19);
    assert.equal(parsedPref.body.background, 'MINT');

    // 2. Verify WalletScreen renders coinsBalance, UNLOCK/DONATE/SUCCESS labels, and sends { packageCode: 'COIN_1000' }
    await page.evaluate((sessionId) => {
      window.__capturedRequests = [];
      let balance = 2500;
      window.__mockHandlers = {
        'GET /wallet/me': () => ({
          walletId: 'w1',
          coinsBalance: balance,
          lockedCoins: 200
        }),
        'GET /wallet/transactions': () => [
          {
            transactionId: 'tx-1',
            type: 'UNLOCK',
            amountCoins: 50,
            status: 'SUCCESS',
            createdAt: '2026-11-18T00:00:00.000Z'
          },
          {
            transactionId: 'tx-2',
            type: 'DONATE',
            amountCoins: 100,
            status: 'PENDING',
            createdAt: '2026-11-18T00:01:00.000Z'
          }
        ],
        'POST /wallet/deposit-sessions': () => ({
          depositSessionId: sessionId,
          amountCoins: 1000,
          status: 'PENDING',
          mockPaymentUrl: `/mock-payment/${sessionId}`
        }),
        'POST /wallet/mock-webhook/deposit-success': () => {
          balance += 1000;
          return { transactionId: 'tx-3', status: 'SUCCESS' };
        }
      };
      window.__mountWallet();
    }, SESSION_UUID);

    await expect(page.getByText(/2[.,]500/)).toBeVisible();
    await expect(page.getByText(/Đang tạm khóa: 200 Xu/)).toBeVisible();
    await expect(page.getByText('Mở khóa chương VIP')).toBeVisible();
    await expect(page.getByText('Ủng hộ tác giả')).toBeVisible();
    await expect(page.getByText('Thành công')).toBeVisible();
    await expect(page.getByText('Đang xử lý')).toBeVisible();

    await page.getByRole('button', { name: 'Nạp thử nghiệm +1.000 Xu' }).click();
    await expect(page.getByText('Đã nạp mô phỏng +1.000 Xu thành công.')).toBeVisible();
    await expect(page.getByText(/3[.,]500/)).toBeVisible();

    const walletRequests = await page.evaluate(() => window.__capturedRequests);
    const depositPost = walletRequests.find((r) => r.method === 'POST' && r.url === '/wallet/deposit-sessions');
    const webhookPost = walletRequests.find((r) => r.method === 'POST' && r.url === '/wallet/mock-webhook/deposit-success');
    assert.ok(depositPost, 'Expected POST /wallet/deposit-sessions');
    assert.ok(webhookPost, 'Expected POST /wallet/mock-webhook/deposit-success');
    const parsedDeposit = schemas.createDepositSessionSchema.parse({ body: depositPost.body });
    assert.equal(parsedDeposit.body.packageCode, 'COIN_1000');
    schemas.mockDepositSuccessSchema.parse({ body: webhookPost.body });

    // 3. Verify ProfileScreen normalizes empty avatarUrl -> null and blank displayName -> omitted
    await page.evaluate(() => {
      window.__capturedRequests = [];
      window.__mockHandlers = {
        'GET /users/me/profile': () => ({
          userId: 'u1',
          displayName: '  Bút Danh Ánh Trăng  ',
          avatarUrl: null,
          bio: ''
        }),
        'PATCH /users/me/profile': (body) => ({
          userId: 'u1',
          ...body
        })
      };
      window.__mountProfile();
    });

    await expect(page.getByRole('textbox', { name: 'Tên hiển thị' })).toBeVisible();
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await expect(page.getByText('Đã lưu thông tin hồ sơ.')).toBeVisible();

    const profileRequests = await page.evaluate(() => window.__capturedRequests);
    const profilePatch = profileRequests.find((r) => r.method === 'PATCH' && r.url === '/users/me/profile');
    assert.ok(profilePatch, 'Expected PATCH /users/me/profile');
    const parsedProfile = schemas.updateProfileSchema.parse({ body: profilePatch.body });
    assert.deepEqual(parsedProfile.body, {
      displayName: 'Bút Danh Ánh Trăng',
      avatarUrl: null,
      bio: null
    });

    // 4. Verify NotificationsScreen renders backend `content` field instead of raw enum key and updates read status in-place
    await page.evaluate(() => {
      window.__capturedRequests = [];
      window.__mockHandlers = {
        'GET /notifications': () => [
          {
            notificationId: 'notif-1',
            type: 'NOVEL_CHAPTER_PUBLISHED',
            title: 'Chương 12 vừa lên sóng',
            content: 'Thanh Vân Kiếm vừa ra mắt Chương 12: Tuyết Rơi Đỉnh Núi.',
            status: 'UNREAD',
            createdAt: '2026-11-18T00:05:00.000Z'
          },
          {
            notificationId: 'notif-2',
            type: 'COMMENT_REPLY',
            title: 'Phản hồi bình luận mới',
            content: 'Độc giả Minh Nguyệt đã trả lời bình luận của bạn.',
            status: 'UNREAD',
            createdAt: '2026-11-18T00:06:00.000Z'
          }
        ],
        'PATCH /notifications/notif-1/read': () => ({
          notificationId: 'notif-1',
          status: 'READ',
          readAt: '2026-11-18T00:07:00.000Z'
        }),
        'PATCH /notifications/notif-2/read': () => ({
          notificationId: 'notif-2',
          status: 'READ',
          readAt: '2026-11-18T00:07:00.000Z'
        })
      };
      window.__mountNotifications();
    });

    await expect(page.getByText('Chương 12 vừa lên sóng')).toBeVisible();
    await expect(page.getByText('Thanh Vân Kiếm vừa ra mắt Chương 12: Tuyết Rơi Đỉnh Núi.')).toBeVisible();
    await expect(page.getByText('NOVEL_CHAPTER_PUBLISHED')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toBeVisible();

    await page.getByRole('button', { name: 'Đánh dấu đã đọc' }).first().click();
    await expect(page.getByText('Đã đọc', { exact: true })).toBeVisible();
    const getNotifCount = await page.evaluate(
      () => window.__capturedRequests.filter((r) => r.method === 'GET' && r.url === '/notifications' && !r.params?.status).length
    );
    assert.equal(getNotifCount, 1, 'Marking notification read must update in-place without refetching/unmounting list');

    // 4b. Verify mobile notification count & mark-all across 31+ items (top 30 READ, #31..65 UNREAD, 99+ cap, partial failure reconciliation)
    await page.evaluate(() => {
      window.__capturedRequests = [];
      window.__unreadCountHistory = [];
      const store = [
        ...Array.from({ length: 30 }, (_, index) => ({
          notificationId: `m-read-${index + 1}`,
          type: 'NOVEL_CHAPTER_PUBLISHED',
          title: `Thông báo đã đọc #${index + 1}`,
          content: `Nội dung cũ #${index + 1}`,
          status: 'READ',
          createdAt: new Date(Date.UTC(2026, 10, 18, 12, 0, index)).toISOString(),
          readAt: '2026-11-18T12:00:00.000Z'
        })),
        ...Array.from({ length: 35 }, (_, index) => ({
          notificationId: `m-unread-${index + 1}`,
          type: 'COMMENT_REPLY',
          title: `Thông báo chưa đọc #${index + 1}`,
          content: `Bình luận mới #${index + 1}`,
          status: 'UNREAD',
          createdAt: new Date(Date.UTC(2026, 10, 17, 12, 0, index)).toISOString(),
          readAt: null
        }))
      ];
      const failingPatchIds = new Set(['m-unread-1', 'm-unread-35']);
      window.__failingPatchIds = failingPatchIds;
      window.__notifStore = store;

      window.__mockHandlers = {
        'GET /notifications': (_body, config) => {
          const status = config.params?.status;
          const pageNum = Number(config.params?.page ?? 1);
          const limit = Number(config.params?.limit ?? 30);
          const filtered = status ? store.filter((item) => item.status === status) : store;
          const items = filtered.slice((pageNum - 1) * limit, pageNum * limit);
          return {
            __envelope: true,
            data: items,
            meta: {
              page: pageNum,
              limit,
              totalItems: filtered.length,
              totalPages: Math.max(1, Math.ceil(filtered.length / limit))
            }
          };
        }
      };
      for (const item of store) {
        window.__mockHandlers[`PATCH /notifications/${item.notificationId}/read`] = () => {
          if (failingPatchIds.has(item.notificationId)) {
            throw new window.__helpers.ApiClientError({
              status: 500,
              code: 'INTERNAL_ERROR',
              message: `Không thể cập nhật ${item.notificationId}`
            });
          }
          item.status = 'READ';
          item.readAt = '2026-11-18T14:00:00.000Z';
          return { ...item };
        };
      }
      window.__mountNotifications();
    });

    await expect(page.getByText('35 thông báo chưa đọc')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toBeVisible();
    assert.equal(await page.evaluate(() => window.__unreadCountHistory.at(-1)), 35);

    // Load page 2 so m-unread-1..5 appear on screen, then trigger Mark All Read with 2 failing PATCHes
    await page.getByRole('button', { name: 'Xem thêm thông báo' }).click();
    await expect(page.getByText('Thông báo chưa đọc #1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click();

    // 33 succeeded items update to 'Đã đọc', badge & header reconcile to 2, and error banner displays
    await expect(page.getByText('2 thông báo chưa đọc', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true })).toHaveCount(1);
    assert.equal(await page.evaluate(() => window.__unreadCountHistory.at(-1)), 2);
    await expect(page.getByText(/không thể cập nhật 2\/35 thông báo/i)).toBeVisible();
    const remainingUnread = await page.evaluate(
      () => window.__notifStore.filter((item) => item.status === 'UNREAD').map((item) => item.notificationId)
    );
    assert.deepEqual(remainingUnread, ['m-unread-1', 'm-unread-35']);

    // Retry Mark All Read after transient error clears -> patches only the 2 remaining items and brings unread count to 0
    await page.evaluate(() => {
      window.__capturedRequests = [];
      window.__failingPatchIds.clear();
    });
    await page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click();
    await expect(page.getByText('2 thông báo chưa đọc')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.__unreadCountHistory.at(-1)), 0);
    const retryPatches = await page.evaluate(() =>
      window.__capturedRequests.filter((r) => r.method === 'PATCH').map((r) => r.url).sort()
    );
    assert.deepEqual(retryPatches, ['/notifications/m-unread-1/read', '/notifications/m-unread-35/read']);

    // Verify getUnreadNotificationCount reads meta.totalItems directly (supports 99+ tab badge threshold)
    const highUnreadCount = await page.evaluate(async () => {
      window.__mockHandlers['GET /notifications'] = (_body, config) => {
        if (config.params?.status === 'UNREAD' && config.params?.limit === 1) {
          return {
            __envelope: true,
            data: [{ notificationId: 'm-105', type: 'SYSTEM', title: 'Tin #105', status: 'UNREAD', createdAt: '2026-11-18T00:00:00.000Z' }],
            meta: { page: 1, limit: 1, totalItems: 105, totalPages: 105 }
          };
        }
        return { __envelope: true, data: [], meta: { page: 1, limit: 30, totalItems: 105, totalPages: 4 } };
      };
      return window.__helpers.getUnreadNotificationCount();
    });
    assert.equal(highUnreadCount, 105);
    assert.equal(highUnreadCount > 99 ? '99+' : highUnreadCount, '99+');

    // 5. Verify NovelDetailScreen chapter normalization ("Chương X: Chương X"), sort toggle, and single primary CTA
    await page.evaluate((novelId) => {
      window.__capturedRequests = [];
      window.__mockHandlers = {
        [`GET /reading/novels/${novelId}`]: () => ({
          novelId,
          authorId: 'a1',
          authorName: 'Tác giả Hàn Sơn',
          title: 'Kiếm Lai Phong',
          genre: 'Tiên hiệp',
          serialStatus: 'ONGOING',
          viewsCount: 1500,
          likesCount: 92,
          synopsis: 'Hành trình kiếm đạo giữa mây ngàn.',
          chapters: [
            { chapterId: 'ch-1', novelId, chapterNumber: 1, title: 'Chương 1: Hạt sương mai', isVip: false, priceCoins: 0, wordCount: 980 },
            { chapterId: 'ch-2', novelId, chapterNumber: 2, title: 'Chương 2: Tiếng chuông cổ', isVip: true, priceCoins: 20, wordCount: 1200 }
          ]
        }),
        'GET /reading/history/me': () => []
      };
      window.__mountNovelDetail(novelId);
    }, NOVEL_UUID);

    await expect(page.getByRole('button', { name: 'Đọc ngay' })).toBeVisible();
    await expect(page.getByText('Chương 1: Hạt sương mai')).toBeVisible();
    await expect(page.getByText('Chương 1: Chương 1: Hạt sương mai')).toHaveCount(0);
    await page.getByRole('button', { name: /Đang sắp xếp cũ đến mới/ }).click();
    await expect(page.getByRole('button', { name: /Đang sắp xếp mới đến cũ/ })).toBeVisible();

    // 6. Verify VIP Reader unlock only opens Wallet on insufficient coins, keeping network errors inline
    await page.evaluate((chapterId) => {
      window.__walletOpenedCount = 0;
      let unlockAttempt = 0;
      window.__mockHandlers = {
        [`GET /reading/chapters/${chapterId}`]: () => {
          throw new window.__helpers.ApiClientError({ status: 402, code: 'PAYMENT_002', message: 'Chapter unlock required' });
        },
        'GET /reading/preferences/me': () => ({ fontFamily: null, fontSize: 18, background: 'LIGHT', lineHeight: 1.8 }),
        [`POST /chapters/${chapterId}/unlock`]: () => {
          unlockAttempt += 1;
          if (unlockAttempt === 1) {
            throw new window.__helpers.ApiClientError({ status: 503, code: 'NETWORK_ERROR', message: 'Mất kết nối tạm thời' });
          }
          throw new window.__helpers.ApiClientError({ status: 402, code: 'PAYMENT_003', message: 'Insufficient Coins balance' });
        }
      };
      window.__mountReader(chapterId);
    }, CHAPTER_UUID);

    await expect(page.getByText('Chương VIP đang khóa')).toBeVisible();
    await page.getByRole('button', { name: 'Mở khóa chương' }).click();
    await expect(page.getByText(/Mất kết nối tạm thời/)).toBeVisible();
    assert.equal(await page.evaluate(() => window.__walletOpenedCount), 0, 'Network error must NOT jump to Wallet');

    await page.getByRole('button', { name: 'Mở khóa chương' }).click();
    assert.equal(await page.evaluate(() => window.__walletOpenedCount), 1, 'Insufficient coins error MUST open Wallet');

    // 7. Verify AuthScreen password visibility toggle and CommentsScreen author avatar/name rendering
    await page.evaluate(() => window.__mountAuth());
    const pwdInput = page.getByRole('textbox', { name: 'Mật khẩu' }).or(page.locator('input[aria-label="Mật khẩu"]'));
    assert.equal(await page.locator('input[aria-label="Mật khẩu"]').getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
    assert.equal(await page.locator('input[aria-label="Mật khẩu"]').getAttribute('type'), 'text');
    void pwdInput;

    await page.evaluate((chapterId) => {
      window.__mockHandlers = {
        [`GET /chapters/${chapterId}/comments`]: () => [
          {
            commentId: 'cm-1',
            chapterId,
            userId: 'u-2',
            displayName: 'Minh Nguyệt',
            avatarUrl: null,
            isAuthor: true,
            paragraphOffset: null,
            content: 'Chương này nhịp truyện rất cuốn!',
            status: 'APPROVED',
            createdAt: '2026-11-18T02:30:00.000Z'
          }
        ]
      };
      window.__mountComments(chapterId);
    }, CHAPTER_UUID);

    await expect(page.getByText('Minh Nguyệt')).toBeVisible();
    await expect(page.getByText('MN', { exact: true })).toBeVisible();
    await expect(page.getByText('Chương này nhịp truyện rất cuốn!')).toBeVisible();

    // 8. PR197-001: LibraryScreen renders sibling pressables (no nested buttons) and disabled "Bỏ lưu" never opens NovelDetail
    await page.evaluate(() => {
      window.__simulatedOS = 'web';
      window.__openedNovels = [];
      window.__capturedRequests = [];
      window.confirm = () => true;
      window.__deferredDelete = null;
      window.__mockHandlers = {
        'GET /reading/library/me': () => [
          {
            novelId: 'lib-1',
            authorId: 'a1',
            authorName: 'Tác giả Một',
            title: 'Trăng Trên Đỉnh Núi',
            genre: 'Tiên hiệp',
            chaptersCount: 24,
            viewsCount: 1200
          },
          {
            novelId: 'lib-2',
            authorId: 'a2',
            authorName: 'Tác giả Hai',
            title: 'Gió Mùa Thu Cũ',
            genre: 'Ngôn tình',
            chaptersCount: 15,
            viewsCount: 840
          }
        ],
        'DELETE /reading/library/me/lib-1': () =>
          new Promise((resolve) => {
            window.__deferredDelete = resolve;
          })
      };
      window.__mountLibrary();
    });

    await expect(page.getByRole('button', { name: 'Mở tác phẩm Trăng Trên Đỉnh Núi' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bỏ lưu Trăng Trên Đỉnh Núi' })).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.querySelectorAll('button button').length),
      0,
      'LibraryScreen must not render nested interactive buttons'
    );

    await page.getByRole('button', { name: 'Bỏ lưu Trăng Trên Đỉnh Núi' }).click();
    await expect(page.getByRole('button', { name: 'Bỏ lưu Trăng Trên Đỉnh Núi' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Bỏ lưu Gió Mùa Thu Cũ' })).toBeDisabled();

    // Tapping/clicking disabled "Bỏ lưu" (or its inner text node) must remain inert and never bubble to open NovelDetail
    await page.evaluate(() => {
      for (const label of ['Bỏ lưu Trăng Trên Đỉnh Núi', 'Bỏ lưu Gió Mùa Thu Cũ']) {
        const btn = document.querySelector(`button[aria-label="${label}"]`);
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        btn?.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    assert.deepEqual(
      await page.evaluate(() => window.__openedNovels),
      [],
      'Disabled "Bỏ lưu" must never fall through to onOpenNovel'
    );

    await page.evaluate(() => window.__deferredDelete?.({}));
    await expect(page.getByRole('button', { name: 'Mở tác phẩm Trăng Trên Đỉnh Núi' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mở tác phẩm Gió Mùa Thu Cũ' }).click();
    assert.deepEqual(await page.evaluate(() => window.__openedNovels), ['lib-2']);

    // 9. PR197-002 & PR197-003: ReportReasonModal state reset + 2000-char maxLength, and locked VIP sibling chapter navigation
    await page.evaluate((novelId) => {
      window.__simulatedOS = 'ios';
      window.__capturedRequests = [];
      window.__openedChapters = [];
      const chapters = [
        { chapterId: 'seq-ch-1', novelId, chapterNumber: 1, title: 'Khởi hành', content: 'Nội dung chương 1 miễn phí.', isVip: false, priceCoins: 0, wordCount: 500 },
        { chapterId: 'seq-ch-2', novelId, chapterNumber: 2, title: 'Mật thất khóa VIP', content: null, isVip: true, priceCoins: 30, wordCount: 650 },
        { chapterId: 'seq-ch-3', novelId, chapterNumber: 3, title: 'Chân trời mới', content: 'Nội dung chương 3 miễn phí.', isVip: false, priceCoins: 0, wordCount: 700 }
      ];
      window.__mockHandlers = {
        [`GET /reading/novels/${novelId}`]: () => ({
          novelId,
          authorId: 'a1',
          title: 'Hành Trình Vạn Dặm',
          chapters
        }),
        'GET /reading/chapters/seq-ch-1': () => chapters[0],
        'GET /reading/chapters/seq-ch-2': () => {
          throw new window.__helpers.ApiClientError({ status: 402, code: 'PAYMENT_002', message: 'Chapter unlock required' });
        },
        'GET /reading/chapters/seq-ch-3': () => chapters[2],
        'GET /reading/preferences/me': () => ({ fontFamily: null, fontSize: 18, background: 'LIGHT', lineHeight: 1.8 }),
        'PUT /reading/history/me': () => ({ synced: true }),
        'POST /reports': (body) => ({ reportId: 'rep-seq', status: 'PENDING', ...body })
      };
      window.__mountReader('seq-ch-1', novelId);
    }, NOVEL_UUID);

    await expect(page.getByText('Nội dung chương 1 miễn phí.')).toBeVisible();

    // Open report modal on ch-1: verify default state & maxLength=2000, cap >2000 chars, submit, and verify reset on reopen
    await page.getByRole('button', { name: 'Báo cáo chương' }).click();
    const reportDialog = page.getByRole('dialog');
    await expect(reportDialog).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Nội dung vi phạm' })).toHaveAttribute('aria-checked', 'true');
    const reportNoteInput = page.getByRole('textbox', { name: 'Ghi chú thêm (tùy chọn)' });
    await expect(reportNoteInput).toHaveValue('');
    await expect(reportNoteInput).toHaveAttribute('maxlength', '2000');

    const overlongText = 'A'.repeat(2050);
    await reportNoteInput.fill(overlongText);
    const cappedVal = await reportNoteInput.inputValue();
    assert.equal(cappedVal.length, 2000, 'Report description input must enforce 2000-character limit');

    await page.getByRole('radio', { name: 'Khác' }).click();
    await page.getByRole('button', { name: 'Gửi báo cáo' }).click();
    await expect(page.getByText('Đã gửi báo cáo chương.')).toBeVisible();

    const cappedReportReq = await page.evaluate(() =>
      window.__capturedRequests.filter((r) => r.method === 'POST' && r.url === '/reports').pop()
    );
    const parsedCappedReport = schemas.createReportSchema.parse({ body: cappedReportReq.body });
    assert.equal(parsedCappedReport.body.description?.length, 2000);

    // Reopen report modal -> must reset back to default reason + empty description; also test cancel -> reopen
    await page.getByRole('button', { name: 'Báo cáo chương' }).click();
    await expect(page.getByRole('radio', { name: 'Nội dung vi phạm' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('textbox', { name: 'Ghi chú thêm (tùy chọn)' })).toHaveValue('');
    await page.getByRole('radio', { name: 'Spam / Quảng cáo' }).click();
    await page.getByRole('textbox', { name: 'Ghi chú thêm (tùy chọn)' }).fill('Ghi chú tạm rồi hủy');
    await page.getByRole('button', { name: 'Hủy' }).click();
    await page.getByRole('button', { name: 'Báo cáo chương' }).click();
    await expect(page.getByRole('radio', { name: 'Nội dung vi phạm' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('textbox', { name: 'Ghi chú thêm (tùy chọn)' })).toHaveValue('');

    // Dirty the modal again, close, then navigate sequentially into locked VIP chapter 2 -> sibling nav must remain available!
    await page.getByRole('radio', { name: 'Bản quyền' }).click();
    await page.getByRole('textbox', { name: 'Ghi chú thêm (tùy chọn)' }).fill('Ghi chú chương 1 không được rò sang chương 3');
    await page.getByRole('button', { name: 'Hủy' }).click();

    await page.getByRole('button', { name: 'Chương tiếp' }).click();
    await expect(page.getByText('Chương VIP đang khóa')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chương trước' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Chương tiếp' })).toBeEnabled();

    // Reader can skip forward from locked VIP ch-2 to free ch-3
    await page.getByRole('button', { name: 'Chương tiếp' }).click();
    await expect(page.getByText('Nội dung chương 3 miễn phí.')).toBeVisible();

    // Report modal on ch-3 also starts clean
    await page.getByRole('button', { name: 'Báo cáo chương' }).click();
    await expect(page.getByRole('radio', { name: 'Nội dung vi phạm' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('textbox', { name: 'Ghi chú thêm (tùy chọn)' })).toHaveValue('');
    await page.getByRole('button', { name: 'Hủy' }).click();

    // Direct open onto locked VIP ch-2 with novelId also fetches novelChapters and renders sibling navigation
    await page.evaluate((novelId) => {
      window.__mountReader('seq-ch-2', novelId);
    }, NOVEL_UUID);
    await expect(page.getByText('Chương VIP đang khóa')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chương trước' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Chương tiếp' })).toBeEnabled();
    await page.getByRole('button', { name: 'Chương trước' }).click();
    await expect(page.getByText('Nội dung chương 1 miễn phí.')).toBeVisible();

    // 10. PR197-004: ReaderScreen aborts/ignores superseded getReaderChapter & getReaderNovel requests and preserves loading state
    await page.evaluate(() => {
      window.__capturedRequests = [];
      window.__deferredMap = {};
      const defer = (key) =>
        new Promise((resolve, reject) => {
          window.__deferredMap[key] = { resolve, reject };
        });

      window.__mockHandlers = {
        'GET /reading/chapters/race-ch-1': () => defer('chapter1'),
        'GET /reading/chapters/race-ch-2': () => defer('chapter2'),
        'GET /reading/novels/nov-stale': () => defer('novelStale'),
        'GET /reading/novels/nov-fresh': () => defer('novelFresh'),
        'GET /reading/preferences/me': () => ({ fontFamily: null, fontSize: 18, background: 'LIGHT', lineHeight: 1.8 }),
        'PUT /reading/history/me': () => ({ synced: true })
      };
      window.__mountReader('race-ch-1', 'nov-stale');
    });

    await expect(page.getByText('Đang tải chương truyện...')).toBeVisible();
    await page.waitForFunction(() =>
      window.__capturedRequests.some((r) => r.url === '/reading/chapters/race-ch-1')
    );

    // Switch to race-ch-2 while race-ch-1 is still in flight
    await page.evaluate(() => {
      window.__rerenderReader('race-ch-2', 'nov-fresh');
    });
    await page.waitForFunction(() =>
      window.__capturedRequests.some((r) => r.url === '/reading/chapters/race-ch-2')
    );

    assert.equal(
      await page.evaluate(
        () => window.__capturedRequests.find((r) => r.url === '/reading/chapters/race-ch-1')?.aborted
      ),
      true,
      'Superseded getReaderChapter request should have its AbortSignal aborted'
    );

    // Resolve stale race-ch-1 FIRST while race-ch-2 is still pending -> loading spinner must stay visible and stale content ignored
    await page.evaluate(() => {
      window.__deferredMap.chapter1.resolve({
        chapterId: 'race-ch-1',
        novelId: 'nov-stale',
        chapterNumber: 1,
        title: 'Chương cũ đã bị hủy',
        content: 'Nội dung chương cũ không được hiển thị.',
        isVip: false,
        priceCoins: 0,
        wordCount: 300
      });
    });
    await page.waitForTimeout(40);
    await expect(page.getByText('Đang tải chương truyện...')).toBeVisible();
    await expect(page.getByText('Nội dung chương cũ không được hiển thị.')).toHaveCount(0);

    // Now resolve race-ch-2 + nov-fresh, then resolve nov-stale late -> fresh chapter & sibling chapters must win
    await page.evaluate(() => {
      window.__deferredMap.chapter2.resolve({
        chapterId: 'race-ch-2',
        novelId: 'nov-fresh',
        chapterNumber: 1,
        title: 'Chương mới hợp lệ',
        content: 'Nội dung chương mới chính xác.',
        isVip: false,
        priceCoins: 0,
        wordCount: 450
      });
    });
    await expect(page.getByText('Nội dung chương mới chính xác.')).toBeVisible();

    await page.evaluate(() => {
      window.__deferredMap.novelFresh.resolve({
        novelId: 'nov-fresh',
        authorId: 'a1',
        title: 'Truyện Mới',
        chapters: [
          { chapterId: 'race-ch-2', novelId: 'nov-fresh', chapterNumber: 1, title: 'Chương mới hợp lệ', content: null, isVip: false, priceCoins: 0 },
          { chapterId: 'race-ch-3', novelId: 'nov-fresh', chapterNumber: 2, title: 'Chương tiếp hợp lệ', content: null, isVip: false, priceCoins: 0 }
        ]
      });
    });
    await expect(page.getByRole('button', { name: 'Chương tiếp' })).toBeEnabled();

    // Even if a stale getReaderNovel started before switching novels and resolves late, it cannot clobber nov-fresh's chapters
    await page.evaluate(() => {
      window.__capturedRequests = [];
      window.__deferredMap = {};
      const defer = (key) =>
        new Promise((resolve, reject) => {
          window.__deferredMap[key] = { resolve, reject };
        });

      window.__mockHandlers = {
        'GET /reading/chapters/race-ch-a': () => ({
          chapterId: 'race-ch-a',
          novelId: 'nov-stale-2',
          chapterNumber: 1,
          title: 'Chương A',
          content: 'Nội dung chương A.',
          isVip: false,
          priceCoins: 0,
          wordCount: 300
        }),
        'GET /reading/chapters/race-ch-b': () => ({
          chapterId: 'race-ch-b',
          novelId: 'nov-fresh-2',
          chapterNumber: 1,
          title: 'Chương B',
          content: 'Nội dung chương B mới nhất.',
          isVip: false,
          priceCoins: 0,
          wordCount: 400
        }),
        'GET /reading/novels/nov-stale-2': () => defer('novelStale2'),
        'GET /reading/novels/nov-fresh-2': () => ({
          novelId: 'nov-fresh-2',
          authorId: 'a2',
          title: 'Truyện Mới 2',
          chapters: [
            { chapterId: 'race-ch-b', novelId: 'nov-fresh-2', chapterNumber: 1, title: 'Chương B', content: null, isVip: false, priceCoins: 0 },
            { chapterId: 'race-ch-b2', novelId: 'nov-fresh-2', chapterNumber: 2, title: 'Chương B2', content: null, isVip: false, priceCoins: 0 }
          ]
        }),
        'GET /reading/preferences/me': () => ({ fontFamily: null, fontSize: 18, background: 'LIGHT', lineHeight: 1.8 }),
        'PUT /reading/history/me': () => ({ synced: true })
      };
      window.__mountReader('race-ch-a', 'nov-stale-2');
    });

    await expect(page.getByText('Nội dung chương A.')).toBeVisible();
    await page.waitForFunction(() =>
      window.__capturedRequests.some((r) => r.url === '/reading/novels/nov-stale-2')
    );

    await page.evaluate(() => {
      window.__rerenderReader('race-ch-b', 'nov-fresh-2');
    });
    await expect(page.getByText('Nội dung chương B mới nhất.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chương tiếp' })).toBeEnabled();

    assert.equal(
      await page.evaluate(
        () => window.__capturedRequests.find((r) => r.url === '/reading/novels/nov-stale-2')?.aborted
      ),
      true,
      'Superseded getReaderNovel request should have its AbortSignal aborted'
    );

    await page.evaluate(() => {
      window.__deferredMap.novelStale2.resolve({
        novelId: 'nov-stale-2',
        authorId: 'a0',
        title: 'Truyện Cũ 2',
        chapters: [{ chapterId: 'race-ch-a', novelId: 'nov-stale-2', chapterNumber: 1, title: 'Đơn độc', content: null, isVip: false, priceCoins: 0 }]
      });
    });
    await page.waitForTimeout(40);
    await expect(page.getByText('Nội dung chương B mới nhất.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chương tiếp' })).toBeEnabled();
  } finally {
    await browser.close();
  }
});

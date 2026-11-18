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
          export const TextInput = React.forwardRef(function TextInput({ value, onChangeText, placeholder, accessibilityLabel, onFocus, onBlur, editable = true, secureTextEntry }, ref) {
            return React.createElement('input', {
              ref,
              type: secureTextEntry ? 'password' : 'text',
              disabled: editable === false,
              value: value ?? '',
              placeholder,
              'aria-label': accessibilityLabel,
              onFocus: () => onFocus?.(),
              onBlur: () => onBlur?.(),
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
    import { apiClient, ApiClientError } from './src/api/api-client';
    import { StoryCraftThemeProvider } from './src/theme/ThemeProvider';
    import { ReaderScreen, resolveMobileReaderFontFamily, resolveReaderPaperTone } from './src/screens/ReaderScreen';
    import { NovelDetailScreen } from './src/screens/NovelDetailScreen';
    import { AuthScreen } from './src/screens/AuthScreen';
    import { CommentsScreen } from './src/screens/CommentsScreen';
    import { WalletScreen } from './src/screens/WalletScreen';
    import { ProfileScreen } from './src/screens/ProfileScreen';
    import { NotificationsScreen } from './src/screens/NotificationsScreen';
    import { lightColors } from './src/theme/colors';

    window.__helpers = { resolveMobileReaderFontFamily, resolveReaderPaperTone, lightPalette: lightColors, ApiClientError };
    window.__capturedRequests = [];
    window.__mockHandlers = {};
    window.__walletOpenedCount = 0;

    apiClient.defaults.adapter = async (config) => {
      const method = (config.method || 'get').toUpperCase();
      const key = method + ' ' + config.url;
      const parsedBody = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      window.__capturedRequests.push({ method, url: config.url, body: parsedBody, params: config.params });
      const handler = window.__mockHandlers[key];
      if (!handler) {
        throw new Error('Unhandled mock request: ' + key);
      }
      const data = await handler(parsedBody, config);
      return {
        data: { success: true, data, error: null, meta: {} },
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

    window.__mountReader = (chapterId) =>
      mountElement(
        React.createElement(ReaderScreen, {
          chapterId,
          authenticated: true,
          onLoginRequired: () => {},
          onOpenComments: () => {},
          onOpenWallet: () => {
            window.__walletOpenedCount += 1;
          }
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
      mountElement(React.createElement(CommentsScreen, { chapterId, authenticated: true, onLoginRequired: () => {} }));
    window.__mountWallet = () => mountElement(React.createElement(WalletScreen));
    window.__mountProfile = () => mountElement(React.createElement(ProfileScreen, { onLogout: () => {} }));
    window.__mountNotifications = () => mountElement(React.createElement(NotificationsScreen));
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
      () => window.__capturedRequests.filter((r) => r.method === 'GET' && r.url === '/notifications').length
    );
    assert.equal(getNotifCount, 1, 'Marking notification read must update in-place without refetching/unmounting list');

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
  } finally {
    await browser.close();
  }
});
